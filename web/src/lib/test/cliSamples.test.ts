import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHECK_DEFS, type CheckStatus } from '@/config/checks'
import { describeCheck, passCaveat } from '../findings'
import type { CheckState } from '../types'

// Real CLI output after the wording pass (docs/sow2/samples/*-wording-pass.json).
// These tests show that what the web reads from the CLI (the donation sentence, the
// P&L sentence and the NOTE prefix) still parses with the new texts.
// Vitest runs from web/, so the samples are one level up.
const SAMPLES = resolve(process.cwd(), '../docs/sow2/samples')

type Row = { name: string; status: string; detail: string; reason?: { code: string; message: string } }

const load = (file: string): Row[] => JSON.parse(readFileSync(resolve(SAMPLES, file), 'utf8'))
const def = (id: string) => CHECK_DEFS.find((d) => d.id === id)!
const row = (rows: Row[], id: string) => rows.find((r) => r.name === id)!
const stateOf = (r: Row): CheckState => ({
  status: r.status.toLowerCase() as CheckStatus,
  detail: r.detail,
  settledAt: null,
  group: def(r.name).group,
})

const FILES = [
  'reference-vault-wording-pass.json',
  'positive-control-vault-wording-pass.json',
  'reverting-max-vault-wording-pass.json',
]

describe('the web reads the CLI output with the new wording', () => {
  it('parses a donation FAIL: the evidence rows and the attacker outcome', () => {
    const r = row(load('reference-vault-wording-pass.json'), 'donation_attack')
    expect(r.status).toBe('FAIL')
    expect(r.detail.startsWith('Finding in the donation scenario — ')).toBe(true)
    const finding = describeCheck(def('donation_attack'), stateOf(r))
    expect(finding.headline).toMatch(/^The victim (deposit was accepted but minted zero shares|received only \d+% of the shares)/)
    expect(finding.evidence.map((e) => e.label)).toEqual([
      'Initial attacker deposit',
      'Direct donation',
      'Victim deposit',
      'Shares received',
    ])
    expect(finding.evidence[0].value).toBe('1 stroop')
    expect(finding.outcome?.label).toBe('Attacker net outcome')
  })

  it('parses a donation PASS', () => {
    const r = row(load('positive-control-vault-wording-pass.json'), 'donation_attack')
    expect(r.status).toBe('PASS')
    expect(r.detail.startsWith('In this scenario the vault held up — ')).toBe(true)
    const finding = describeCheck(def('donation_attack'), stateOf(r))
    expect(finding.headline).toBe('The victim still received a proportional share of the vault.')
    expect(finding.evidence).toHaveLength(4)
  })

  it('still finds the NOTE on an overflow PASS at decimals_offset 0', () => {
    const r = row(load('reference-vault-wording-pass.json'), 'overflow_protection')
    expect(r.detail.startsWith('NOTE: ')).toBe(true)
    expect(passCaveat(def('overflow_protection'), stateOf(r))).toBe("This does not test the vault's own overflow protection.")
  })

  it.each(FILES)('%s: every row is a known check with a known status, and has none of the old wording', (file) => {
    const rows = load(file)
    expect(rows).toHaveLength(11)
    for (const r of rows) {
      expect(CHECK_DEFS.map((d) => d.id)).toContain(r.name)
      expect(['PASS', 'FAIL', 'INCONCLUSIVE', 'NOT_APPLICABLE']).toContain(r.status)
      expect(r.detail).not.toMatch(/VULNERABLE|resilient to|silent-wrong-result|possibly-wrong/)
      expect(describeCheck(def(r.name), stateOf(r))).toBeTruthy()
      if (r.status !== 'PASS') expect(r.reason?.code).toBeTruthy()
    }
  })

  it('the security_finding message gives no verdict about the vault', () => {
    const r = load('reference-vault-wording-pass.json').find((x) => x.reason?.code === 'security_finding')!
    expect(r.reason!.message).toContain('applies to that scenario only')
    expect(r.reason!.message.toLowerCase()).not.toContain('vulnerable')
  })
})
