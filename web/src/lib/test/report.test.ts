import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { CHECK_DEFS } from '@/config/checks'
import { buildReport, downloadReport } from '../report'
import { summaryLines, summaryTitle } from '../report'
import type { CheckRun, CheckState } from '../types'

const T0 = Date.parse('2026-01-01T00:00:00Z')
const VAULT = 'CABCDEFGHIJKLMNOPQRSTUVWXYZ'

const pending: Omit<CheckState, 'group'> = { status: 'pending', detail: null, settledAt: null }

function makeRun(patch: Partial<CheckRun> = {}, checks: Record<string, Partial<CheckState>> = {}): CheckRun {
  return {
    phase: 'done',
    vault: VAULT,
    message: 'Done.',
    startedAt: T0,
    completedAt: T0 + 95_400,
    checks: Object.fromEntries(CHECK_DEFS.map((d) => [d.id, { ...pending, group: d.group, ...checks[d.id] }])),
    ...patch,
  }
}

const run = makeRun(
  {},
  {
    deposit: { status: 'pass', detail: 'ok', settledAt: T0 + 10_000 },
    mint: { status: 'fail', detail: 'got 0 | expected 5\nshares', settledAt: T0 + 20_000 },
    donation_attack: { status: 'warn', detail: null, settledAt: T0 + 30_000 },
  },
)

describe('buildReport', () => {
  it('summarises the run', () => {
    const report = buildReport(run)

    expect(report).toMatchObject({
      tool: 'Aegis Vault',
      vault: VAULT,
      network: 'testnet',
      started_at: '2026-01-01T00:00:00.000Z',
      completed_at: '2026-01-01T00:01:35.400Z',
      duration_seconds: 95,
      summary: {
        total: CHECK_DEFS.length,
        pass: 1,
        fail: 1,
        warn: 1,
        inconclusive: 0,
        not_applicable: 0,
        groups: { conformance: { passed: 1, total: 7 }, security: { passed: 0, total: 4 } },
        title: 'Remediation needed',
      },
    })
    expect(report.timing_note).toMatch(/every 5 s/)
  })

  it('lists every check in definition order, numbered from 1', () => {
    const { checks } = buildReport(run)

    expect(checks.map((c) => c.id)).toEqual(CHECK_DEFS.map((d) => d.id))
    expect(checks.map((c) => c.number)).toEqual(CHECK_DEFS.map((_, i) => i + 1))
    expect(checks.find((c) => c.id === 'deposit')).toEqual({
      number: CHECK_DEFS.findIndex((d) => d.id === 'deposit') + 1,
      id: 'deposit',
      group: 'conformance',
      name: 'Deposit conformance',
      status: 'pass',
      detail: 'ok',
      settled_at: '2026-01-01T00:00:10.000Z',
    })
    expect(checks.find((c) => c.id === 'redeem')).toMatchObject({ status: 'pending', detail: null, settled_at: null })
  })

  it('treats a run that never completed as zero-length', () => {
    const report = buildReport(makeRun({ completedAt: null }))

    expect(report.completed_at).toBe(report.started_at)
    expect(report.duration_seconds).toBe(0)
  })

  it('falls back to the epoch and an empty vault for a run that never started', () => {
    const report = buildReport(makeRun({ vault: null, startedAt: null, completedAt: null }))

    expect(report.vault).toBe('')
    expect(report.started_at).toBe('1970-01-01T00:00:00.000Z')
    expect(report.summary.groups.conformance).toEqual({ passed: 0, total: 7 })
  })

  it('leaves not-applicable checks out of a group total and takes the group from the data', () => {
    const report = buildReport(
      makeRun(
        {},
        {
          ...Object.fromEntries(CHECK_DEFS.map((d) => [d.id, { status: 'pass' as const }])),
          donation_attack: { status: 'not_applicable' },
          overflow_protection: { status: 'inconclusive' },
          // The backend moved this one into the security group.
          redeem: { status: 'pass', group: 'security' },
        },
      ),
    )

    expect(report.summary).toMatchObject({
      inconclusive: 1,
      not_applicable: 1,
      groups: { conformance: { passed: 6, total: 6 }, security: { passed: 3, total: 4 } },
      title: 'Some checks could not finish',
    })
    expect(report.checks.find((c) => c.id === 'redeem')?.group).toBe('security')
  })
})

describe('summaryTitle', () => {
  const counts = (patch: Partial<Record<string, number>>) =>
    ({ pending: 0, running: 0, pass: 0, fail: 0, warn: 0, inconclusive: 0, not_applicable: 0, ...patch }) as Parameters<typeof summaryTitle>[0]

  it.each([
    [{ pass: 10, fail: 1 }, 'Remediation needed'],
    [{ pass: 10, warn: 1 }, 'Remediation needed'],
    [{ pass: 10, inconclusive: 1 }, 'Some checks could not finish'],
    [{ not_applicable: 11 }, 'No applicable checks'],
    [{ pass: 10, not_applicable: 1 }, 'All applicable checks passed'],
    [{ pass: 11 }, 'All checks passed'],
  ])('%o → %s', (patch, title) => {
    expect(summaryTitle(counts(patch), 11)).toBe(title)
  })
})

describe('summaryLines', () => {
  it('says a group with no applicable checks is not applicable, and lists extra counts', () => {
    const { summary } = buildReport(
      makeRun({}, {
        ...Object.fromEntries(CHECK_DEFS.filter((d) => d.group === 'security').map((d) => [d.id, { status: 'not_applicable' as const }])),
        deposit: { status: 'inconclusive' },
      }),
    )

    expect(summaryLines(summary)).toEqual([
      'Core function checks: 0 of 7 passed',
      'Basic security checks: not applicable',
      'Inconclusive: 1',
      'Not applicable: 4',
    ])
  })
})

describe('downloadReport', () => {
  let blob: Blob | undefined
  let click: MockInstance<HTMLAnchorElement['click']>
  /** The anchor downloadReport clicked. */
  const clicked = () => click.mock.contexts[0] as HTMLAnchorElement | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    blob = undefined
    // jsdom has no object URLs.
    URL.createObjectURL = vi.fn((b: Blob) => ((blob = b), 'blob:report'))
    URL.revokeObjectURL = vi.fn()
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('downloads the report as JSON', async () => {
    downloadReport(run, 'json')

    expect(clicked()?.download).toBe('aegis-vault-report-CABCDEFG-2026-01-01T00-01-35-400Z.json')
    expect(clicked()?.href).toBe('blob:report')
    expect(blob?.type).toBe('application/json')
    expect(JSON.parse(await blob!.text())).toEqual(buildReport(run))
  })

  it('downloads the report as Markdown, grouped and with escaped details', async () => {
    downloadReport(run, 'md')

    expect(clicked()?.download).toMatch(/\.md$/)
    expect(blob?.type).toBe('text/markdown')
    const md = await blob!.text()
    expect(md).toMatch(/^# Aegis Vault — Conformance Verification Report\n/)
    expect(md).toContain(`- Vault: \`${VAULT}\``)
    expect(md).toContain('- Duration: 95 s')
    expect(md).toContain('- Result: Remediation needed\n- Core function checks: 1 of 7 passed\n- Basic security checks: 0 of 4 passed\n')
    expect(md.indexOf('## Conformance checks')).toBeLessThan(md.indexOf('## Security checks'))
    expect(md).toContain('| Mint conformance | FAIL | 2026-01-01T00:00:20.000Z | got 0 \\| expected 5 shares |')
    expect(md).toContain('| Redeem conformance | PENDING | — |  |')
    expect(md.trimEnd().endsWith(`_${buildReport(run).timing_note}_`)).toBe(true)
  })

  it('removes the temporary link and revokes its URL', () => {
    downloadReport(run, 'json')

    expect(clicked()?.isConnected).toBe(false)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report')
  })
})
