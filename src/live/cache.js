// Last-fetched data is kept in localStorage so Live Mode can show it with
// no signal ("offline: last updated <time>"). Every entry records when it
// was fetched and for which location.

const PREFIX = 'arflood.live.'

export function loadCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveCache(key, data) {
  const entry = { data, fetchedAt: Date.now() }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
  } catch {
    // Storage full or blocked: the data still works for this session.
  }
  return entry
}

/**
 * Runs `fetcher`; on success caches and returns { data, fetchedAt, stale: false }.
 * On failure returns the cached entry marked stale (with the error), or rethrows
 * when nothing is cached.
 */
export async function cachedFetch(key, fetcher) {
  try {
    const data = await fetcher()
    return { ...saveCache(key, data), stale: false, error: null }
  } catch (err) {
    const cached = loadCache(key)
    if (cached) return { ...cached, stale: true, error: err.message || String(err) }
    throw err
  }
}

export function formatTime(ts) {
  if (!ts) return 'never'
  const d = new Date(ts)
  const sameDay = d.toDateString() === new Date().toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
}

export function formatAge(ts) {
  if (!ts) return ''
  const min = Math.round((Date.now() - ts) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} days ago`
}
