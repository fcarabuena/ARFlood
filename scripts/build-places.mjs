// Builds data/ph-places.json: every Philippine region, province, city/municipality
// and barangay from the PSGC (Philippine Standard Geographic Code, PSA), with
// coordinates from Wikidata where available. Used by scripts/scrape-floods.js to
// match place names in advisories and news. Run rarely (PSGC changes a few times
// a year):  node scripts/build-places.mjs
//
// Sources: PSGC via https://psgc.gitlab.io/api (PSA data, both 9- and 10-digit
// codes); coordinates via the Wikidata Query Service (P988 = PSGC, P625 = coordinates, CC0).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const UA = 'FloodReadyBot/1.0 (+https://fcarabuena.github.io/ARFlood/; build-time data script)'
const API = 'https://psgc.gitlab.io/api'
const out = fileURLToPath(new URL('../data/ph-places.json', import.meta.url))

async function get(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.json()
}

console.log('Downloading PSGC lists…')
const [regions, provinces, districts, cities, barangays] = await Promise.all(
  ['regions', 'provinces', 'districts', 'cities-municipalities', 'barangays'].map((p) => get(`${API}/${p}/`))
)
console.log(`  ${regions.length} regions, ${provinces.length} provinces, ${districts.length} NCR districts, ${cities.length} cities/municipalities, ${barangays.length} barangays`)

console.log('Downloading coordinates from Wikidata…')
const wd = await get('https://query.wikidata.org/sparql', {
  method: 'POST',
  headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ query: 'SELECT ?code ?coord WHERE { ?item wdt:P988 ?code ; wdt:P625 ?coord . }' }),
})
const coords = new Map()
for (const b of wd.results.bindings) {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value)
  if (m) coords.set(b.code.value, [+(+m[2]).toFixed(5), +(+m[1]).toFixed(5)]) // [lat, lon]
}
console.log(`  ${coords.size} PSGC codes with coordinates`)
const ll = (x) => coords.get(x.code) || coords.get(x.psgc10DigitCode) || null

function average(points) {
  const p = points.filter(Boolean)
  if (!p.length) return null
  return [+(p.reduce((s, x) => s + x[0], 0) / p.length).toFixed(5), +(p.reduce((s, x) => s + x[1], 0) / p.length).toFixed(5)]
}

// Common short names used in advisories and news (factual aliases).
const REGION_ALIASES = {
  '130000000': ['NCR', 'Metro Manila', 'National Capital Region'],
  '140000000': ['CAR', 'Cordillera'],
  '040000000': ['CALABARZON', 'Region IV-A', 'Region 4-A', 'Region 4A'],
  '170000000': ['MIMAROPA', 'Region IV-B', 'Region 4-B', 'Region 4B'],
  '050000000': ['Bicol', 'Bicol Region'],
  '120000000': ['SOCCSKSARGEN', 'Soccsksargen'],
  '160000000': ['Caraga'],
  '190000000': ['BARMM', 'Bangsamoro'],
  '150000000': ['BARMM', 'Bangsamoro', 'ARMM'],
}
const ROMAN = { I: 1, II: 2, III: 3, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13 }

const cityOut = cities.map((c) => ({
  code: c.code,
  name: c.name,
  oldName: c.oldName || undefined,
  isCity: !!c.isCity,
  province: c.provinceCode || null,
  district: c.districtCode || null,
  region: c.regionCode,
  ll: ll(c),
}))
const byCity = new Map(cityOut.map((c) => [c.code, c]))

const provOut = provinces.map((p) => ({
  code: p.code,
  name: p.name,
  region: p.regionCode,
  ll: ll(p) || average(cityOut.filter((c) => c.province === p.code).map((c) => c.ll)),
}))

const regionOut = regions.map((r) => {
  const aliases = new Set(REGION_ALIASES[r.code] || [])
  aliases.add(r.name)
  if (r.regionName) {
    aliases.add(r.regionName)
    const m = /^Region ([IVX]+)$/.exec(r.regionName)
    if (m && ROMAN[m[1]]) aliases.add(`Region ${ROMAN[m[1]]}`)
  }
  return {
    code: r.code,
    name: r.name,
    aliases: [...aliases],
    ll: ll(r) || average(provOut.filter((p) => p.region === r.code).map((p) => p.ll).concat(cityOut.filter((c) => c.region === r.code && !c.province).map((c) => c.ll))),
  }
})

// Compact rows for 42k barangays: [code, name, parent city/municipality code, lat?, lon?]
const brgyOut = barangays.map((b) => {
  const parent = b.cityCode || b.municipalityCode || (b.subMunicipalityCode ? byCity.get(b.subMunicipalityCode)?.code ?? b.subMunicipalityCode : null)
  const p = ll(b)
  return p ? [b.code, b.name, parent, p[0], p[1]] : [b.code, b.name, parent]
})

const missing = cityOut.filter((c) => !c.ll)
for (const c of missing) c.ll = provOut.find((p) => p.code === c.province)?.ll ?? null
const data = {
  generatedAt: new Date().toISOString(),
  sources: {
    psgc: 'Philippine Statistics Authority (PSA) PSGC, via https://psgc.gitlab.io/api',
    coordinates: 'Wikidata (CC0), properties P988 (PSGC) and P625 (coordinates)',
  },
  notes: `${missing.length} cities/municipalities without Wikidata coordinates use their province's coordinates: ${missing.map((c) => c.name).join(', ')}`,
  regions: regionOut,
  districts: districts.map((d) => ({ code: d.code, name: d.name, region: d.regionCode })),
  provinces: provOut,
  cities: cityOut,
  barangayColumns: ['code', 'name', 'parentCode', 'lat', 'lon'],
  barangays: brgyOut,
}
writeFileSync(out, JSON.stringify(data))
console.log(`✔ Wrote ${out} (${(JSON.stringify(data).length / 1e6).toFixed(1)} MB)`)
console.log(`  barangays with own coordinates: ${brgyOut.filter((b) => b.length === 5).length}; ${data.notes}`)
