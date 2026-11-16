#!/usr/bin/env node
// Compares two `--output json` runs of the same fixture.
//
//   node scripts/regress-compare.mjs <before.json> <after.json> <before_exit> <after_exit>
//
// Exit code 0 when the runs are identical in everything that matters: the exit
// code, and for every row its name, status, reason_code, reason, key set,
// and `detail` / `raw_error` once run-dependent values (numbers and
// addresses) are masked. Exit code 1 and a list of differences otherwise.
// Reads files only; touches no network and no key.
import { readFileSync } from 'node:fs'

const [beforePath, afterPath, beforeExit, afterExit] = process.argv.slice(2)
if (!afterExit) {
  console.error('usage: regress-compare.mjs <before.json> <after.json> <before_exit> <after_exit>')
  process.exit(2)
}

const mask = (text) =>
  String(text ?? '')
    .replace(/\b[GC][A-Z2-7]{55}\b/g, '<addr>')
    .replace(/\d+/g, '#')

const load = (path) => JSON.parse(readFileSync(path, 'utf8'))
const before = load(beforePath)
const after = load(afterPath)
const diffs = []

if (beforeExit !== afterExit) diffs.push(`exit code ${beforeExit} -> ${afterExit}`)

if (!Array.isArray(before) || !Array.isArray(after)) {
  // A preflight object: compare it whole, masked.
  if (mask(JSON.stringify(before)) !== mask(JSON.stringify(after))) diffs.push('preflight object differs')
} else {
  if (before.length !== after.length) diffs.push(`row count ${before.length} -> ${after.length}`)
  for (let i = 0; i < Math.min(before.length, after.length); i++) {
    const b = before[i]
    const a = after[i]
    const name = b.name
    const where = `${name}`
    if (a.name !== b.name) diffs.push(`${where}: name -> ${a.name}`)
    for (const key of ['status', 'reason_code']) {
      if (b[key] !== a[key]) diffs.push(`${where}: ${key} ${b[key]} -> ${a[key]}`)
    }
    if (JSON.stringify(b.reason ?? null) !== JSON.stringify(a.reason ?? null)) {
      diffs.push(`${where}: reason ${JSON.stringify(b.reason)} -> ${JSON.stringify(a.reason)}`)
    }
    if (Object.keys(b).join() !== Object.keys(a).join()) {
      diffs.push(`${where}: keys ${Object.keys(b).join('|')} -> ${Object.keys(a).join('|')}`)
    }
    for (const key of ['detail', 'raw_error']) {
      if (mask(b[key]) !== mask(a[key])) diffs.push(`${where}: ${key} text differs (after masking numbers and addresses)`)
    }
  }
}

if (diffs.length) {
  console.log('DIFFERENT')
  for (const d of diffs) console.log('  - ' + d)
  process.exit(1)
}
console.log('IDENTICAL')
