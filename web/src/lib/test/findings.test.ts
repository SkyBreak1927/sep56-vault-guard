import { describe, expect, it } from 'vitest'
import { CHECK_DEFS, type CheckStatus } from '@/config/checks'
import { describeCheck } from '../findings'
import type { CheckState } from '../types'

const def = (id: string) => CHECK_DEFS.find((d) => d.id === id)!
const donation = def('donation_attack')
const deposit = def('deposit')

const state = (status: CheckStatus, detail: string | null = null): CheckState => ({ status, detail, settledAt: null, group: 'conformance' })

/** Verdict detail in the shape check_donation_attack prints (cli/src/checks/mod.rs). */
const donationDetail = (shares: number, pct: number, pnl: string) =>
  'fresh vault CVAULT (decimals_offset=0): attacker deposited 1 stroop(s) then donated 100000000 stroops directly ' +
  '(bypassing deposit()); victim then deposited 5000000 stroops and received ' +
  `${shares} shares (${pct}% of the 5000000 expected from an undisturbed deposit at this vault's decimals_offset); ${pnl}`

describe('describeCheck', () => {
  describe('donation attack', () => {
    it('explains a failure where the victim got zero shares, with the attacker profit', () => {
      const detail = donationDetail(0, 0, 'attacker P&L: NET PROFIT of 4999999 stroops (spent 100000001, redeemed 105000000)')

      expect(describeCheck(donation, state('fail', detail))).toEqual({
        headline: 'The victim deposit was accepted but minted zero shares.',
        explanation: 'A direct donation changed the share price before the victim deposited.',
        evidence: [
          { label: 'Initial attacker deposit', value: '1 stroop' },
          { label: 'Direct donation', value: '100,000,000 stroops' },
          { label: 'Victim deposit', value: '5,000,000 stroops' },
          { label: 'Shares received', value: '0 shares', alert: true },
        ],
        outcome: {
          label: 'Attacker net outcome',
          value: '+4,999,999 stroops (profit)',
          alert: true,
          note: "Reported separately — it does not affect this check's verdict.",
        },
      })
    })

    it('reports the share of the expected amount when the victim got some shares', () => {
      const detail = donationDetail(250000, 5, 'attacker P&L: net loss of 12 stroops (spent 100000001, redeemed 99999989)')

      const finding = describeCheck(donation, state('fail', detail))

      expect(finding.headline).toBe('The victim received only 5% of the shares they were owed.')
      expect(finding.evidence.at(-1)).toEqual({ label: 'Shares received', value: '250,000 shares', alert: true })
      expect(finding.outcome?.value).toBe('−12 stroops (loss)')
    })

    it('explains a pass without alerts', () => {
      const detail = donationDetail(5000000, 100, 'attacker P&L: net loss of 100000000 stroops (spent 100000001, redeemed 1)')

      const finding = describeCheck(donation, state('pass', detail))

      expect(finding.headline).toBe('The victim still received a proportional share of the vault.')
      expect(finding.explanation).toBe("A direct donation before the victim's deposit did not dilute their shares.")
      expect(finding.evidence.some((row) => row.alert)).toBe(false)
      expect(finding.outcome).toMatchObject({ value: '−100,000,000 stroops (loss)', alert: false })
    })

    it('omits the outcome when the P&L could not be determined', () => {
      const detail = donationDetail(0, 0, 'attacker P&L: attacker holds 0 shares, nothing to redeem; spent 100000001')

      const finding = describeCheck(donation, state('fail', detail))

      expect(finding.evidence).toHaveLength(4)
      expect(finding.outcome).toBeNull()
    })

    it('falls back to the generic text when the verdict is not recognised', () => {
      expect(describeCheck(donation, state('fail', 'vault deploy failed'))).toEqual({
        headline: 'This check did not pass.',
        explanation: donation.description,
        evidence: [],
        outcome: null,
      })
      expect(describeCheck(donation, state('pass')).headline).toBe(donation.description)
    })

    it('does not parse the detail of a check that has not settled', () => {
      const detail = donationDetail(0, 0, 'attacker P&L: NET PROFIT of 1 stroops (spent 1, redeemed 2)')

      expect(describeCheck(donation, state('warn', detail)).headline).toBe('This check passed with a warning.')
      expect(describeCheck(donation, state('running', detail)).evidence).toEqual([])
    })
  })

  describe('other checks', () => {
    it('uses the check description as the headline on a pass', () => {
      expect(describeCheck(deposit, state('pass', 'ok'))).toEqual({
        headline: deposit.description,
        explanation: null,
        evidence: [],
        outcome: null,
      })
    })

    it.each([
      ['pending', 'Waiting to run.'],
      ['running', 'Running against the vault…'],
      ['fail', 'This check did not pass.'],
      ['warn', 'This check passed with a warning.'],
      ['inconclusive', 'This check could not reach a verdict — a prerequisite was not met.'],
      ['not_applicable', "This check does not apply to this vault's design."],
    ] as const)('uses a generic headline when %s', (status, headline) => {
      expect(describeCheck(deposit, state(status))).toEqual({
        headline,
        explanation: deposit.description,
        evidence: [],
        outcome: null,
      })
    })

    it('ignores a donation-shaped detail on another check', () => {
      const detail = donationDetail(0, 0, 'attacker P&L: NET PROFIT of 1 stroops (spent 1, redeemed 2)')
      expect(describeCheck(deposit, state('fail', detail)).evidence).toEqual([])
    })
  })
})
