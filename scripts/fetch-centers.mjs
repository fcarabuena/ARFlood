// Fetches evacuation-relevant places from OpenStreetMap ONCE and bundles them
// with the app as public/osm-centers-snapshot.json (works offline, no live
// Overpass needed). See "OpenStreetMap snapshot" in README.md.
//
//   npm run fetch-centers -- --area "Marikina"
//   npm run fetch-centers -- --lat 14.6507 --lon 121.1029 --radius 5000
//   npm run fetch-centers -- --import export.json --area "Marikina"   (overpass-turbo export)
//
// Options: --relation <OSM relation id>  --max-minutes <n> (default 5)
//          --out <file>  --print-query
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildQuery, parseElements, bbox } from '../src/live/osm.js'

const USER_AGENT = 'FloodReadyAR/1.0 (fetch-centers script; https://github.com/fcarabuena/ARFlood)'
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const ATTEMPT_SECONDS = 90 // per request; one city's query normally answers in a few seconds
const root = fileURLToPath(new URL('..', import.meta.url))

// ---- arguments ---------------------------------------------------------------
const args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const key = a.slice(2)
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) args[key] = true
  else args[key] = argv[++i]
}
const out = args.out ? String(args.out) : `${root}public/osm-centers-snapshot.json`
const maxMinutes = Number(args['max-minutes'] ?? 5)

function fail(msg) {
  console.error(`✖ ${msg}`)
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- where -------------------------------------------------------------------
async function geocode(name) {
  const q = /,/.test(name) ? name : `${name}, Philippines`
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } })
  if (!res.ok) fail(`Nominatim answered ${res.status}. Try --lat/--lon/--radius instead.`)
  const results = await res.json()
  if (!results.length) fail(`No place called "${q}" found. Check the spelling, or use --lat/--lon/--radius.`)
  console.log(`Nominatim matches for "${q}":`)
  results.forEach((r, i) => console.log(`  ${i + 1}. ${r.osm_type} ${r.osm_id}  ${r.category}/${r.type}  ${r.display_name}`))
  const boundary = results.find((r) => r.osm_type === 'relation' && (r.category === 'boundary' || r.type === 'administrative'))
  return { boundary, first: results[0] }
}

async function resolveScope() {
  if (args.relation) {
    const id = Number(args.relation)
    return { scope: { areaId: 3600000000 + id }, area: { name: args.area ? String(args.area) : `OSM relation ${id}`, relation: id } }
  }
  if (args.lat !== undefined && args.lon !== undefined) {
    const lat = Number(args.lat)
    const lon = Number(args.lon)
    const radius = Math.min(Number(args.radius ?? 5000), 25000)
    if (!isFinite(lat) || !isFinite(lon)) fail('--lat and --lon must be numbers, e.g. --lat 14.6507 --lon 121.1029')
    return {
      scope: { around: { lat, lon, radius, schoolRadius: radius } },
      area: { name: args.area ? String(args.area) : `${radius / 1000} km around ${lat}, ${lon}`, center: { lat, lon }, radius },
    }
  }
  if (args.area && args.area !== true) {
    const { boundary, first } = await geocode(String(args.area))
    if (boundary) {
      console.log(`→ Using the boundary of: ${boundary.display_name} (relation ${boundary.osm_id})`)
      console.log('  Wrong place? Re-run with --relation <id> from the list above.\n')
      return {
        scope: { areaId: 3600000000 + Number(boundary.osm_id) },
        area: { name: boundary.display_name.split(',')[0], relation: Number(boundary.osm_id), displayName: boundary.display_name },
      }
    }
    const lat = Number(first.lat)
    const lon = Number(first.lon)
    const radius = Math.min(Number(args.radius ?? 5000), 25000)
    console.log(`→ No boundary found; using ${radius / 1000} km around ${first.display_name}\n`)
    return { scope: { around: { lat, lon, radius, schoolRadius: radius } }, area: { name: String(args.area), center: { lat, lon }, radius } }
  }
  fail('Tell me where: --area "Marikina"  or  --lat 14.65 --lon 121.10 --radius 5000  (or --import <file> --area "<name>")')
}

// ---- Overpass with patient retries ----------------------------------------------
async function runOverpass(query) {
  const deadline = Date.now() + maxMinutes * 60000
  let attempt = 0
  let lastError = ''
  while (Date.now() < deadline) {
    const endpoint = OVERPASS[attempt % OVERPASS.length]
    attempt++
    process.stdout.write(`Attempt ${attempt}: ${new URL(endpoint).host} … `)
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), Math.max(10000, Math.min(ATTEMPT_SECONDS * 1000, deadline - Date.now())))
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: ctrl.signal,
      })
      clearTimeout(timer)
      const text = await res.text()
      if (!res.ok) throw new Error(`HTTP ${res.status}${/capacity/i.test(text) ? ' (server at capacity)' : ''}`)
      const json = JSON.parse(text)
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark.slice(0, 120))
      console.log(`ok (${json.elements.length} elements)`)
      return json
    } catch (err) {
      lastError = err.name === 'AbortError' ? 'no answer in time' : err.message
      // Exponential backoff, as the Overpass servers ask: 10 s, 20 s, 40 s, 60 s, 60 s…
      const wait = Math.min(60, 10 * 2 ** Math.floor((attempt - 1) / OVERPASS.length)) * 1000
      const left = deadline - Date.now()
      console.log(`failed: ${lastError}${left > wait ? `; retrying in ${wait / 1000} s` : ''}`)
      if (left <= wait) break
      await sleep(wait)
    }
  }
  return { error: lastError }
}

// ---- import an overpass-turbo export -------------------------------------------
function readExport(file) {
  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    fail(`Could not read ${file} as JSON (${err.message}). In overpass-turbo use Export → "raw OSM data" (or GeoJSON).`)
  }
  if (Array.isArray(json.elements)) return json.elements
  if (Array.isArray(json.features)) {
    // GeoJSON export: turn features back into Overpass-like elements.
    return json.features.map((f) => {
      const [type, id] = String(f.id ?? f.properties?.['@id'] ?? 'node/0').split('/')
      let coords = f.geometry?.coordinates
      if (f.geometry?.type !== 'Point') {
        const flat = JSON.stringify(coords).match(/-?\d+\.?\d*/g).map(Number)
        const xs = flat.filter((_, i) => i % 2 === 0)
        const ys = flat.filter((_, i) => i % 2 === 1)
        coords = [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length]
      }
      const tags = { ...f.properties }
      delete tags['@id']
      return { type, id: Number(id), lat: coords[1], lon: coords[0], tags }
    })
  }
  fail(`${file} has no "elements" or "features". In overpass-turbo use Export → "raw OSM data".`)
}

// ---- write the snapshot ------------------------------------------------------------
function save(centers, area, how) {
  const box = bbox(centers)
  const snapshot = {
    _about:
      'Generated by "npm run fetch-centers". Places from OpenStreetMap that are often used as evacuation sites; NOT verified evacuation centers. Data © OpenStreetMap contributors, ODbL 1.0.',
    fetchedAt: new Date().toISOString(),
    method: how,
    area: { ...area, bbox: box },
    source: 'OpenStreetMap contributors via Overpass API',
    licence: 'ODbL 1.0',
    count: centers.length,
    centers,
  }
  writeFileSync(out, JSON.stringify(snapshot, null, 1) + '\n')
  const kinds = centers.reduce((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {})
  console.log(`\n✔ Saved ${centers.length} places to ${out.replace(root, '')}`)
  console.log(`  ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}`)
  console.log('  Next: npm run build (or npm run deploy) to bundle it with the app.')
}

// ---- main ------------------------------------------------------------------
if (args.import) {
  const elements = readExport(String(args.import))
  const name = args.area && args.area !== true ? String(args.area) : 'imported area'
  save(parseElements(elements), { name }, 'overpass-turbo export')
} else {
  const { scope, area } = await resolveScope()
  const query = buildQuery(scope, { timeout: ATTEMPT_SECONDS })
  if (args['print-query']) {
    console.log(query)
    process.exit(0)
  }
  console.log(`Querying Overpass for ${area.name} (up to ${maxMinutes} min of retries)…`)
  const result = await runOverpass(query)
  if (result.error) {
    console.error(`\n✖ Overpass is still unavailable (${result.error}). Nothing was changed.\n`)
    console.error('Get the same data by hand with overpass-turbo:')
    console.error('  1. Open https://overpass-turbo.eu')
    console.error('  2. Replace the query on the left with:\n')
    console.error(`     ${query}\n`)
    console.error('  3. Click "Run". If it says the server is busy, open Settings → General →')
    console.error('     "Overpass-API server", choose a different server, and run again.')
    console.error('  4. Click Export → Data → "raw OSM data" → download (saves export.json).')
    console.error(`  5. Run: npm run fetch-centers -- --import <path to export.json> --area "${area.name}"`)
    process.exit(1)
  }
  save(parseElements(result.elements), area, 'Overpass API')
}
