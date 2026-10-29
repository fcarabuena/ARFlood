import { distance, offset } from './geo.js'
import { parseJSON, validateCenters, validateContacts, reportIssues } from './validate.js'

const BASE = import.meta.env?.BASE_URL ?? '/'

async function getJSON(url, { timeout = 15000, ...init } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    // Browsers can't set a custom User-Agent, so public servers (Overpass,
    // OSRM/FOSSGIS, OSM tiles) identify the app by its origin in the Referer.
    const res = await fetch(url, { referrerPolicy: 'strict-origin-when-cross-origin', ...init, signal: ctrl.signal })
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
    return await res.json()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${new URL(url).host} did not answer in time`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

const isoDate = (d) => d.toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Rain: current rate + next 24 h (Open-Meteo Forecast API)
// ---------------------------------------------------------------------------

export const WEATHER_SOURCE = { name: 'Open-Meteo Forecast API', url: 'https://open-meteo.com/en/docs' }

export async function fetchWeather({ lat, lon }) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&current=precipitation,weather_code' +
    '&hourly=precipitation,precipitation_probability&forecast_hours=24&timezone=auto'
  const j = await getJSON(url)
  // `current.precipitation` is the total over the last `interval` seconds (15 min).
  const rate = (Number(j.current?.precipitation) || 0) * (3600 / (Number(j.current?.interval) || 3600))
  const hours = j.hourly.time.map((t, i) => ({
    time: t,
    mm: Number(j.hourly.precipitation[i]) || 0,
    probability: j.hourly.precipitation_probability?.[i] ?? null,
  }))
  return {
    at: { lat, lon },
    currentRate: rate,
    weatherCode: Number(j.current?.weather_code) || 0,
    total24h: hours.reduce((s, h) => s + h.mm, 0),
    maxHourly: Math.max(0, ...hours.map((h) => h.mm)),
    maxProbability: Math.max(0, ...hours.map((h) => h.probability ?? 0)),
    hours,
  }
}

// ---------------------------------------------------------------------------
// River discharge vs. its usual level (Open-Meteo Flood API, GloFAS model)
// ---------------------------------------------------------------------------

export const FLOOD_SOURCE = { name: 'Open-Meteo Flood API (GloFAS)', url: 'https://open-meteo.com/en/docs/flood-api' }

const YEARS_OF_HISTORY = 5
const SEASON_WINDOW_DAYS = 15

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo)
}

function dayOfYear(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000)
}

export async function fetchRiver({ lat, lon }) {
  const today = new Date()
  const start = new Date(today)
  start.setUTCFullYear(start.getUTCFullYear() - YEARS_OF_HISTORY)
  start.setUTCDate(start.getUTCDate() - SEASON_WINDOW_DAYS)
  const end = new Date(today)
  end.setUTCDate(end.getUTCDate() + 7)
  const url =
    'https://flood-api.open-meteo.com/v1/flood' +
    `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&daily=river_discharge` +
    `&start_date=${isoDate(start)}&end_date=${isoDate(end)}`
  const j = await getJSON(url, { timeout: 25000 })
  const times = j.daily.time
  const q = j.daily.river_discharge

  const todayStr = isoDate(today)
  const todayDoy = dayOfYear(todayStr)
  const thisYearStart = new Date(today)
  thisYearStart.setUTCDate(thisYearStart.getUTCDate() - 60)

  // "Usual" = the same time of year (± 15 days) in previous years.
  const seasonal = []
  const upcoming = []
  times.forEach((t, i) => {
    const v = q[i]
    if (v == null) return
    if (t >= todayStr) upcoming.push({ date: t, q: v })
    else if (new Date(t) < thisYearStart) {
      let diff = Math.abs(dayOfYear(t) - todayDoy)
      diff = Math.min(diff, 365 - diff)
      if (diff <= SEASON_WINDOW_DAYS) seasonal.push(v)
    }
  })
  seasonal.sort((a, b) => a - b)
  const next3 = upcoming.slice(0, 3)
  const peak = next3.reduce((m, d) => (d.q > m.q ? d : m), next3[0] ?? { q: 0, date: todayStr })
  const median = percentile(seasonal, 0.5)
  const p90 = percentile(seasonal, 0.9)
  return {
    at: { lat, lon },
    grid: { lat: j.latitude, lon: j.longitude },
    today: upcoming[0]?.q ?? null,
    peak: peak.q,
    peakDate: peak.date,
    median,
    p90,
    ratio: peak.q / Math.max(median, 0.01),
    // GloFAS works on a ~5 km grid; tiny values mean no major river is modelled here.
    significant: median >= 0.5 || peak.q >= 5,
    upcoming: upcoming.slice(0, 7),
  }
}

// ---------------------------------------------------------------------------
// Elevation, and whether you are lower than your surroundings (Elevation API)
// ---------------------------------------------------------------------------

export const ELEVATION_SOURCE = { name: 'Open-Meteo Elevation API (Copernicus DEM 90 m)', url: 'https://open-meteo.com/en/docs/elevation-api' }

export async function fetchElevation({ lat, lon }) {
  // Your point + 8 points 500 m around it.
  const pts = [{ lat, lon }, ...[0, 45, 90, 135, 180, 225, 270, 315].map((b) => offset({ lat, lon }, 500, b))]
  const url =
    'https://api.open-meteo.com/v1/elevation' +
    `?latitude=${pts.map((p) => p.lat.toFixed(5)).join(',')}` +
    `&longitude=${pts.map((p) => p.lon.toFixed(5)).join(',')}`
  const j = await getJSON(url)
  const [here, ...around] = j.elevation
  const avg = around.reduce((s, v) => s + v, 0) / around.length
  return {
    at: { lat, lon },
    elevation: here,
    surroundings: avg,
    belowSurroundings: avg - here, // positive = you are in a dip
    lowest: Math.min(...around),
  }
}

// ---------------------------------------------------------------------------
// Evacuation centers: verified local list + OpenStreetMap (Overpass API)
// ---------------------------------------------------------------------------

export const OSM_SOURCE = { name: 'OpenStreetMap contributors (Overpass API)', url: 'https://www.openstreetmap.org/copyright' }

// Public Overpass servers are often busy; try them in turn. overpass-api.de
// asks clients to retry with backoff when it is "at capacity", so it gets one
// more, later attempt. (Regional mirrors such as overpass.osm.ch only hold
// their own country and would return an empty "success" for the Philippines.)
const OVERPASS_ENDPOINTS = [
  { url: 'https://overpass-api.de/api/interpreter', delay: 0 },
  { url: 'https://overpass.private.coffee/api/interpreter', delay: 1000 },
  { url: 'https://overpass-api.de/api/interpreter', delay: 5000 },
]

// amenity=shelter is also used for bus stops, picnic huts etc. Drop those.
const NOT_EVACUATION = new Set([
  'public_transport', 'picnic_shelter', 'weather_shelter', 'field_shelter', 'lean_to',
  'rock_shelter', 'sun_shelter', 'basic_hut', 'gazebo', 'pavilion', 'changing_rooms',
])

function classify(tags) {
  if (tags.emergency === 'assembly_point') return { kind: 'assembly', label: 'Assembly point' }
  if (tags.social_facility === 'shelter') return { kind: 'shelter', label: 'Shelter (social facility)' }
  if (tags.amenity === 'shelter') {
    if (tags.shelter_type === 'emergency' || tags.emergency === 'yes') return { kind: 'shelter', label: 'Emergency shelter' }
    return { kind: 'shelter', label: 'Shelter' }
  }
  if (tags.amenity === 'school') return { kind: 'school', label: 'School (often an evacuation center)' }
  return { kind: 'other', label: 'Facility' }
}

export async function fetchOsmCenters({ lat, lon }, radius = 5000) {
  const a = `around:${radius},${lat.toFixed(5)},${lon.toFixed(5)}`
  const s = `around:${Math.min(radius, 3000)},${lat.toFixed(5)},${lon.toFixed(5)}`
  const query =
    `[out:json][timeout:25];(` +
    `nwr(${a})["emergency"="assembly_point"];` +
    `nwr(${a})["social_facility"="shelter"];` +
    `nwr(${a})["amenity"="shelter"];` +
    `nwr(${s})["amenity"="school"];` +
    `);out center tags 120;`
  const body = new URLSearchParams({ data: query })

  let lastError
  for (const { url: endpoint, delay } of OVERPASS_ENDPOINTS) {
    try {
      if (delay) await new Promise((r) => setTimeout(r, delay)) // back off between attempts
      const j = await getJSON(endpoint, { method: 'POST', body, timeout: 25000 })
      return j.elements
        .map((e) => {
          const tags = e.tags || {}
          const p = { lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon }
          if (p.lat == null || NOT_EVACUATION.has(tags.shelter_type)) return null
          const c = classify(tags)
          return {
            id: `osm-${e.type}-${e.id}`,
            name: tags.name || tags['name:en'] || c.label,
            ...p,
            ...c,
            verified: false,
            address: [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', '),
            osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
          }
        })
        .filter(Boolean)
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`OpenStreetMap servers are busy or unreachable (${lastError?.message ?? 'no answer'})`)
}

/** Fetches one of our own JSON files and validates it (typos are logged clearly). */
async function getCheckedJSON(file, validate) {
  const res = await fetch(`${BASE}${file}`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${file} could not be loaded (${res.status})`)
  const { data, error } = parseJSON(await res.text(), file)
  const issues = reportIssues(file, error ? { errors: [error], warnings: [] } : validate(data, file))
  return { data: data ?? {}, issues: issues.errors }
}

/** The editable, verified list in public/evac-centers.json. */
export async function fetchLocalCenters() {
  const { data: j, issues } = await getCheckedJSON('evac-centers.json', validateCenters)
  return {
    updated: j.updated || '',
    source: j.source || 'public/evac-centers.json',
    issues,
    // Entries with errors are skipped; the rest still work.
    centers: (Array.isArray(j.centers) ? j.centers : [])
      .filter((c) => c && typeof c.lat === 'number' && typeof c.lon === 'number' && isFinite(c.lat) && isFinite(c.lon) && c.name)
      .map((c, i) => ({ id: `local-${i}`, kind: 'verified', label: 'Verified evacuation center', verified: true, ...c })),
  }
}

/** Verified first (nearest first), then OSM results by distance; drops OSM duplicates of verified ones. */
export function mergeCenters(local, osm, from) {
  const withDist = (c) => ({ ...c, distance: from ? distance(from, c) : null })
  const verified = local.map(withDist)
  const others = osm
    .filter((o) => !verified.some((v) => distance(v, o) < 60))
    .map(withDist)
  const byDist = (a, b) => (a.distance ?? 0) - (b.distance ?? 0)
  return [...verified.sort(byDist), ...others.sort(byDist)]
}

// ---------------------------------------------------------------------------
// Walking route (OSRM). The public OSRM demo server only has a car profile,
// so the FOSSGIS-hosted OSRM foot server is tried first.
// ---------------------------------------------------------------------------

const WALK_SPEED = 1.25 // m/s, used when only a car-road route is available

export async function fetchRoute(from, to) {
  const coords = `${from.lon.toFixed(6)},${from.lat.toFixed(6)};${to.lon.toFixed(6)},${to.lat.toFixed(6)}`
  const servers = [
    { url: `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}`, name: 'OSRM walking route (FOSSGIS / OpenStreetMap)', walking: true },
    { url: `https://router.project-osrm.org/route/v1/foot/${coords}`, name: 'OSRM demo server (road route; walking time estimated)', walking: false },
  ]
  for (const s of servers) {
    try {
      const j = await getJSON(`${s.url}?overview=full&geometries=geojson`, { timeout: 12000 })
      const r = j.routes?.[0]
      if (j.code !== 'Ok' || !r) continue
      return {
        coords: r.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
        distance: r.distance,
        duration: s.walking ? r.duration : r.distance / WALK_SPEED,
        source: s.name,
        straight: false,
        to: { lat: to.lat, lon: to.lon },
      }
    } catch {
      // try the next server
    }
  }
  const d = distance(from, to)
  return {
    coords: [from, to],
    distance: d,
    duration: d / WALK_SPEED,
    source: 'Straight line (no routing server reachable)',
    straight: true,
    to: { lat: to.lat, lon: to.lon },
  }
}

// ---------------------------------------------------------------------------
// Emergency contacts (public/emergency-contacts.json)
// ---------------------------------------------------------------------------

export async function fetchContacts() {
  const { data, issues } = await getCheckedJSON('emergency-contacts.json', validateContacts)
  return { ...data, issues }
}
