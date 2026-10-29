// "Reported flooding": helpers for public/flood-reports.json (made by
// scripts/scrape-floods.js every 30 min).
import { distance, distanceToPath, distanceToPolygon } from './geo.js'

export const NEAR_M = 2000 // a report this close (or closer) counts as "near you"
const WINDOW_MS = 24 * 3600 * 1000

// Reports are located at different precisions; each is treated as an area.
// Province/region-only reports are too coarse for "near you" or routing.
const RADIUS = { barangay: 700, city: 3000 }

export const reportRadius = (r) => (r.polygon ? null : RADIUS[r.place?.precision] ?? null)

/** Reports from the last 24 h that haven't expired. */
export function activeReports(doc, now = Date.now()) {
  return (doc?.reports ?? []).filter((r) => {
    const t = Date.parse(r.publishedAt)
    return Number.isFinite(t) && now - t <= WINDOW_MS && !(r.expiresAt && Date.parse(r.expiresAt) < now)
  })
}

/** Metres from p to the report's area (0 = inside); Infinity if too coarse to tell. */
export function reportDistance(r, p) {
  if (r.polygon?.length > 2) return distanceToPolygon(p, r.polygon)
  const radius = reportRadius(r)
  return radius == null ? Infinity : Math.max(0, distance(p, r) - radius)
}

/** Reports within NEAR_M of p, nearest first, each with .distance. */
export function nearbyReports(reports, p) {
  if (!p) return []
  return reports
    .map((r) => ({ ...r, distance: reportDistance(r, p) }))
    .filter((r) => r.distance <= NEAR_M)
    .sort((a, b) => a.distance - b.distance || (a.confidence === 'high' ? -1 : 1))
}

/**
 * Point reports (barangay/city precision) a route passes through or near.
 * Province-wide advisories are excluded: almost every route would "cross" them.
 */
export function routeHazards(coords, reports) {
  return reports.filter((r) => {
    const radius = reportRadius(r)
    return radius != null && distanceToPath(r, coords) <= radius + 150
  })
}

/**
 * Picks the walking route (from OSRM's alternatives) that crosses the fewest
 * reported flood areas, then the shortest. Returns the chosen route plus
 * .hazards (reports it still passes) and .avoided (true if a detour was chosen).
 */
export function pickRoute(routeData, reports) {
  if (!routeData) return null
  const options = routeData.alternatives?.length ? routeData.alternatives : [routeData]
  const scored = options.map((o, i) => ({ ...o, index: i, hazards: routeHazards(o.coords, reports) }))
  scored.sort((a, b) => a.hazards.length - b.hazards.length || a.distance - b.distance)
  const best = scored[0]
  const fastest = scored.find((s) => s.index === 0)
  return {
    ...routeData,
    coords: best.coords,
    distance: best.distance,
    duration: best.duration,
    hazards: best.hazards,
    avoided: best.index !== 0 && best.hazards.length < fastest.hazards.length,
    options: options.length,
  }
}
