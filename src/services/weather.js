/**
 * Optional live weather from Open-Meteo (free, no API key).
 * Resolves to null on any problem (permission denied, offline, timeout),
 * so callers can silently fall back to defaults.
 */

// WMO weather codes used by Open-Meteo.
function describe(code) {
  if (code >= 95) return 'Thunderstorm'
  if (code >= 80) return 'Rain showers'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 61) return 'Rain'
  if (code >= 51) return 'Drizzle'
  if (code >= 45) return 'Fog'
  if (code >= 1) return 'Cloudy'
  return 'Clear'
}

function getPosition(timeout) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('no geolocation'))
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout,
      maximumAge: 30 * 60 * 1000,
      enableHighAccuracy: false,
    })
  })
}

/** Maps a precipitation rate (mm/h) to rain intensity 0..1 and a difficulty. */
export function mapPrecipitation(mm, code) {
  const stormy = code >= 95
  if (mm >= 7.6 || stormy) return { intensity: 1, suggested: 'hard', level: 'Heavy rain' }
  if (mm >= 2.5) return { intensity: 0.8, suggested: 'hard', level: 'Moderate to heavy rain' }
  if (mm >= 0.5) return { intensity: 0.55, suggested: 'normal', level: 'Moderate rain' }
  if (mm > 0 || (code >= 51 && code < 71) || code >= 80) {
    return { intensity: 0.3, suggested: 'easy', level: 'Light rain' }
  }
  return { intensity: 0.12, suggested: 'easy', level: 'No rain' }
}

export async function fetchLiveWeather({ timeout = 8000 } = {}) {
  try {
    const pos = await getPosition(timeout)
    const { latitude, longitude } = pos.coords
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}` +
      '&current=precipitation,rain,showers,weather_code&timezone=auto'

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeout)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json()
    const cur = data.current
    if (!cur) return null

    // "current" precipitation is the total over the last `interval` seconds
    // (usually 15 min); convert it to an hourly rate.
    const mm = Number(cur.precipitation ?? (cur.rain ?? 0) + (cur.showers ?? 0)) || 0
    const rate = mm * (3600 / (Number(cur.interval) || 3600))
    const code = Number(cur.weather_code) || 0
    return {
      precipitation: rate, // mm/h
      code,
      condition: describe(code),
      ...mapPrecipitation(rate, code),
    }
  } catch {
    return null
  }
}
