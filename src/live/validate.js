/**
 * Checks public/evac-centers.json and public/emergency-contacts.json for
 * mistakes and returns readable messages. Used in the app (console + a
 * notice in Live Mode) and by scripts/check-data.mjs before every build.
 *
 * Keys starting with "_" are treated as comments and ignored.
 *
 * @returns {{ errors: string[], warnings: string[] }}
 */

const CENTER_KEYS = ['name', 'lat', 'lon', 'address', 'capacity', 'contact', 'notes']
const CENTERS_TOP = ['updated', 'source', 'centers']
const CONTACTS_TOP = ['national', 'localRescue', 'lguAdvisory']
const NATIONAL_KEYS = ['label', 'number', 'note']
const LOCAL_KEYS = ['label', 'number']
const LGU_KEYS = ['label', 'url']

// Rough box around the Philippines, used only for warnings.
const PH = { latMin: 4, latMax: 22, lonMin: 116, lonMax: 127.5 }

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return d[a.length][b.length]
}

function unknownKeys(obj, allowed, where, out) {
  for (const key of Object.keys(obj)) {
    if (key.startsWith('_') || allowed.includes(key)) continue
    const guess = allowed
      .map((k) => [k, levenshtein(key.toLowerCase(), k.toLowerCase())])
      .sort((a, b) => a[1] - b[1])[0]
    const hint = guess && guess[1] <= 3 ? ` Did you mean "${guess[0]}"?` : ` Allowed: ${allowed.join(', ')}.`
    out.errors.push(`${where}: unknown field "${key}".${hint}`)
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Turns a JSON.parse error into "line X, column Y". */
export function parseJSON(text, file) {
  try {
    return { data: JSON.parse(text), error: null }
  } catch (err) {
    // Some engines omit the position; a comma before ] or } is the usual culprit.
    const m = /position (\d+)/.exec(err.message) || /,(?=\s*[\]}])/.exec(text)
    if (m && m.index !== undefined && !m[1]) m[1] = String(m.index)
    let where = ''
    if (m) {
      const before = text.slice(0, Number(m[1]))
      const line = before.split('\n').length
      const col = Number(m[1]) - before.lastIndexOf('\n')
      where = ` at line ${line}, column ${col}`
    }
    return {
      data: null,
      error: `${file}: invalid JSON${where} (${err.message}). Common causes: a missing comma between entries, a comma after the last entry, or quotes missing around a name.`,
    }
  }
}

export function validateCenters(json, file = 'evac-centers.json') {
  const out = { errors: [], warnings: [] }
  if (!isObj(json)) {
    out.errors.push(`${file}: the file must be an object like { "centers": [ ... ] }.`)
    return out
  }
  unknownKeys(json, CENTERS_TOP, file, out)
  if (!Array.isArray(json.centers)) {
    out.errors.push(`${file}: "centers" must be a list: "centers": [ ... ].`)
    return out
  }
  json.centers.forEach((c, i) => {
    const where = `${file} → centers[${i}]${c && c.name ? ` ("${c.name}")` : ''}`
    if (!isObj(c)) {
      out.errors.push(`${where}: each center must be an object { "name": ..., "lat": ..., "lon": ... }.`)
      return
    }
    unknownKeys(c, CENTER_KEYS, where, out)
    if (typeof c.name !== 'string' || !c.name.trim()) out.errors.push(`${where}: "name" is required (text).`)
    for (const k of ['lat', 'lon']) {
      if (typeof c[k] === 'string' && c[k].trim() !== '' && !isNaN(Number(c[k]))) {
        out.errors.push(`${where}: "${k}" must be a number without quotes, e.g. "${k}": ${Number(c[k])}.`)
      } else if (typeof c[k] !== 'number' || !isFinite(c[k])) {
        out.errors.push(`${where}: "${k}" is required and must be a number.`)
      }
    }
    if (typeof c.lat === 'number' && Math.abs(c.lat) > 90) out.errors.push(`${where}: "lat" must be between -90 and 90 (got ${c.lat}).`)
    if (typeof c.lon === 'number' && Math.abs(c.lon) > 180) out.errors.push(`${where}: "lon" must be between -180 and 180 (got ${c.lon}).`)
    if (typeof c.lat === 'number' && typeof c.lon === 'number') {
      const inPH = (la, lo) => la >= PH.latMin && la <= PH.latMax && lo >= PH.lonMin && lo <= PH.lonMax
      if (!inPH(c.lat, c.lon)) {
        if (inPH(c.lon, c.lat)) out.errors.push(`${where}: "lat" and "lon" look swapped (lat ${c.lat}, lon ${c.lon}). In the Philippines lat is about 5–21 and lon about 117–127.`)
        else out.warnings.push(`${where}: location ${c.lat}, ${c.lon} is outside the Philippines. Is that intended?`)
      }
    }
    if (c.capacity !== undefined && (typeof c.capacity !== 'number' || c.capacity < 0)) out.errors.push(`${where}: "capacity" must be a number of people, e.g. "capacity": 300.`)
    for (const k of ['address', 'contact', 'notes']) {
      if (c[k] !== undefined && typeof c[k] !== 'string') out.errors.push(`${where}: "${k}" must be text in quotes.`)
    }
  })
  // Duplicate names/locations usually mean a copy-paste slip.
  json.centers.forEach((c, i) => {
    json.centers.slice(i + 1).forEach((d, j) => {
      if (isObj(c) && isObj(d) && c.lat === d.lat && c.lon === d.lon && c.lat !== undefined) {
        out.warnings.push(`${file}: centers[${i}] and centers[${i + 1 + j}] have the same coordinates.`)
      }
    })
  })
  return out
}

const PHONE = /^\+?[\d\s()-]{3,20}$/

export function validateContacts(json, file = 'emergency-contacts.json') {
  const out = { errors: [], warnings: [] }
  if (!isObj(json)) {
    out.errors.push(`${file}: the file must be an object like { "localRescue": { ... } }.`)
    return out
  }
  unknownKeys(json, CONTACTS_TOP, file, out)
  if (json.national !== undefined) {
    if (!Array.isArray(json.national)) out.errors.push(`${file}: "national" must be a list: "national": [ ... ] (leave it empty to use 911 and 143).`)
    else {
      json.national.forEach((n, i) => {
        const where = `${file} → national[${i}]`
        if (!isObj(n)) return out.errors.push(`${where}: must be an object { "label": ..., "number": ... }.`)
        unknownKeys(n, NATIONAL_KEYS, where, out)
        if (typeof n.label !== 'string' || !n.label.trim()) out.errors.push(`${where}: "label" is required.`)
        if (typeof n.number !== 'string' || !PHONE.test(n.number)) out.errors.push(`${where}: "number" must be a phone number in quotes, e.g. "number": "911".`)
      })
    }
  }
  if (json.localRescue !== undefined) {
    const where = `${file} → localRescue`
    if (!isObj(json.localRescue)) out.errors.push(`${where}: must be an object { "label": ..., "number": ... }.`)
    else {
      unknownKeys(json.localRescue, LOCAL_KEYS, where, out)
      const num = json.localRescue.number
      if (num !== undefined && typeof num !== 'string') out.errors.push(`${where}: "number" must be text in quotes, e.g. "number": "0917 123 4567".`)
      else if (num && !PHONE.test(num)) out.errors.push(`${where}: "${num}" doesn't look like a phone number (use digits, spaces, + or -).`)
    }
  }
  if (json.lguAdvisory !== undefined) {
    const where = `${file} → lguAdvisory`
    if (!isObj(json.lguAdvisory)) out.errors.push(`${where}: must be an object { "label": ..., "url": ... }.`)
    else {
      unknownKeys(json.lguAdvisory, LGU_KEYS, where, out)
      const url = json.lguAdvisory.url
      if (url && !/^https:\/\/[^\s]+\.[^\s]+/.test(url)) out.errors.push(`${where}: "url" must be a full https:// address (got "${url}").`)
    }
  }
  return out
}

/** Logs issues to the console with a clear prefix. Returns the issues. */
export function reportIssues(file, issues) {
  for (const e of issues.errors) console.error(`[Flood Ready] ${e}`)
  for (const w of issues.warnings) console.warn(`[Flood Ready] ${w}`)
  return issues
}
