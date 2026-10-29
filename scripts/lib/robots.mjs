// Minimal robots.txt parser following RFC 9309:
// - the group(s) naming our product token apply, otherwise the "*" group(s);
// - the longest matching rule wins; on a tie, Allow wins;
// - "*" matches any characters, "$" anchors the end of the path;
// - an empty "Disallow:" allows everything.

export function parseRobots(text) {
  const groups = []
  let current = null
  let lastWasAgent = false
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false
      if (!current) continue
      if (key === 'disallow' && value === '') continue // allow all
      current.rules.push({ allow: key === 'allow', path: value })
    } else {
      lastWasAgent = false
    }
  }
  return groups
}

function ruleMatches(pattern, path) {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path)
}

/** @param groups parsed robots @param token our product token, e.g. "FloodReadyBot" @param path URL path + query */
export function isAllowed(groups, token, path) {
  const t = token.toLowerCase()
  let applicable = groups.filter((g) => g.agents.some((a) => a !== '*' && t.includes(a)))
  if (!applicable.length) applicable = groups.filter((g) => g.agents.includes('*'))
  let best = null
  for (const g of applicable) {
    for (const r of g.rules) {
      if (!ruleMatches(r.path, path)) continue
      const len = r.path.replace(/[*$]/g, '').length
      if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { ...r, len }
    }
  }
  return { allowed: !best || best.allow, rule: best ? `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}` : null }
}
