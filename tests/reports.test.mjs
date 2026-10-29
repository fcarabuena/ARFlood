// App-side logic for "Reported flooding": near-you checks and route choice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nearbyReports, pickRoute, activeReports, routeHazards } from '../src/live/reports.js'
import { assessRisk } from '../src/live/risk.js'

const me = { lat: 14.6507, lon: 121.1029 } // Marikina
const NOW = Date.parse('2026-10-29T15:00:00Z')
const rep = (id, lat, lon, precision, extra = {}) => ({
  id,
  lat,
  lon,
  place: { name: id, precision },
  confidence: 'medium',
  publishedAt: new Date(NOW - 3600e3).toISOString(),
  ...extra,
})

test('near you: barangay 700 m area, city 3 km area, province polygons, coarse reports ignored', () => {
  const reports = [
    rep('brgy-2km', 14.6507, 121.1029 + 0.0245, 'barangay'), // ~2.6 km east: 2.6 - 0.7 = 1.9 km -> near
    rep('brgy-4km', 14.6507, 121.1029 + 0.04, 'barangay'), // ~4.3 km: not near
    rep('city-4km', 14.6507 + 0.04, 121.1029, 'city'), // ~4.4 km - 3 km = 1.4 km -> near
    rep('province', 14.6, 121.1, 'province'), // province-level point: too coarse
    rep('polygon', 0, 0, 'province', {
      confidence: 'high',
      polygon: [[14.6, 121.05], [14.7, 121.05], [14.7, 121.15], [14.6, 121.15]],
    }), // we are inside
  ]
  const near = nearbyReports(reports, me).map((r) => r.id)
  assert.deepEqual(near.sort(), ['brgy-2km', 'city-4km', 'polygon'].sort())
})

test('reports older than 24 h or expired are not active', () => {
  const doc = {
    reports: [
      rep('fresh', 0, 0, 'city'),
      rep('old', 0, 0, 'city', { publishedAt: new Date(NOW - 30 * 3600e3).toISOString() }),
      rep('expired', 0, 0, 'city', { expiresAt: new Date(NOW - 60e3).toISOString() }),
    ],
  }
  assert.deepEqual(activeReports(doc, NOW).map((r) => r.id), ['fresh'])
})

test('route choice: the alternative avoiding a reported flood wins, even if longer', () => {
  const flood = rep('Tumana', 14.6600, 121.1100, 'barangay')
  const direct = { coords: [me, { lat: 14.6600, lon: 121.1100 }, { lat: 14.67, lon: 121.12 }], distance: 3000, duration: 2400 }
  const detour = { coords: [me, { lat: 14.6507, lon: 121.1300 }, { lat: 14.67, lon: 121.12 }], distance: 3800, duration: 3000 }
  const chosen = pickRoute({ ...direct, alternatives: [direct, detour], to: {} }, [flood])
  assert.equal(chosen.distance, 3800)
  assert.equal(chosen.avoided, true)
  assert.equal(chosen.hazards.length, 0)
  // Only one route available: it is kept, with a warning.
  const only = pickRoute({ ...direct, alternatives: [direct], to: {} }, [flood])
  assert.equal(only.avoided, false)
  assert.deepEqual(only.hazards.map((h) => h.id), ['Tumana'])
  // Province-wide advisories never count as route hazards.
  assert.equal(routeHazards(direct.coords, [rep('prov', 14.66, 121.11, 'province', { polygon: [[0, 0], [0, 1], [1, 1]] })]).length, 0)
})

test('flooding reported nearby raises the risk one level', () => {
  const calm = { currentRate: 0, total24h: 2, maxHourly: 0.5 }
  assert.equal(assessRisk({ weather: calm }).level, 'low')
  const raised = assessRisk({ weather: calm, reportsNearby: [rep('x', 0, 0, 'city')] })
  assert.equal(raised.level, 'moderate')
  assert.equal(raised.raised, true)
  assert.equal(assessRisk({ weather: { currentRate: 35, total24h: 150, maxHourly: 40 }, reportsNearby: [rep('x', 0, 0, 'city')] }).level, 'high')
})
