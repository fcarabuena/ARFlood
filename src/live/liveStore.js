import { reactive } from 'vue'
import { loadCache, saveCache, cachedFetch } from './cache.js'
import { getPosition, distance } from './geo.js'
import {
  fetchWeather,
  fetchRiver,
  fetchElevation,
  fetchOsmCenters,
  fetchLocalCenters,
  mergeCenters,
  fetchRoute,
  fetchContacts,
} from './api.js'
import { assessRisk } from './risk.js'

const cachedLocation = loadCache('location')

/** State for Live Flood Mode (separate from the training simulation store). */
export const live = reactive({
  tab: 'status', // status | centers | sos | checklist
  online: navigator.onLine,
  location: cachedLocation?.data ?? null, // { lat, lon, accuracy, time, source: 'gps'|'map' }
  locating: false,
  locationError: '',

  weather: loadCache('weather'), // { data, fetchedAt, stale, error }
  river: loadCache('river'),
  elevation: loadCache('elevation'),
  conditionsLoading: false,

  localCenters: loadCache('local-centers'),
  osmCenters: loadCache('osm-centers'),
  centersLoading: false,
  centersError: '',

  selected: null, // chosen evacuation center
  route: loadCache('route'),
  routeLoading: false,

  guideOpen: false,
  contacts: loadCache('contacts'),
  localRescue: loadCache('local-rescue')?.data ?? '',
})

window.addEventListener('online', () => (live.online = true))
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

export async function refreshConditions() {
  const at = live.location
  if (!at) return
  live.conditionsLoading = true
  const [weather, river, elevation] = await Promise.all([
    settle('weather', () => fetchWeather(at)),
    settle('river', () => fetchRiver(at)),
    settle('elevation', () => fetchElevation(at)),
  ])
  Object.assign(live, { weather, river, elevation, conditionsLoading: false })
}

export function currentRisk() {
  const w = live.weather?.data
  const r = live.river?.data
  const e = live.elevation?.data
  if (!w && !r && !e) return null
  return assessRisk({ weather: w, river: r, elevation: e })
}

/** How far (m) the cached data's location is from where you are now. */
export function dataDistance(entry) {
  const at = entry?.data?.at
  return at && live.location ? distance(at, live.location) : 0
}

export async function refreshCenters() {
  live.centersLoading = true
  live.centersError = ''
  const local = await settle('local-centers', fetchLocalCenters)
  live.localCenters = local
  if (live.location) {
    const at = live.location
    const osm = await settle('osm-centers', async () => ({ at, list: await fetchOsmCenters(at) }))
    live.osmCenters = osm
    if (osm.error) live.centersError = osm.error
  }
  live.centersLoading = false
}

export function centersList() {
  return mergeCenters(live.localCenters?.data?.centers ?? [], live.osmCenters?.data?.list ?? [], live.location)
}

export async function chooseCenter(center) {
  live.selected = center
  if (!live.location) return
  live.routeLoading = true
  const from = live.location
  live.route = await settle('route', async () => ({ ...(await fetchRoute(from, center)), from, center }))
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
