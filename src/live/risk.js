/**
 * Combines rain, river and elevation into a simple Low / Moderate / High
 * estimate. This is a rough, automated guide. It is NOT an official
 * warning: PAGASA / NDRRMC / LGU advisories always take priority.
 *
 * Rain thresholds follow PAGASA's rainfall warning levels for 1-hour rain:
 * Yellow 7.5–15 mm, Orange 15–30 mm, Red > 30 mm.
 */

export const ACTIONS = {
  low: {
    title: 'Low risk: stay alert',
    steps: [
      'Monitor PAGASA, NDRRMC and your LGU for rainfall and flood advisories.',
      'Check your go-bag and charge your phone and power bank.',
      'Know the nearest evacuation center and a route that stays on high ground.',
    ],
  },
  moderate: {
    title: 'Moderate risk: get ready to evacuate',
    steps: [
      'Pack your go-bag now: water, food, medicine, documents, flashlight.',
      'Move valuables, documents and appliances to a higher floor.',
      'If water may enter your home, switch off the main power while you are dry.',
      'Help children, older people, PWDs and pregnant women get ready first.',
      'Follow your barangay/LGU instructions. Leave early if told to evacuate.',
    ],
  },
  high: {
    title: 'High risk: evacuate if told to, or if water is rising',
    steps: [
      'Go to the nearest evacuation center now, using higher roads.',
      'Never walk, swim or drive through floodwater. 15 cm of moving water can knock you down.',
      'Switch off the main power and gas only if you can do it safely and dry.',
      'If you are trapped, go to the highest floor or roof (not a closed attic) and call 911 / 143.',
      'Signal for help with a flashlight, whistle or bright cloth.',
    ],
  },
}

function rainPoints(mm) {
  if (mm >= 30) return 3 // PAGASA red
  if (mm >= 15) return 2 // orange
  if (mm >= 7.5) return 1 // yellow
  return 0
}

/** @returns {{ level, score, factors: {label, value, points, note}[], partial: boolean }} */
export function assessRisk({ weather, river, elevation, reportsNearby = [] }) {
  const factors = []

  if (weather) {
    const now = rainPoints(weather.currentRate)
    factors.push({
      key: 'rain-now',
      label: 'Rain right now',
      value: `${weather.currentRate.toFixed(1)} mm/h`,
      points: now,
      note: ['Below PAGASA warning levels', 'PAGASA yellow level (7.5–15 mm/h)', 'PAGASA orange level (15–30 mm/h)', 'PAGASA red level (>30 mm/h)'][now],
    })
    const peak = rainPoints(weather.maxHourly)
    const total = weather.total24h
    const totalPts = total >= 200 ? 3 : total >= 100 ? 2 : total >= 50 ? 1 : 0
    const fc = Math.max(peak, totalPts)
    factors.push({
      key: 'rain-24h',
      label: 'Rain in the next 24 h',
      value: `${total.toFixed(0)} mm total, up to ${weather.maxHourly.toFixed(1)} mm/h`,
      points: fc,
      note:
        fc === 0
          ? 'No heavy rain expected'
          : fc === 1
            ? 'Heavy rain possible: low-lying areas may flood'
            : fc === 2
              ? 'Intense rain expected: flooding likely in flood-prone areas'
              : 'Torrential rain expected: serious flooding possible',
    })
  }

  if (river) {
    let pts = 0
    let note = 'No major river modelled near you'
    if (river.significant) {
      if (river.ratio >= 4 || (river.peak > river.p90 * 1.5 && river.ratio >= 2.5)) pts = 3
      else if (river.ratio >= 2.5 || river.peak > river.p90) pts = 2
      else if (river.ratio >= 1.5) pts = 1
      note = [
        'River at or near its usual level for this time of year',
        'River above its usual level',
        'River well above its usual level',
        'River far above its usual level: flooding likely nearby',
      ][pts]
    }
    factors.push({
      key: 'river',
      label: 'Nearest river (next 3 days)',
      value: river.significant ? `${river.ratio.toFixed(1)}× usual flow` : 'small / none',
      points: pts,
      note,
    })
  }

  // Elevation only makes things worse when water is actually coming.
  const waterPts = factors.reduce((m, f) => Math.max(m, f.points), 0)
  if (elevation) {
    let pts = 0
    const notes = []
    if (elevation.elevation < 5) notes.push('very low ground (< 5 m above sea level)')
    if (elevation.belowSurroundings >= 3) notes.push(`about ${Math.round(elevation.belowSurroundings)} m lower than the area around you`)
    if (waterPts > 0) pts = Math.min(notes.length, 2)
    factors.push({
      key: 'elevation',
      label: 'Your ground level',
      value: `${Math.round(elevation.elevation)} m above sea level`,
      points: pts,
      note: notes.length ? `You are on ${notes.join(' and ')}` : 'Not unusually low compared with your surroundings',
    })
  }

  const score = factors.reduce((s, f) => s + f.points, 0)
  let level = 'low'
  if (score >= 4 || waterPts >= 3) level = 'high'
  else if (score >= 2) level = 'moderate'

  // Flooding reported within 2 km raises the estimate one level.
  const raised = reportsNearby.length > 0
  if (raised) {
    level = level === 'low' ? 'moderate' : 'high'
    const official = reportsNearby.filter((r) => r.confidence === 'high').length
    factors.push({
      key: 'reports',
      label: 'Flooding reported nearby',
      value: `${reportsNearby.length} report${reportsNearby.length > 1 ? 's' : ''}`,
      points: 0,
      note: `${official ? `${official} official PAGASA advisory, ` : ''}within 2 km. Raises the estimate one level.`,
    })
  }

  return { level, score, factors, raised, partial: !weather || !river || !elevation }
}
