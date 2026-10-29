// Validates the editable data files before every build (npm "prebuild").
// Exits with an error (and a clear message) if either file has a mistake.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseJSON, validateCenters, validateContacts } from '../src/live/validate.js'

const root = fileURLToPath(new URL('..', import.meta.url))
let failed = false

for (const [file, validate] of [
  ['public/evac-centers.json', validateCenters],
  ['public/emergency-contacts.json', validateContacts],
]) {
  const { data, error } = parseJSON(readFileSync(root + file, 'utf8'), file)
  const issues = error ? { errors: [error], warnings: [] } : validate(data, file)
  for (const w of issues.warnings) console.warn(`⚠ ${w}`)
  for (const e of issues.errors) console.error(`✖ ${e}`)
  if (issues.errors.length) failed = true
  else console.log(`✔ ${file}${data?.centers ? ` (${data.centers.length} centers)` : ''}`)
}

if (failed) {
  console.error('\nFix the errors above, then run the build again. See "Configure for your area" in README.md.')
  process.exit(1)
}
