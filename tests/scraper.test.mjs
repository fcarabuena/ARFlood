// Tests for scripts/scrape-floods.js and its helpers, using saved sample pages
// (tests/fixtures: real responses saved 2026-10-29, plus two marked test fixtures).
// Run: npm test
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRobots, isAllowed } from '../scripts/lib/robots.mjs'
import { PoliteFetcher, USER_AGENT } from '../scripts/lib/http.mjs'
import { PlaceMatcher } from '../scripts/lib/places.mjs'
import { SOURCES, parseAtomFeed, parseCap, capToReports, parseBasinTable, parseRss, newsToReports, isFloodNews } from '../scripts/lib/sources.mjs'
import { scrape } from '../scripts/scrape-floods.js'

const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const matcher = new PlaceMatcher()
const NOW = new Date('2026-10-29T23:30:00+08:00')

/** Fake fetch serving fixtures by URL; records requests. */
function fakeFetch(routes) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, ua: init?.headers?.['User-Agent'] })
    const r = routes[url]
    if (r instanceof Error) throw r
    if (!r) return new Response('not found', { status: 404 })
    return new Response(typeof r === 'string' ? r : r.body, { status: r.status ?? 200 })
  }
  return { impl, calls }
}

describe('robots.txt', () => {
  test('Google News disallows /rss/search for us, allows the home page', () => {
    const g = parseRobots(fx('robots-news.google.com.txt'))
    assert.equal(isAllowed(g, 'FloodReadyBot', '/rss/search?q=baha').allowed, false)
    assert.equal(isAllowed(g, 'FloodReadyBot', '/').allowed, true)
    assert.equal(isAllowed(g, 'FloodReadyBot', '/topics/abc').allowed, true)
  })
  test('Rappler allows its feed for our bot but blocks named AI crawlers', () => {
    const r = parseRobots(fx('robots-www.rappler.com.txt'))
    assert.equal(isAllowed(r, 'FloodReadyBot', '/feed/').allowed, true)
    assert.equal(isAllowed(r, 'ClaudeBot', '/feed/').allowed, false)
  })
  test('empty Disallow allows all; longest rule wins; $ anchors', () => {
    assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:'), 'FloodReadyBot', '/x').allowed, true)
    const g = parseRobots('User-agent: *\nDisallow: /news\nAllow: /news/feed$')
    assert.equal(isAllowed(g, 'FloodReadyBot', '/news/feed').allowed, true)
    assert.equal(isAllowed(g, 'FloodReadyBot', '/news/feed/old').allowed, false)
  })
})

describe('PoliteFetcher', () => {
  test('requests each URL once, sends our User-Agent, and never requests disallowed pages', async () => {
    const { impl, calls } = fakeFetch({
      'https://a.test/robots.txt': 'User-agent: *\nDisallow: /private',
      'https://a.test/feed': '<rss/>',
    })
    const f = new PoliteFetcher({ fetchImpl: impl, minDelayMs: 0 })
    await f.get('https://a.test/feed')
    await f.get('https://a.test/feed') // second call: served from this run's memory
    await assert.rejects(f.get('https://a.test/private/x'), /disallowed by robots.txt/)
    assert.deepEqual(calls.map((c) => c.url), ['https://a.test/robots.txt', 'https://a.test/feed'])
    assert.match(calls[0].ua, /FloodReadyBot\/1\.0 \(\+https:\/\/fcarabuena\.github\.io\/ARFlood\//)
    assert.equal(USER_AGENT.includes('https://fcarabuena.github.io/ARFlood/'), true)
  })
  test('missing robots.txt (404) means allowed; unreachable (5xx) means disallowed', async () => {
    const { impl } = fakeFetch({ 'https://ok.test/p': 'x', 'https://down.test/robots.txt': { body: 'oops', status: 503 } })
    const f = new PoliteFetcher({ fetchImpl: impl, minDelayMs: 0 })
    assert.equal((await f.check('https://ok.test/p')).allowed, true)
    assert.equal((await f.check('https://down.test/p')).allowed, false)
  })
})

describe('place matching (bundled PSGC list)', () => {
  const names = (s) => matcher.match(s).map((p) => p.name)
  test('longest match and no shortening', () => {
    assert.deepEqual(names('Lubog ang kalye sa Quezon City at Maynila'), ['Quezon City', 'Manila'])
    assert.deepEqual(names('Floods in Cagayan de Oro and Cagayan'), ['Cagayan De Oro City', 'Cagayan'])
  })
  test('barangays only with their city', () => {
    assert.deepEqual(names('Flooding hits Marikina; Brgy. Tumana evacuated'), ['Tumana, Marikina City'])
    assert.deepEqual(names('Sto. Niño, Marikina residents told to evacuate'), ['Santo Niño, Marikina City'])
    assert.deepEqual(names('Brgy. Tumana evacuated'), []) // city unknown: no guess
  })
  test('ambiguous or risky names need context', () => {
    assert.deepEqual(names('Classes suspended in San Jose'), [])
    assert.deepEqual(names('Flooding in San Jose, Occidental Mindoro'), ['San Jose'])
    assert.deepEqual(names('Rizal Park visitors stranded'), [])
    assert.deepEqual(names('Floods in Bulacan towns'), ['Bulacan'])
  })
  test('PSGC codes from CAP geocodes resolve directly', () => {
    assert.equal(matcher.byPsgc('082600000').name, 'Eastern Samar')
    assert.equal(matcher.byPsgc('137402000').name, 'Marikina City')
  })
})

describe('PAGASA sources', () => {
  test('Atom feed lists CAP links', () => {
    const entries = parseAtomFeed(fx('pagasa-feed.xml'))
    assert.equal(entries.length, 51)
    assert.match(entries[0].capUrl, /^https:\/\/publicalert\.pagasa\.dost\.gov\.ph\/output\/gfa\/.+\.cap$/)
  })
  test('a final ("all clear") advisory produces no reports', () => {
    const cap = parseCap(fx('pagasa-gfa-final.cap'))
    assert.equal(capToReports(cap, { matcher, url: 'u', now: new Date(cap.sent) }).length, 0)
  })
  test('an active advisory gives one high-confidence report per area, with PSGC place and polygon', () => {
    const cap = parseCap(fx('pagasa-gfa-active.cap'))
    const reps = capToReports(cap, { matcher, url: 'u', now: new Date(cap.sent) })
    assert.deepEqual(reps.map((r) => r.place.name), ['Eastern Samar', 'Northern Samar', 'Southern Leyte', 'Leyte', 'Biliran', 'Samar'])
    assert.ok(reps.every((r) => r.confidence === 'high' && r.kind === 'official' && r.polygon.length > 2))
    assert.match(reps[0].excerpt, /^Eastern Samar - Rivers and its tributaries/)
  })
  test('feed entries older than 24 h are not even downloaded', async () => {
    const src = SOURCES.find((s) => s.id === 'pagasa-cap')
    const requested = []
    const fetcher = { get: async (u) => (requested.push(u), fx('pagasa-feed.xml')) }
    const r = await src.run({ fetcher, matcher, now: NOW }) // feed's newest entry is from Oct 26
    assert.deepEqual(requested, [src.url])
    assert.equal(r.reports.length, 0)
  })
  test('river basin table parses; only basins above "Non-Flood Watch" become reports', async () => {
    const html = fx('pagasa-flood.html')
    assert.equal(parseBasinTable(html).length, 22)
    const watched = html.replace(
      "class='non-flood'>Non-Flood Watch</a>\n                </td>\n            </tr>\n                        <tr>\n                                    <td>NCR/Pasig Marikina Laguna de Bay</td>",
      "class='flood-watch'>Flood Watch</a>\n                </td>\n            </tr>\n                        <tr>\n                                    <td>NCR/Pasig Marikina Laguna de Bay</td>"
    ).replace(/(<td>NCR\/Pasig Marikina Laguna de Bay<\/td>[\s\S]*?class=')non-flood('>)Non-Flood Watch/, '$1flood-watch$2Flood Watch')
    const src = SOURCES.find((s) => s.id === 'pagasa-basins')
    const r = await src.run({ fetcher: { get: async () => watched }, matcher, now: NOW })
    assert.ok(r.reports.some((x) => x.place.name === 'Marikina City' && /Flood Watch/.test(x.headline)))
    assert.throws(() => parseBasinTable('<html>redesigned</html>'), /layout changed/)
  })
})

describe('news', () => {
  test('saved real feeds parse with links and dates', () => {
    for (const f of ['live/newsinfo.inquirer.net_feed', 'live/www.rappler.com_feed_', 'live/data.gmanetwork.com_gno_rss_news_feed.xml', 'live/www.philstar.com_rss_nation']) {
      const items = parseRss(fx(f))
      assert.ok(items.length > 0, f)
      assert.ok(items.every((i) => /^https:\/\//.test(i.link) && Number.isFinite(Date.parse(i.pubDate))), f)
    }
  })
  test('flood words, not "flood control" or "bahay"', () => {
    assert.equal(isFloodNews('Malabon binaha'), true)
    assert.equal(isFloodNews('Flood control scam probe widens'), false)
    assert.equal(isFloodNews('Bagong bahay sa Marikina'), false)
    assert.equal(isFloodNews('Flood control project fails as floods hit Bulacan'), true)
  })
  test('sample feed: fresh flood items with known places only', () => {
    const { reports } = newsToReports(parseRss(fx('news-sample.rss')), { matcher, now: NOW, source: { id: 'sample', publisher: 'Sample' } })
    assert.deepEqual(
      reports.map((r) => `${r.place.name}|${r.place.level}`).sort(),
      ['Malabon City|city', 'Navotas City|city', 'Tumana, Marikina City|barangay'].sort()
    )
    assert.ok(reports.every((r) => r.confidence === 'medium' && r.kind === 'news'))
  })
})

describe('whole run', () => {
  test('a broken source is logged and skipped; the others still count; robots-blocked sources are skipped', async () => {
    const ok = { id: 'ok', name: 'OK source', run: async () => ({ reports: [{ id: 'r1', publishedAt: NOW.toISOString() }, { id: 'old', publishedAt: '2026-10-20T00:00:00Z' }], found: 2, note: 'fine' }) }
    const broken = { id: 'broken', name: 'Broken source', run: async () => { throw new Error('HTTP 500') } }
    const blocked = { id: 'blocked', name: 'Blocked source', run: async () => ({ skipped: true, reason: 'disallowed by robots.txt (Disallow: /)' }) }
    const logs = []
    const res = await scrape({ sources: [broken, ok, blocked], fetcher: {}, matcher, now: NOW, log: (l) => logs.push(l) })
    assert.deepEqual(res.sources.map((s) => s.status), ['error', 'ok', 'skipped'])
    assert.deepEqual(res.reports.map((r) => r.id), ['r1']) // the 10-day-old one is dropped
    assert.ok(logs.some((l) => /Broken source: ERROR \(HTTP 500\)/.test(l)))
  })
  test('all real sources against saved pages, offline', async () => {
    const live = (f) => fx(`live/${f}`)
    const routes = {
      'https://publicalert.pagasa.dost.gov.ph/robots.txt': { body: 'nf', status: 404 },
      'https://publicalert.pagasa.dost.gov.ph/feeds/': live('publicalert.pagasa.dost.gov.ph_feeds_'),
      'https://www.pagasa.dost.gov.ph/robots.txt': { body: 'nf', status: 404 },
      'https://www.pagasa.dost.gov.ph/flood': live('www.pagasa.dost.gov.ph_flood'),
      'https://news.google.com/robots.txt': live('news.google.com_robots.txt'),
      'https://newsinfo.inquirer.net/robots.txt': live('newsinfo.inquirer.net_robots.txt'),
      'https://newsinfo.inquirer.net/feed': live('newsinfo.inquirer.net_feed'),
      'https://www.rappler.com/robots.txt': live('www.rappler.com_robots.txt'),
      'https://www.rappler.com/feed/': live('www.rappler.com_feed_'),
      'https://data.gmanetwork.com/robots.txt': { body: 'nf', status: 404 },
      'https://data.gmanetwork.com/gno/rss/news/feed.xml': live('data.gmanetwork.com_gno_rss_news_feed.xml'),
      'https://www.philstar.com/robots.txt': live('www.philstar.com_robots.txt'),
      'https://www.philstar.com/rss/nation': new Error('connection reset'), // simulate one source breaking
    }
    const { impl, calls } = fakeFetch(routes)
    const res = await scrape({ fetcher: new PoliteFetcher({ fetchImpl: impl, minDelayMs: 0 }), matcher, now: NOW, log: () => {} })
    const status = Object.fromEntries(res.sources.map((s) => [s.id, s.status]))
    assert.deepEqual(status, { 'pagasa-cap': 'ok', 'pagasa-basins': 'ok', 'google-news': 'skipped', inquirer: 'ok', rappler: 'ok', gma: 'ok', philstar: 'error' })
    assert.ok(!calls.some((c) => c.url.startsWith('https://news.google.com/rss')), 'never requests Google News RSS')
    assert.equal(new Set(calls.map((c) => c.url)).size, calls.length, 'each URL requested at most once')
    assert.ok(res.reports.some((r) => r.place.name === 'Dagupan City' && r.source === 'GMA News'))
  })
})
