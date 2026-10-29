import { parseRobots, isAllowed } from './robots.mjs'

export const BOT_TOKEN = 'FloodReadyBot'
export const USER_AGENT = `${BOT_TOKEN}/1.0 (+https://fcarabuena.github.io/ARFlood/; public flood-safety app, runs every 30 min)`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Polite HTTP client for one scraper run:
 * - checks robots.txt (once per site) before any request;
 * - requests each URL at most once per run (later calls get the same result);
 * - waits between requests to the same host;
 * - identifies itself with a User-Agent containing the site URL.
 */
export class PoliteFetcher {
  constructor({ fetchImpl = globalThis.fetch, minDelayMs = 1500, timeoutMs = 30000, log = () => {} } = {}) {
    this.fetchImpl = fetchImpl
    this.minDelayMs = minDelayMs
    this.timeoutMs = timeoutMs
    this.log = log
    this.pages = new Map() // url -> Promise<{ status, text }>
    this.robots = new Map() // origin -> Promise<{ groups | null, mode }>
    this.lastRequest = new Map() // host -> time
    this.requested = [] // every URL actually requested, in order (for logs/tests)
  }

  async _request(url) {
    const host = new URL(url).host
    const wait = (this.lastRequest.get(host) ?? 0) + this.minDelayMs - Date.now()
    if (wait > 0) await sleep(wait)
    this.lastRequest.set(host, Date.now())
    this.requested.push(url)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml, application/rss+xml, application/atom+xml, text/html;q=0.9, */*;q=0.5' },
        redirect: 'follow',
        signal: ctrl.signal,
      })
      return { status: res.status, text: await res.text() }
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? `${host} did not answer within ${this.timeoutMs / 1000} s` : `${host}: ${err.message}`)
    } finally {
      clearTimeout(timer)
    }
  }

  /** robots.txt for an origin. 4xx = no restrictions; 5xx/unreachable = treat as disallow all (RFC 9309). */
  _robots(origin) {
    if (!this.robots.has(origin)) {
      this.robots.set(
        origin,
        this._request(`${origin}/robots.txt`)
          .then(({ status, text }) => {
            if (status >= 200 && status < 300) return { groups: parseRobots(text), mode: 'file' }
            if (status >= 400 && status < 500) return { groups: [], mode: `none (HTTP ${status})` }
            return { groups: null, mode: `unreachable (HTTP ${status})` }
          })
          .catch((err) => ({ groups: null, mode: `unreachable (${err.message})` }))
      )
    }
    return this.robots.get(origin)
  }

  /** { allowed, reason } for a URL according to its site's robots.txt. */
  async check(url) {
    const u = new URL(url)
    const r = await this._robots(u.origin)
    if (!r.groups) return { allowed: false, reason: `robots.txt ${r.mode}: treated as disallowed` }
    const { allowed, rule } = isAllowed(r.groups, BOT_TOKEN, u.pathname + u.search)
    return { allowed, reason: allowed ? `allowed by robots.txt (${rule ?? r.mode})` : `disallowed by robots.txt (${rule})` }
  }

  /** GET a page once per run. Throws if robots.txt disallows it or on HTTP errors. */
  get(url) {
    if (!this.pages.has(url)) {
      this.pages.set(
        url,
        (async () => {
          const { allowed, reason } = await this.check(url)
          if (!allowed) {
            const err = new Error(reason)
            err.robots = true
            throw err
          }
          const res = await this._request(url)
          if (res.status < 200 || res.status >= 300) throw new Error(`${new URL(url).host} answered HTTP ${res.status}`)
          return res.text
        })()
      )
    }
    return this.pages.get(url)
  }
}
