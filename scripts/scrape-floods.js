// Collects recent flood reports for Live Mode's "Reported flooding" layer and
// writes public/flood-reports.json. Runs every 30 min in GitHub Actions
// (.github/workflows/flood-reports.yml); also runnable locally:
//
//   node scripts/scrape-floods.js              # fetch and write if changed
//   node scripts/scrape-floods.js --dry-run    # fetch and print, don't write
//   node scripts/scrape-floods.js --save-fixtures tests/fixtures/live
//
// Rules: robots.txt is checked for every site and disallowed sources are
// skipped; each URL is requested at most once per run; the bot identifies
// itself with a User-Agent containing the app URL; a failing source is logged
// and skipped, the others still count.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PoliteFetcher, USER_AGENT } from './lib/http.mjs'
import { PlaceMatcher } from './lib/places.mjs'
import { SOURCES } from './lib/sources.mjs'

const WINDOW_HOURS = 24
const HEARTBEAT_HOURS = 6 // rewrite at least this often so the app can show "checked recently"

/** Runs all sources; never throws because of a single source. */
export async function scrape({ sources = SOURCES, fetcher, matcher, now = new Date(), log = console.log }) {
  const results = []
  const reports = new Map()
  const notices = new Map()
  for (const source of sources) {
    const started = Date.now()
    const base = { id: source.id, name: source.name, kind: source.kind, confidence: source.confidence, url: source.url ?? source.urls?.[0], terms: source.terms }
    try {
      const r = await source.run({ fetcher, matcher, now })
      if (r.skipped) {
        results.push({ ...base, status: 'skipped', reason: r.reason, reports: 0 })
        log(`- ${source.name}: SKIPPED (${r.reason})`)
        continue
      }
      for (const rep of r.reports ?? []) reports.set(rep.id, rep)
      for (const n of r.notices ?? []) notices.set(n.id, n)
      results.push({ ...base, status: 'ok', found: r.found, reports: (r.reports ?? []).length, note: r.note, ms: Date.now() - started })
      log(`- ${source.name}: ok, ${r.note}`)
    } catch (err) {
      const status = err.robots ? 'skipped' : 'error'
      results.push({ ...base, status, reason: err.message, reports: 0 })
      log(`- ${source.name}: ${status.toUpperCase()} (${err.message})`)
    }
  }
  const cutoff = now.getTime() - WINDOW_HOURS * 3600 * 1000
  const keep = (r) => Date.parse(r.publishedAt) >= cutoff
  const byTime = (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id)
  return {
    reports: [...reports.values()].filter(keep).sort(byTime),
    notices: [...notices.values()].filter(keep).sort(byTime),
    sources: results,
  }
}

const comparable = (doc) => JSON.stringify({ r: doc?.reports ?? [], n: doc?.notices ?? [] })

export function buildDocument(result, now) {
  return {
    generatedAt: now.toISOString(),
    windowHours: WINDOW_HOURS,
    disclaimer:
      'Automatically collected from PAGASA advisories and news headlines. Reports may be incomplete, outdated or imprecisely located. Always follow official advisories from PAGASA, NDRRMC and your LGU.',
    userAgent: USER_AGENT,
    sources: result.sources,
    reports: result.reports,
    notices: result.notices,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const opt = (name) => {
    const i = args.indexOf(`--${name}`)
    return i < 0 ? undefined : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true
  }
  const root = fileURLToPath(new URL('..', import.meta.url))
  const out = typeof opt('out') === 'string' ? opt('out') : `${root}public/flood-reports.json`
  const now = typeof opt('now') === 'string' ? new Date(opt('now')) : new Date()
  const saveDir = typeof opt('save-fixtures') === 'string' ? opt('save-fixtures') : null

  let fetchImpl = globalThis.fetch
  if (saveDir) {
    mkdirSync(saveDir, { recursive: true })
    fetchImpl = async (url, init) => {
      const res = await globalThis.fetch(url, init)
      const body = await res.text()
      const name = url.replace(/^https?:\/\//, '').replace(/[^\w.-]+/g, '_').slice(0, 120)
      writeFileSync(`${saveDir}/${name}`, body)
      return new Response(body, { status: res.status, headers: res.headers })
    }
  }

  console.log(`Flood reports scrape at ${now.toISOString()} as "${USER_AGENT}"`)
  const fetcher = new PoliteFetcher({ fetchImpl })
  const result = await scrape({ fetcher, matcher: new PlaceMatcher(), now })
  console.log(`\n${result.reports.length} report(s), ${result.notices.length} unlocated notice(s) within ${WINDOW_HOURS} h; ${fetcher.requested.length} HTTP requests:`)
  for (const u of fetcher.requested) console.log(`  GET ${u}`)

  const errors = result.sources.filter((s) => s.status === 'error')
  // GitHub Actions annotations + job summary (ignored when run locally).
  if (process.env.GITHUB_ACTIONS) {
    for (const s of errors) console.log(`::warning title=Flood source failed::${s.name}: ${s.reason}`)
    for (const s of result.sources.filter((x) => x.status === 'skipped')) console.log(`::notice title=Flood source skipped::${s.name}: ${s.reason}`)
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = result.sources.map((s) => `| ${s.name} | ${s.status} | ${s.reports} | ${(s.note || s.reason || '').replace(/\|/g, '/')} |`)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Flood reports\n\n| Source | Status | Reports | Details |\n|---|---|---|---|\n${rows.join('\n')}\n`)
  }

  if (opt('dry-run')) {
    console.log(JSON.stringify(result.reports.slice(0, 5), null, 1))
    return
  }
  if (errors.length === result.sources.length) {
    console.log('\nEvery source failed: keeping the existing file unchanged.')
    return
  }
  let existing = null
  try {
    existing = JSON.parse(readFileSync(out, 'utf8'))
  } catch {
    // first run
  }
  const doc = buildDocument(result, now)
  const stale = !existing?.generatedAt || now - new Date(existing.generatedAt) > HEARTBEAT_HOURS * 3600 * 1000
  if (!opt('force') && existing && comparable(existing) === comparable(doc) && !stale) {
    console.log('\nNo change in reports: file left as is.')
    return
  }
  writeFileSync(out, JSON.stringify(doc, null, 1) + '\n')
  console.log(`\nWrote ${out.replace(root, '')}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Unexpected bug (not a source failure): report, but don't break the schedule.
    console.error(err)
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Flood scraper crashed::${err.message}`)
    process.exitCode = 1
  })
}
