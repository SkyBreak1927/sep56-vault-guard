import type { CheckDef } from '@/config/checks'
import type { CheckState } from './types'

export interface EvidenceRow {
  label: string
  value: string
  /** Highlighted in the fail tone — the value that broke the check. */
  alert?: boolean
}

export interface Finding {
  headline: string
  explanation: string | null
  /** Figures parsed from the check's own output; empty when it has none we recognise. */
  evidence: EvidenceRow[]
  /** Supplementary context the CLI reports alongside, not as part of, the verdict. */
  outcome: (EvidenceRow & { note: string }) | null
}

const num = (value: string) => Number(value).toLocaleString('en-US')
const stroops = (value: string) => `${num(value)} ${value === '1' ? 'stroop' : 'stroops'}`

// Mirrors the verdict string built by check_donation_attack in the CLI
// (sep56-vault-guard cli/src/checks/mod.rs).
const DONATION_RE =
  /attacker deposited (\d+) stroop\(s\) then donated (\d+) stroops.*?victim then deposited (\d+) stroops and received (\d+) shares \((\d+)% of the/
const PNL_RE = /attacker P&L: (?:NET PROFIT of (\d+)|net loss of (\d+)) stroops/

function donationFinding(state: CheckState): Finding | null {
  const match = state.detail?.match(DONATION_RE)
  if (!match) return null
  const [, attacker, donation, victim, shares, pct] = match
  const failed = state.status === 'fail'

  const pnl = state.detail?.match(PNL_RE)
  const outcome = pnl
    ? {
        label: 'Attacker net outcome',
        value: pnl[1] ? `+${num(pnl[1])} stroops (profit)` : `−${num(pnl[2])} stroops (loss)`,
        alert: failed,
        note: "Reported separately — it does not affect this check's verdict.",
      }
    : null

  return {
    headline: failed
      ? shares === '0'
        ? 'The victim deposit was accepted but minted zero shares.'
        : `The victim received only ${pct}% of the shares they were owed.`
      : 'The victim still received a proportional share of the vault.',
    explanation: failed
      ? 'A direct donation changed the share price before the victim deposited.'
      : "A direct donation before the victim's deposit did not dilute their shares.",
    evidence: [
      { label: 'Initial attacker deposit', value: stroops(attacker) },
      { label: 'Direct donation', value: stroops(donation) },
      { label: 'Victim deposit', value: stroops(victim) },
      { label: 'Shares received', value: `${num(shares)} shares`, alert: failed },
    ],
    outcome,
  }
}

const GENERIC_HEADLINE = {
  pending: 'Waiting to run.',
  running: 'Running against the vault…',
  fail: 'This check did not pass.',
  warn: 'This check passed with a warning.',
  inconclusive: 'This check could not reach a verdict — a prerequisite was not met.',
  not_applicable: "This check does not apply to this vault's design.",
} as const

/** Human-readable summary of one check's result, for the report's detail pane. */
export function describeCheck(def: CheckDef, state: CheckState): Finding {
  if (def.id === 'donation_attack' && (state.status === 'pass' || state.status === 'fail')) {
    const finding = donationFinding(state)
    if (finding) return finding
  }
  if (state.status === 'pass') return { headline: def.description, explanation: null, evidence: [], outcome: null }
  return { headline: GENERIC_HEADLINE[state.status], explanation: def.description, evidence: [], outcome: null }
}
