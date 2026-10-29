// Finds Philippine place names in text by matching against the bundled PSGC
// list (data/ph-places.json): regions, provinces, cities/municipalities and,
// when written as "Barangay X" / "Brgy. X" next to its city, barangays.
// Nothing is geocoded by guesswork: a place is only returned if it is in the list.
import { readFileSync } from 'node:fs'

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '') // ñ -> n, é -> e
const ABBR = [
  [/\bsto\.?\s/gi, 'santo '],
  [/\bsta\.?\s/gi, 'santa '],
  [/\bgen\.?\s/gi, 'general '],
  [/\bpres\.?\s/gi, 'president '],
  [/\bsn\.?\s/gi, 'san '],
]
/** Lower-case, accent-free, abbreviations expanded, single spaces. */
export function norm(s) {
  let t = ` ${strip(String(s))} `
  for (const [re, rep] of ABBR) t = t.replace(re, rep)
  return t.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}
const clean = (name) => name.replace(/\s*\([^)]*\)/g, '').trim() // "Santa Elena (Pob.)" -> "Santa Elena"

// Local-language names for a few cities (PSGC code -> extra names).
const EXTRA_CITY_NAMES = { '133900000': ['Maynila'] }
// Cities known simply by their name (no "City" suffix in everyday use).
const PLAIN_NAME = new Set(['133900000'])

// Town names that are also everyday words or famous people's names (streets,
// schools, heroes). They only count when a province/region in the same text, or
// a "City"/"City of" form, confirms them.
const RISKY = new Set(
  [
    'rizal', 'quezon', 'bonifacio', 'mabini', 'magsaysay', 'roxas', 'luna', 'aurora', 'burgos', 'laurel', 'lopez',
    'garcia', 'aguinaldo', 'del pilar', 'quirino', 'aquino', 'marcos', 'osmena', 'recto', 'bay', 'real', 'victoria',
    'concepcion', 'mercedes', 'pilar', 'carmen', 'del carmen', 'dolores', 'trinidad', 'paz', 'gloria', 'libertad',
    'progreso', 'union', 'president roxas', 'general luna', 'esperanza', 'rosario', 'buenavista', 'santa cruz',
    'san jose', 'san isidro', 'alcala', 'asuncion', 'magallanes', 'jones', 'bato', 'ilog', 'bago', 'bula', 'pili',
    'bulan', 'baybay', 'tubod', 'pandan', 'dao', 'lupi', 'bayang', 'kalayaan', 'liberty', 'balete', 'manay', 'mati',
    'malay', 'sto nino', 'santo nino', 'santa maria', 'san miguel', 'san juan', 'santa rosa', 'san pedro',
  ].map(norm)
)

export class PlaceMatcher {
  constructor(data = JSON.parse(readFileSync(new URL('../../data/ph-places.json', import.meta.url), 'utf8'))) {
    this.byCode = new Map()
    this.index = new Map() // normalized phrase -> [{ place, strong }]
    this.barangaysOf = new Map() // city code -> Map(normalized name -> barangay)
    this.maxWords = 1

    const add = (phrase, place, strong = false) => {
      const key = norm(phrase)
      if (!key) return
      this.maxWords = Math.max(this.maxWords, key.split(' ').length)
      const list = this.index.get(key) ?? []
      if (!list.some((e) => e.place === place)) list.push({ place, strong })
      this.index.set(key, list)
    }

    for (const r of data.regions) {
      const place = { code: r.code, name: r.name, level: 'region', region: r.code, ll: r.ll }
      this.byCode.set(r.code, place)
      for (const a of r.aliases) add(a, place, true)
    }
    for (const d of data.districts ?? []) {
      this.byCode.set(d.code, { code: d.code, name: d.name, level: 'district', region: d.region, ll: null })
    }
    for (const p of data.provinces) {
      const place = { code: p.code, name: p.name, level: 'province', region: p.region, ll: p.ll }
      this.byCode.set(p.code, place)
      add(p.name, place)
      add(`${p.name} province`, place, true)
      add(`province of ${p.name}`, place, true)
    }
    for (const c of data.cities) {
      const base = clean(c.name).replace(/^City of /i, '')
      const place = {
        code: c.code,
        name: base.endsWith(' City') || !c.isCity || PLAIN_NAME.has(c.code) ? base : `${base} City`,
        level: c.isCity ? 'city' : 'municipality',
        province: c.province,
        district: c.district,
        region: c.region,
        ll: c.ll,
      }
      this.byCode.set(c.code, place)
      if (/ City$/.test(base)) {
        add(base, place, true) // "Quezon City": never shorten to "Quezon"
      } else {
        add(base, place)
        if (c.isCity) {
          add(`${base} City`, place, true)
          add(`City of ${base}`, place, true)
        }
      }
      for (const old of String(c.oldName || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)) add(clean(old), place)
      for (const extra of EXTRA_CITY_NAMES[c.code] ?? []) add(extra, place, true)
    }
    for (const [code, name, parent, lat, lon] of data.barangays) {
      if (!parent) continue
      const m = this.barangaysOf.get(parent) ?? new Map()
      const b = { code, name: clean(name), level: 'barangay', parent, ll: lat != null ? [lat, lon] : null }
      m.set(norm(clean(name)), b)
      // "Barangay 123" is commonly written as just the number after "Brgy."
      const num = /^Barangay (\d+[A-Z]?)$/i.exec(clean(name))
      if (num) m.set(norm(num[1]), b)
      this.barangaysOf.set(parent, m)
    }
  }

  /** Raw candidate mentions (longest match first), keeping only capitalised ones. */
  _mentions(text) {
    const tokens = []
    const re = /[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu
    let m
    while ((m = re.exec(String(text)))) tokens.push({ word: m[0], start: m.index })
    this._tokens = tokens
    const words = tokens.map((t) => t.word)
    const out = []
    for (let i = 0; i < tokens.length; ) {
      let hit = null
      for (let n = Math.min(this.maxWords, tokens.length - i); n >= 1 && !hit; n--) {
        const phrase = words.slice(i, i + n).join(' ')
        const entries = this.index.get(norm(phrase))
        // Proper nouns only: the first letter in the text must be upper case.
        if (entries && /^\p{Lu}/u.test(strip(words[i]))) hit = { phrase, n, entries, at: i }
      }
      if (hit) {
        out.push(hit)
        i += hit.n
      } else i++
    }
    return out
  }

  /**
   * Places mentioned in `text`, most specific first. Returns
   * [{ code, name, level, city?, province?, region?, ll, precision }].
   */
  match(text) {
    const mentions = this._mentions(text)
    const provinces = new Set()
    const regions = new Set()
    for (const m of mentions) {
      for (const e of m.entries) {
        if (m.entries.length === 1 && e.place.level === 'province' && !RISKY.has(norm(e.place.name))) provinces.add(e.place.code)
        if (e.place.level === 'region') regions.add(e.place.code)
      }
    }
    // A province confirmed by a strong form ("X province") counts too.
    for (const m of mentions) for (const e of m.entries) if (e.strong && e.place.level === 'province') provinces.add(e.place.code)

    const chosen = new Map()
    for (const m of mentions) {
      let cands = m.entries
      const ctx = (p) => provinces.has(p.province) || provinces.has(p.code) || regions.has(p.region) || regions.has(p.code)
      if (cands.length > 1) {
        // A province that shares its name with one of its own towns (e.g. Bulacan): use the province.
        const prov = cands.find((e) => e.place.level === 'province')
        if (prov && cands.every((e) => e === prov || e.place.province === prov.place.code)) cands = [prov]
      }
      if (cands.length > 1) {
        // Same name in several places: keep the one(s) confirmed by context.
        const confirmed = cands.filter((e) => ctx(e.place))
        cands = confirmed.length ? confirmed : cands.filter((e) => e.strong)
        // "X City" form: prefer cities.
        if (cands.length > 1 && / city$/i.test(m.phrase)) cands = cands.filter((e) => e.place.level === 'city')
      }
      if (cands.length !== 1) continue // still ambiguous: skip rather than guess
      const { place, strong } = cands[0]
      if (RISKY.has(norm(place.name.replace(/ City$/, ''))) && !strong && !ctx(place)) continue
      chosen.set(place.code, place)
      m.place = place
    }

    // Barangays: only "Barangay X"/"Brgy. X" belonging to a city/municipality found above.
    const brgys = []
    const re = /\b(?:barangay|brgy|bgy)\.?\s+([\p{L}\p{N}][\p{L}\p{N}'’.-]*(?:\s+[\p{L}\p{N}][\p{L}\p{N}'’.-]*){0,4})/giu
    let m
    while ((m = re.exec(String(text)))) {
      const words = m[1].split(/\s+/)
      for (const city of [...chosen.values()].filter((p) => p.level === 'city' || p.level === 'municipality')) {
        const kids = this.barangaysOf.get(city.code)
        if (!kids) continue
        for (let n = words.length; n >= 1; n--) {
          const b = kids.get(norm(words.slice(0, n).join(' ')))
          if (b) {
            brgys.push({ b, city })
            break
          }
        }
      }
    }

    // "Santo Niño, Marikina": a barangay name written just before its city.
    const words = this._tokens.map((t) => t.word)
    for (const mention of mentions) {
      const city = mention.place
      if (!city || (city.level !== 'city' && city.level !== 'municipality')) continue
      const kids = this.barangaysOf.get(city.code)
      const before = String(text).slice(0, this._tokens[mention.at].start)
      if (!kids || !/,\s*$/.test(before)) continue
      for (let n = Math.min(4, mention.at); n >= 1; n--) {
        const b = kids.get(norm(words.slice(mention.at - n, mention.at).join(' ')))
        if (b && /^\p{Lu}/u.test(strip(words[mention.at - n]))) {
          brgys.push({ b, city })
          break
        }
      }
    }

    // Keep the most specific: barangay > city/municipality > province > region.
    const results = []
    const covered = new Set()
    for (const { b, city } of brgys) {
      if (covered.has(b.code)) continue
      covered.add(b.code).add(city.code)
      results.push(this._out({ ...b, name: `${b.name}, ${city.name}`, city: city.code, province: city.province, region: city.region }, b.ll ?? city.ll, b.ll ? 'barangay' : 'city'))
    }
    for (const p of chosen.values()) {
      if (covered.has(p.code)) continue
      if (p.level === 'city' || p.level === 'municipality') {
        results.push(this._out(p, p.ll, 'city'))
        covered.add(p.code)
        if (p.province) covered.add(p.province)
        covered.add(p.region)
      }
    }
    for (const p of chosen.values()) {
      if (covered.has(p.code) || p.level !== 'province') continue
      results.push(this._out(p, p.ll, 'province'))
      covered.add(p.code).add(p.region)
    }
    for (const p of chosen.values()) {
      if (covered.has(p.code) || p.level !== 'region') continue
      results.push(this._out(p, p.ll, 'region'))
    }
    return results.filter((r) => r.lat != null)
  }

  /** Place for a PSGC code (9-digit, as used in PAGASA CAP geocodes). */
  byPsgc(code) {
    const p = this.byCode.get(String(code))
    return p ? this._out(p, p.ll, p.level === 'barangay' ? 'barangay' : p.level === 'region' ? 'region' : p.level === 'province' ? 'province' : 'city') : null
  }

  _out(p, ll, precision) {
    const prov = p.province ? this.byCode.get(p.province)?.name : undefined
    const reg = p.region ? this.byCode.get(p.region)?.name : undefined
    return {
      psgc: p.code,
      name: p.name,
      level: p.level,
      ...(p.city ? { city: this.byCode.get(p.city)?.name } : {}),
      ...(prov && p.level !== 'province' ? { province: prov } : {}),
      ...(reg && p.level !== 'region' ? { region: reg } : {}),
      lat: ll?.[0] ?? null,
      lon: ll?.[1] ?? null,
      precision, // how precise lat/lon is: barangay | city | province | region
    }
  }
}
