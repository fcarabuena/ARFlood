// Small localStorage helpers. Storage can be unavailable (private mode,
// blocked site data), so every access is wrapped and falls back to defaults.

export function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback }
  } catch {
    return { ...fallback }
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore: settings just won't persist
  }
}
