const R = 6371000 // Earth radius, metres
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

/** Great-circle distance in metres between {lat, lon} points. */
export function distance(a, b) {
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Initial compass bearing (0 = north, 90 = east) from a to b. */
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat))
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

/** Point `dist` metres from `p` in direction `brg` degrees. */
export function offset(p, dist, brg) {
  const d = dist / R
  const b = rad(brg)
  const lat1 = rad(p.lat)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lon2 = rad(p.lon) + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: deg(lat2), lon: deg(lon2) }
}

export function formatDistance(m) {
  if (m == null || !isFinite(m)) return '–'
  if (m < 1000) return `${Math.round(m / 5) * 5} m`
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`
}

export function formatDuration(s) {
  if (s == null || !isFinite(s)) return '–'
  const min = Math.max(1, Math.round(s / 60))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export function compassPoint(brg) {
  return POINTS[Math.round(((brg % 360) + 360) % 360 / 45) % 8]
}

/** One-shot location. Resolves to { lat, lon, accuracy, time }. */
export function getPosition({ timeout = 15000, highAccuracy = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Location is not available on this device.'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(fromPosition(p)),
      (err) => reject(new Error(geoErrorMessage(err))),
      { enableHighAccuracy: highAccuracy, timeout, maximumAge: 60000 }
    )
  })
}

/** Continuous GPS; returns a stop() function. Only used while the AR guide is open. */
export function watchPosition(onPos, onError) {
  if (!('geolocation' in navigator)) {
    onError?.(new Error('Location is not available on this device.'))
    return () => {}
  }
  const id = navigator.geolocation.watchPosition(
    (p) => onPos(fromPosition(p)),
    (err) => onError?.(new Error(geoErrorMessage(err))),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  )
  return () => navigator.geolocation.clearWatch(id)
}

function fromPosition(p) {
  return {
    lat: p.coords.latitude,
    lon: p.coords.longitude,
    accuracy: p.coords.accuracy,
    heading: p.coords.heading, // direction of travel, only while moving
    speed: p.coords.speed,
    time: p.timestamp || Date.now(),
  }
}

function geoErrorMessage(err) {
  if (err?.code === 1) return 'Location permission was denied. Allow location for this site in your browser settings, or tap the map to set your location.'
  if (err?.code === 3) return 'Getting your location took too long. Move to an open area and try again.'
  return 'Your location could not be found. Check that location/GPS is turned on.'
}

// ---- Distances to lines and areas (equirectangular; fine below ~50 km) ----

function toXY(p, lat0) {
  return [rad(p.lon) * R * Math.cos(rad(lat0)), rad(p.lat) * R]
}

/** Metres from point p to the segment a-b. */
export function distanceToSegment(p, a, b) {
  const [px, py] = toXY(p, p.lat)
  const [ax, ay] = toXY(a, p.lat)
  const [bx, by] = toXY(b, p.lat)
  const dx = bx - ax
  const dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Metres from p to the closest point of a path [{lat, lon}, ...]. */
export function distanceToPath(p, path) {
  if (!path?.length) return Infinity
  if (path.length === 1) return distance(p, path[0])
  let best = Infinity
  for (let i = 0; i < path.length - 1; i++) best = Math.min(best, distanceToSegment(p, path[i], path[i + 1]))
  return best
}

/** Ray casting; polygon as [[lat, lon], ...]. */
export function pointInPolygon(p, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]
    const [yj, xj] = poly[j]
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** 0 inside the polygon, otherwise metres to its edge. */
export function distanceToPolygon(p, poly) {
  if (pointInPolygon(p, poly)) return 0
  const ring = poly.map(([lat, lon]) => ({ lat, lon }))
  return distanceToPath(p, [...ring, ring[0]])
}
