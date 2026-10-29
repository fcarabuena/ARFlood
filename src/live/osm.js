// OpenStreetMap evacuation-place query + parsing, shared by the app (live
// Overpass search) and scripts/fetch-centers.mjs (bundled snapshot), so both
// produce exactly the same kind of entries. No browser or Node APIs here.

// amenity=shelter is also used for bus stops, picnic huts etc. Drop those.
const NOT_EVACUATION = new Set([
  'public_transport', 'picnic_shelter', 'weather_shelter', 'field_shelter', 'lean_to',
  'rock_shelter', 'sun_shelter', 'basic_hut', 'gazebo', 'pavilion', 'changing_rooms',
])

/**
 * Overpass QL selecting evacuation-relevant places.
 * scope: { around: { lat, lon, radius, schoolRadius? } } or { areaId } (3600000000 + relation id).
 */
export function buildQuery(scope, { timeout = 25, limit = '' } = {}) {
  let a
  let s
  let head = ''
  if (scope.areaId) {
    head = `area(id:${scope.areaId})->.a;`
    a = s = 'area.a'
  } else {
    const { lat, lon, radius, schoolRadius = Math.min(radius, 3000) } = scope.around
    a = `around:${Math.round(radius)},${lat.toFixed(5)},${lon.toFixed(5)}`
    s = `around:${Math.round(schoolRadius)},${lat.toFixed(5)},${lon.toFixed(5)}`
  }
  return (
    `[out:json][timeout:${timeout}];${head}(` +
    `nwr(${a})["emergency"="assembly_point"];` +
    `nwr(${a})["social_facility"="shelter"];` +
    `nwr(${a})["amenity"="shelter"];` +
    `nwr(${s})["amenity"="school"];` +
    `);out center tags${limit ? ` ${limit}` : ''};`
  )
}

export function classify(tags) {
  if (tags.emergency === 'assembly_point') return { kind: 'assembly', label: 'Assembly point' }
  if (tags.social_facility === 'shelter') return { kind: 'shelter', label: 'Shelter (social facility)' }
  if (tags.amenity === 'shelter') {
    if (tags.shelter_type === 'emergency' || tags.emergency === 'yes') return { kind: 'shelter', label: 'Emergency shelter' }
    return { kind: 'shelter', label: 'Shelter' }
  }
  if (tags.amenity === 'school') return { kind: 'school', label: 'School (often an evacuation center)' }
  return { kind: 'other', label: 'Facility' }
}

/** Overpass JSON elements -> center entries (non-evacuation shelters removed). */
export function parseElements(elements) {
  return (elements || [])
    .map((e) => {
      const tags = e.tags || {}
      const lat = e.lat ?? e.center?.lat
      const lon = e.lon ?? e.center?.lon
      if (lat == null || lon == null || NOT_EVACUATION.has(tags.shelter_type)) return null
      const c = classify(tags)
      if (c.kind === 'other') return null
      return {
        id: `osm-${e.type}-${e.id}`,
        name: tags.name || tags['name:en'] || c.label,
        lat: +lat.toFixed(6),
        lon: +lon.toFixed(6),
        kind: c.kind,
        label: c.label,
        address: [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(Boolean).join(' ').trim(),
        osmUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      }
    })
    .filter(Boolean)
}

/** Bounding box of a list of points, padded by `padDeg` (~0.01° ≈ 1.1 km). */
export function bbox(points, padDeg = 0.01) {
  if (!points.length) return null
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  return {
    south: Math.min(...lats) - padDeg,
    west: Math.min(...lons) - padDeg,
    north: Math.max(...lats) + padDeg,
    east: Math.max(...lons) + padDeg,
  }
}

export const inBbox = (b, p) => !!b && p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east
