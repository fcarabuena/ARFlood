// Flood report sources. Each source has a run(ctx) that returns
// { reports, notices, found, note } and pure parse helpers that the tests use
// with saved sample pages (tests/fixtures).
import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false, // keep codes like "082600000" as text (leading zero)
  isArray: (name) => ['entry', 'item', 'info', 'area', 'polygon', 'geocode', 'link', 'parameter'].includes(name),
})

const DAY_MS = 24 * 3600 * 1000
const text = (v) => (v == null ? '' : Array.isArray(v) ? text(v[0]) : typeof v === 'object' ? String(v['#text'] ?? v['@_href'] ?? '') : String(v))
const stripHtml = (s) =>
  String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#822[01];|&[lr]dquo;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
const excerpt = (s, max = 220) => (s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s)
const reportId = (...parts) => createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12)
const fresh = (iso, now) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t <= now.getTime() + 5 * 60000 && now.getTime() - t <= DAY_MS
}

// ---------------------------------------------------------------------------
// PAGASA public alerts: Atom feed of CAP messages (General Flood Advisories,
// rainfall warnings, ...). The feed states: "Licensed under CC BY 4.0".
// ---------------------------------------------------------------------------

export function parseAtomFeed(body) {
  const feed = xml.parse(body).feed
  if (!feed) throw new Error('not an Atom feed')
  return (feed.entry ?? []).map((e) => ({
    id: text(e.id),
    title: text(e.title).replace(/\s+/g, ' ').trim(),
    updated: text(e.updated),
    capUrl:
      (e.link ?? []).find((l) => /cap\+xml/.test(l['@_type'] ?? '') || /\.cap$/.test(l['@_href'] ?? ''))?.['@_href'] ??
      (e.link ?? [])[0]?.['@_href'] ??
      null,
  }))
}

function parsePolygon(s) {
  const pts = String(s)
    .trim()
    .split(/\s+/)
    .map((p) => p.split(',').map(Number))
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  // Keep at most ~80 points (enough for "am I inside this province?").
  const step = Math.max(1, Math.ceil(pts.length / 80))
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(([lat, lon]) => [+lat.toFixed(4), +lon.toFixed(4)])
}

export function parseCap(body) {
  const a = xml.parse(body).alert
  if (!a) throw new Error('not a CAP alert')
  return {
    identifier: text(a.identifier),
    sent: text(a.sent),
    status: text(a.status),
    msgType: text(a.msgType),
    info: (a.info ?? []).map((i) => ({
      event: text(i.event),
      headline: text(i.headline),
      description: text(i.description),
      responseType: text(i.responseType),
      urgency: text(i.urgency),
      severity: text(i.severity),
      expires: text(i.expires),
      areas: (i.area ?? []).map((ar) => ({
        desc: text(ar.areaDesc),
        polygons: (ar.polygon ?? []).map(parsePolygon),
        geocodes: (ar.geocode ?? []).map((g) => ({ name: text(g.valueName), value: text(g.value) })),
      })),
    })),
  }
}

const FLOOD_ALERT = /flood|rainfall|GFA/i

/** Reports for one CAP message (skips tests, cancellations and "all clear"/ended advisories). */
export function capToReports(cap, { matcher, url, now, sourceName = 'PAGASA' }) {
  const reports = []
  if (cap.status !== 'Actual' || cap.msgType === 'Cancel') return reports
  for (const info of cap.info) {
    if (!FLOOD_ALERT.test(info.event)) continue
    if (info.responseType === 'AllClear' || info.urgency === 'Past') continue
    if (info.expires && Date.parse(info.expires) < now.getTime()) continue
    const lines = info.description.split(/\n/).map((l) => l.replace(/\*\*/g, '').replace(/^\s*\+\s*/, '').trim())
    for (const area of info.areas) {
      const code = area.geocodes.find((g) => /SAME|PSGC/i.test(g.name))?.value
      const place = (code && matcher.byPsgc(code)) || matcher.match(area.desc)[0]
      if (!place) continue
      const line = lines.find((l) => l.toLowerCase().startsWith(area.desc.toLowerCase())) || lines.find((l) => l.includes(area.desc))
      reports.push({
        id: reportId('pagasa-cap', cap.identifier, place.psgc),
        kind: 'official',
        confidence: 'high',
        place: { ...place, lat: undefined, lon: undefined },
        lat: place.lat,
        lon: place.lon,
        polygon: area.polygons[0]?.length > 2 ? area.polygons[0] : undefined,
        source: sourceName,
        sourceUrl: url,
        headline: `${info.event}: ${area.desc}`,
        excerpt: excerpt(line || info.description.replace(/\s+/g, ' ')),
        publishedAt: new Date(cap.sent).toISOString(),
        expiresAt: info.expires ? new Date(info.expires).toISOString() : undefined,
      })
    }
  }
  return reports
}

const pagasaCap = {
  id: 'pagasa-cap',
  name: 'PAGASA public alerts (CAP feed)',
  kind: 'official',
  confidence: 'high',
  terms: 'Feed states "Licensed under CC BY 4.0"; no robots.txt (HTTP 404 = no restrictions)',
  url: 'https://publicalert.pagasa.dost.gov.ph/feeds/',
  async run({ fetcher, matcher, now }) {
    const entries = parseAtomFeed(await fetcher.get(this.url))
    const recent = entries.filter((e) => FLOOD_ALERT.test(e.title) && fresh(e.updated, now) && e.capUrl)
    const reports = []
    for (const e of recent) {
      const cap = parseCap(await fetcher.get(e.capUrl))
      reports.push(...capToReports(cap, { matcher, url: e.capUrl, now }))
    }
    return {
      reports,
      found: entries.length,
      note: `${entries.length} alerts in feed, ${recent.length} flood/rainfall alerts from the last 24 h${recent.length ? `, ${reports.length} still active area(s)` : ''}`,
    }
  },
}

// ---------------------------------------------------------------------------
// PAGASA river basin status table on https://www.pagasa.dost.gov.ph/flood
// ---------------------------------------------------------------------------

export function parseBasinTable(html) {
  const start = html.indexOf('Basin Hydrological Forecast')
  if (start < 0) throw new Error('river basin table not found (page layout changed?)')
  const section = html.slice(start, html.indexOf('</table>', start))
  const rows = []
  const re = /<tr>\s*<td>([^<]+)<\/td>\s*<td[^>]*>\s*<a href='([^']*)'[^>]*class='([^']*)'[^>]*>([^<]+)<\/a>/g
  let m
  while ((m = re.exec(section))) rows.push({ basin: m[1].trim(), url: m[2], cls: m[3], status: m[4].trim() })
  if (!rows.length) throw new Error('river basin table has no rows (page layout changed?)')
  return rows
}

const pagasaBasins = {
  id: 'pagasa-basins',
  name: 'PAGASA river basin flood status',
  kind: 'official',
  confidence: 'high',
  terms: 'Public PAGASA page; no robots.txt (HTTP 404 = no restrictions)',
  url: 'https://www.pagasa.dost.gov.ph/flood',
  async run({ fetcher, matcher, now }) {
    const rows = parseBasinTable(await fetcher.get(this.url))
    const active = rows.filter((r) => !/non-flood/i.test(r.status))
    const reports = []
    const notices = []
    for (const r of active) {
      const link = new URL(r.url, this.url).href
      const places = matcher.match(r.basin.replace(/\//g, ', '))
      const base = {
        kind: 'official',
        confidence: 'high',
        source: 'PAGASA',
        sourceUrl: link,
        headline: `${r.basin} river basin: ${r.status}`,
        excerpt: `PAGASA basin hydrological forecast status for the ${r.basin} river basin is "${r.status}".`,
        publishedAt: now.toISOString(), // current status at the time of checking
      }
      if (!places.length) notices.push({ id: reportId('pagasa-basins', r.basin), ...base })
      for (const p of places) reports.push({ id: reportId('pagasa-basins', r.basin, p.psgc), ...base, place: { ...p, lat: undefined, lon: undefined }, lat: p.lat, lon: p.lon })
    }
    return { reports, notices, found: rows.length, note: `${rows.length} basins, ${active.length} not at "Non-Flood Watch"` }
  },
}

// ---------------------------------------------------------------------------
// News (RSS). Medium confidence. Only headline, a short excerpt and the link
// are kept, which is what RSS feeds are published for.
// ---------------------------------------------------------------------------

export function parseRss(body) {
  const ch = xml.parse(body).rss?.channel
  if (!ch) throw new Error('not an RSS feed')
  return (ch.item ?? []).map((i) => ({
    title: stripHtml(text(i.title)),
    link: text(i.link).trim() || text(i.guid).trim(),
    description: stripHtml(text(i.description)),
    pubDate: text(i.pubDate),
    sourceName: text(i.source) || undefined, // Google News puts the publisher here
  }))
}

// English + Filipino flood words, as whole words ("baha" but not "bahay").
const FLOOD_WORDS = /\b(flood(s|ed|ing|waters?)?|baha|binaha|bumaha|binabaha|pagbaha|lubog|nalubog|lumubog|inundat(ed|ion))\b/i
// Mentions that are about projects/politics, not water on the ground.
const NOT_FLOODING = /\bflood[\s-]*(control|mitigation|management|protection|projects?|funds?|scam|kickbacks?|anomal\w*|probe|insertions?)\b/gi

/** True if the text talks about actual flooding (not only "flood control" projects etc.). */
export function isFloodNews(s) {
  return FLOOD_WORDS.test(String(s).replace(NOT_FLOODING, ' '))
}

export function newsToReports(items, { matcher, now, source }) {
  const reports = []
  let floodItems = 0
  for (const it of items) {
    const all = `${it.title}. ${it.description}`
    const t = Date.parse(it.pubDate)
    // Items without a valid date can't be checked against the 24 h window: skip.
    // Only plain web links are kept (no javascript:, data: etc. from a broken feed).
    if (!isFloodNews(all) || !Number.isFinite(t) || !/^https?:\/\//i.test(it.link)) continue
    const published = new Date(t).toISOString()
    if (!fresh(published, now)) continue
    floodItems++
    for (const p of matcher.match(all).slice(0, 5)) {
      reports.push({
        id: reportId(source.id, it.link, p.psgc),
        kind: 'news',
        confidence: 'medium',
        place: { ...p, lat: undefined, lon: undefined },
        lat: p.lat,
        lon: p.lon,
        source: it.sourceName || source.publisher,
        sourceUrl: it.link,
        headline: it.title,
        excerpt: excerpt(it.description),
        publishedAt: published,
      })
    }
  }
  return { reports, floodItems }
}

function rssSource({ id, name, publisher, url, terms }) {
  return {
    id,
    name,
    publisher,
    kind: 'news',
    confidence: 'medium',
    terms,
    url,
    async run({ fetcher, matcher, now }) {
      const items = parseRss(await fetcher.get(url))
      const { reports, floodItems } = newsToReports(items, { matcher, now, source: this })
      return { reports, found: items.length, note: `${items.length} items, ${floodItems} about flooding in the last 24 h, ${reports.length} place match(es)` }
    },
  }
}

// Google News RSS search. Its robots.txt disallows /rss for all crawlers, so
// this source is checked and skipped every run (kept so the check is visible).
const GOOGLE_TERMS = ['flood Philippines', 'baha', 'pagbaha', 'lubog baha']
const googleNews = {
  id: 'google-news',
  name: 'Google News RSS search',
  publisher: 'Google News',
  kind: 'news',
  confidence: 'medium',
  terms: 'robots.txt: "Disallow: /" for all agents, with no Allow for /rss',
  urls: GOOGLE_TERMS.map((q) => `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:1d`)}&hl=en-PH&gl=PH&ceid=PH:en`),
  async run({ fetcher, matcher, now }) {
    const check = await fetcher.check(this.urls[0])
    if (!check.allowed) return { skipped: true, reason: check.reason }
    const reports = []
    let found = 0
    for (const u of this.urls) {
      const items = parseRss(await fetcher.get(u))
      found += items.length
      reports.push(...newsToReports(items, { matcher, now, source: this }).reports)
    }
    return { reports, found, note: `${found} items from ${this.urls.length} searches` }
  },
}

export const SOURCES = [
  pagasaCap,
  pagasaBasins,
  googleNews,
  rssSource({
    id: 'inquirer',
    name: 'Inquirer.net news (RSS)',
    publisher: 'Inquirer.net',
    url: 'https://newsinfo.inquirer.net/feed',
    terms: 'robots.txt allows /feed; headline + excerpt + link only',
  }),
  rssSource({
    id: 'rappler',
    name: 'Rappler (RSS)',
    publisher: 'Rappler',
    url: 'https://www.rappler.com/feed/',
    terms: 'robots.txt allows /feed/ for general bots; headline + excerpt + link only',
  }),
  rssSource({
    id: 'gma',
    name: 'GMA News (RSS)',
    publisher: 'GMA News',
    url: 'https://data.gmanetwork.com/gno/rss/news/feed.xml',
    terms: 'no robots.txt on data.gmanetwork.com (HTTP 404); headline + excerpt + link only',
  }),
  rssSource({
    id: 'philstar',
    name: 'Philstar Nation (RSS)',
    publisher: 'Philstar',
    url: 'https://www.philstar.com/rss/nation',
    terms: 'robots.txt allows /rss/; headline + excerpt + link only',
  }),
]
