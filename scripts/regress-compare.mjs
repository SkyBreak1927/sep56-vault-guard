#!/usr/bin/env node
// Compares two `--output json` runs of the same fixture.
//
//   node scripts/regress-compare.mjs <before.json> <after.json> <before_exit> <after_exit> [text-map.json]
//
// Exit code 0 when the runs are identical in everything that matters: the exit
// code, and for every row its name, status, reason_code, reason.code, key set,
// and `detail` / `raw_error` once run-dependent values (numbers and addresses)
// are masked. Exit code 1 and a list of differences otherwise.
//
// With a text map (see scripts/text-maps/wording-pass.json) the only differences
// allowed are the listed old -> new texts: `reason.message` must equal the
// map's old text before and its new text after, and `detail` must be equal after
// the map's replacements are applied to the "before" text. Anything else fails.
//
// Reads files only; touches no network and no key.
import { readFileSync } from 'node:fs'

const [beforePath, afterPath, beforeExit, afterExit, mapPath] = process.argv.slice(2)
if (!afterExit) {
  console.error('usage: regress-compare.mjs <before.json> <after.json> <before_exit> <after_exit> [text-map.json]')
  process.exit(2)
}

const mask = (text) =>
  String(text ?? '')
    .replace(/\b[GC][A-Z2-7]{55}\b/g, '<addr>')
    .replace(/\d+/g, '#')

const load = (path) => JSON.parse(readFileSync(path, 'utf8'))
const before = load(beforePath)
const after = load(afterPath)
const map = mapPath ? load(mapPath) : null
const diffs = []
let allowed = 0

/** The "before" detail with every replacement of the text map applied. */
function mapDetail(text) {
  let t = String(text ?? '')
  if (!map) return t
  for (const entry of map.detail ?? []) {
    if (entry.when && !t.includes(entry.when)) continue
    t = entry.re ? t.replace(new RegExp(entry.re, 'g'), entry.new) : t.split(entry.old).join(entry.new)
  }
  return t
}

if (beforeExit !== afterExit) diffs.push(`exit code ${beforeExit} -> ${afterExit}`)

if (!Array.isArray(before) || !Array.isArray(after)) {
  // A preflight object: compare it whole, masked.
  if (mask(JSON.stringify(before)) !== mask(JSON.stringify(after))) diffs.push('preflight object differs')
} else {
  if (before.length !== after.length) diffs.push(`row count ${before.length} -> ${after.length}`)
  for (let i = 0; i < Math.min(before.length, after.length); i++) {
    const b = before[i]
    const a = after[i]
    const where = `${b.name}`
    if (a.name !== b.name) diffs.push(`${where}: name -> ${a.name}`)
    for (const key of ['status', 'reason_code']) {
      if (b[key] !== a[key]) diffs.push(`${where}: ${key} ${b[key]} -> ${a[key]}`)
    }

    // reason: the code must match; the message may differ only as the map says.
    const br = b.reason ?? null
    const ar = a.reason ?? null
    if ((br === null) !== (ar === null)) {
      diffs.push(`${where}: reason present ${br !== null} -> ${ar !== null}`)
    } else if (br) {
      if (br.code !== ar.code) diffs.push(`${where}: reason.code ${br.code} -> ${ar.code}`)
      if (br.message !== ar.message) {
        const m = map?.reason_message?.[br.code]
        if (m && br.message === m.old && ar.message === m.new) allowed++
        else diffs.push(`${where}: reason.message differs and is not in the text map (${br.code})`)
      }
    }

    if (Object.keys(b).join() !== Object.keys(a).join()) {
      diffs.push(`${where}: keys ${Object.keys(b).join('|')} -> ${Object.keys(a).join('|')}`)
    }

    const mapped = mapDetail(b.detail)
    if (mask(mapped) !== mask(a.detail)) {
      diffs.push(`${where}: detail text differs (after the text map, masking numbers and addresses)`)
    } else if (mapped !== String(b.detail ?? '')) {
      allowed++
    }
    if (mask(b.raw_error) !== mask(a.raw_error)) diffs.push(`${where}: raw_error text differs (after masking numbers and addresses)`)
  }
}

if (diffs.length) {
  console.log('DIFFERENT')
  for (const d of diffs) console.log('  - ' + d)
  process.exit(1)
}
console.log(map ? `IDENTICAL (${allowed} text changes, all in the map)` : 'IDENTICAL')
