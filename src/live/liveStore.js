import { reactive } from 'vue'
import { loadCache, saveCache, cachedFetch } from './cache.js'
import { getPosition, distance } from './geo.js'
import {
  fetchWeather,
  fetchRiver,
  fetchElevation,
  fetchOsmCenters,
  fetchLocalCenters,
  fetchSnapshot,
  mergeCenters,
  fetchRoute,
  fetchContacts,
  fetchFloodReports,
} from './api.js'
import { assessRisk } from './risk.js'
import { inBbox } from './osm.js'
import { activeReports, nearbyReports, pickRoute } from './reports.js'

// ---------------------------------------------------------------------------
// Polite use of free public servers (Open-Meteo, Overpass, OSRM/FOSSGIS):
// - TTL: reuse data while it is fresh and for (roughly) the same place.
// - MIN_GAP: even a manual "Refresh" can't hit a server more often than this.
// - Overpass runs one query at a time; route requests are spaced out.
// Attempts are remembered across reloads, so reloading doesn't bypass this.
// ---------------------------------------------------------------------------
const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const DAY = 24 * HOUR

// key = cache key; field = property on `live`.
const POLICY = {
  weather: { field: 'weather', ttl: 10 * MIN, gap: 1 * MIN, near: 2000 },
  river: { field: 'river', ttl: 3 * HOUR, gap: 10 * MIN, near: 2000 },
  elevation: { field: 'elevation', ttl: 30 * DAY, gap: 1 * MIN, near: 200 }, // terrain doesn't change
  'osm-centers': { field: 'osmCenters', ttl: 1 * DAY, gap: 2 * MIN, near: 1000 },
}
const ROUTE_TTL = 12 * HOUR
const ROUTE_SPACING = 1500 // ms between route requests (OSRM demo: max 1 req/s)
const ROUTE_RECALC_GAP = 30 * SEC
const MAX_CACHED_ROUTES = 20

const attempts = loadCache('attempts')?.data ?? {}
function markAttempt(key) {
  attempts[key] = Date.now()
  saveCache('attempts', attempts)
}
const sinceAttempt = (key) => Date.now() - (attempts[key] ?? 0)

function isFresh(entry, key, at) {
  const p = POLICY[key]
  if (!entry?.data || !entry.fetchedAt || entry.stale) return false
  if (Date.now() - entry.fetchedAt > p.ttl) return false
  const was = entry.data.at
  return !at || !was || distance(was, at) <= p.near
}

const cachedLocation = loadCache('location')

/** State for Live Flood Mode (separate from the training simulation store). */
export const live = reactive({
  tab: 'status', // status | centers | sos | checklist | about
  online: navigator.onLine,
  location: cachedLocation?.data ?? null, // { lat, lon, accuracy, time, source: 'gps'|'map' }
  locating: false,
  locationError: '',

  weather: loadCache('weather'), // { data, fetchedAt, stale, error }
  river: loadCache('river'),
  elevation: loadCache('elevation'),
  conditionsLoading: false,
  refreshNote: '',

  localCenters: loadCache('local-centers'),
  snapshot: loadCache('snapshot'), // bundled OpenStreetMap snapshot
  osmCenters: loadCache('osm-centers'), // live Overpass results
  liveSearchSkipped: false, // true when the snapshot already covers your location
  centersLoading: false,
  centersError: '',

  selected: null, // chosen evacuation center
  route: loadCache('route'),
  routeLoading: false,

  floodReports: loadCache('flood-reports'), // { data: flood-reports.json, fetchedAt, stale }
  showReports: true, // map layer toggle

  guideOpen: false,
  contacts: loadCache('contacts'),
  localRescue: loadCache('local-rescue')?.data ?? '',
})

const BASE = import.meta.env?.BASE_URL ?? '/'

/**
 * navigator.onLine is only "has a network interface": it stays true on Wi-Fi
 * without internet or with no mobile signal. Confirm with a tiny uncached
 * request to our own site (the service worker can't answer it from cache).
 */
export async function checkConnection() {
  if (!navigator.onLine) return (live.online = false)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch(`${BASE}evac-centers.json?probe=${Date.now()}`, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal })
    clearTimeout(timer)
    live.online = res.status < 500
  } catch {
    live.online = false
  }
  return live.online
}

window.addEventListener('online', () => checkConnection())
window.addEventListener('offline', () => (live.online = false))

export function setLocation(loc) {
  live.location = loc
  saveCache('location', loc)
}

export async function locate() {
  live.locating = true
  live.locationError = ''
  try {
    setLocation({ ...(await getPosition()), source: 'gps' })
    return true
  } catch (err) {
    live.locationError = err.message
    return false
  } finally {
    live.locating = false
  }
}

const settle = async (key, fn) => {
  try {
    return await cachedFetch(key, fn)
  } catch (err) {
    return { data: null, fetchedAt: null, stale: true, error: err.message }
  }
}

/**
 * Fetches one source unless it is still fresh, or the last attempt (success
 * or failure) was too recent. Failures back off too, so a busy server is not
 * hit again every time the user switches tabs.
 */
async function refreshSource(key, fetcher, { force, at }) {
  const { field, gap } = POLICY[key]
  if (!force && isFresh(live[field], key, at)) return 'fresh'
  const movedFar = !!(at && live[field]?.data?.at && distance(live[field].data.at, at) > POLICY[key].near)
  if (sinceAttempt(key) < gap && !movedFar) return 'too-soon'
  markAttempt(key)
  live[field] = await settle(key, fetcher)
  if (live[field]?.stale) checkConnection() // a failure may mean we lost the connection
  return 'fetched'
}

export async function refreshConditions({ force = false } = {}) {
  const at = live.location
  if (!at) return
  live.conditionsLoading = true
  const results = await Promise.all([
    refreshSource('weather', () => fetchWeather(at), { force, at }),
    refreshSource('river', () => fetchRiver(at), { force, at }),
    refreshSource('elevation', () => fetchElevation(at), { force, at }),
  ])
  live.conditionsLoading = false
  live.refreshNote =
    force && results.every((r) => r !== 'fetched') ? 'Already up to date. Weather refreshes at most once a minute.' : ''
}

export function currentRisk() {
  const w = live.weather?.data
  const r = live.river?.data
  const e = live.elevation?.data
  const near = reportsNearMe()
  if (!w && !r && !e && !near.length) return null
  return assessRisk({ weather: w, river: r, elevation: e, reportsNearby: near })
}

// ---- Reported flooding ------------------------------------------------------

/** Loads public/flood-reports.json (our own file; network first, offline from cache). */
export async function refreshFloodReports() {
  live.floodReports = await settle('flood-reports', fetchFloodReports)
}

/** Reports from the last 24 h. */
export function currentReports() {
  return activeReports(live.floodReports?.data)
}

/** Reports within 2 km of you (see reports.js for how areas are sized). */
export function reportsNearMe() {
  return nearbyReports(currentReports(), live.location)
}

/** The chosen route, re-evaluated against the current reports. */
export function effectiveRoute() {
  return pickRoute(live.route?.data ?? null, currentReports())
}

/** How far (m) the cached data's location is from where you are now. */
export function dataDistance(entry) {
  const at = entry?.data?.at
  return at && live.location ? distance(at, live.location) : 0
}

let overpassInFlight = null

/** True when the bundled snapshot's area includes your location. */
export function snapshotCovers(loc = live.location) {
  const area = live.snapshot?.data?.area
  return !!(loc && live.snapshot?.data?.centers?.length && inBbox(area?.bbox, loc))
}

/**
 * Loads centers in priority order: verified list, bundled snapshot (both are
 * our own precached files), then live Overpass, which is only queried when
 * the snapshot doesn't cover your location, or when you press Refresh.
 */
export async function refreshCenters({ force = false } = {}) {
  live.centersLoading = true
  live.centersError = ''
  const [local, snapshot] = await Promise.all([settle('local-centers', fetchLocalCenters), settle('snapshot', fetchSnapshot)])
  live.localCenters = local
  live.snapshot = snapshot
  live.liveSearchSkipped = !force && snapshotCovers()
  if (live.location && !live.liveSearchSkipped) {
    const at = live.location
    // Only one Overpass query at a time.
    overpassInFlight ??= refreshSource('osm-centers', async () => ({ at, list: await fetchOsmCenters(at) }), { force, at })
      .finally(() => (overpassInFlight = null))
    await overpassInFlight
    if (live.osmCenters?.error) live.centersError = live.osmCenters.error
  }
  live.centersLoading = false
}

// Map taps can come in quick succession: wait until the user settles.
let debounceTimer = null
export function refreshAllSoon(delay = 1500) {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    refreshConditions()
    refreshCenters()
  }, delay)
}

export function centersList() {
  return mergeCenters(
    live.localCenters?.data?.centers ?? [],
    live.snapshot?.data?.centers ?? [],
    live.osmCenters?.data?.list ?? [],
    live.location
  )
}

// ---- Routes: cached per (center, start point rounded to ~100 m) --------------
const routeKey = (center, from) => `${center.id}|${from.lat.toFixed(3)},${from.lon.toFixed(3)}`

function cachedRoute(key) {
  const entry = (loadCache('routes')?.data ?? {})[key]
  return entry && Date.now() - entry.fetchedAt < ROUTE_TTL ? entry : null
}

function storeRoute(key, entry) {
  const all = loadCache('routes')?.data ?? {}
  all[key] = entry
  const keys = Object.keys(all).sort((a, b) => all[b].fetchedAt - all[a].fetchedAt)
  for (const k of keys.slice(MAX_CACHED_ROUTES)) delete all[k]
  saveCache('routes', all)
}

let lastRouteRequest = 0
/**
 * Chooses a center and gets a walking route (from cache when possible).
 * `recalculate` (from the guide) is limited to once every 30 s.
 */
export async function chooseCenter(center, { recalculate = false } = {}) {
  live.selected = center
  if (!live.location) return
  const from = live.location
  const key = routeKey(center, from)

  const hit = cachedRoute(key)
  if (hit && !recalculate) {
    live.route = { ...hit, stale: false }
    saveCache('route', hit.data)
    return
  }
  if (recalculate && Date.now() - lastRouteRequest < ROUTE_RECALC_GAP) return

  live.routeLoading = true
  const wait = lastRouteRequest + ROUTE_SPACING - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRouteRequest = Date.now()
  const entry = await settle('route', async () => ({ ...(await fetchRoute(from, center)), from, center }))
  // Only cache real routes; a straight-line fallback should be retried later.
  if (entry.data && !entry.stale && !entry.data.straight) storeRoute(key, entry)
  // Ignore the answer if the user picked another center meanwhile.
  if (live.selected?.id === center.id) live.route = entry
  live.routeLoading = false
}

export async function loadContacts() {
  live.contacts = await settle('contacts', fetchContacts)
}

export function saveLocalRescue(number) {
  live.localRescue = number.trim()
  saveCache('local-rescue', live.localRescue)
}

// Restore the last chosen center (its route is cached).
if (live.route?.data?.center) live.selected = live.route.data.center
