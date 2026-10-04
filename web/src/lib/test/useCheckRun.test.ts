import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECK_DEFS } from '@/config/checks'
import { getJob, startCheck, type JobUpdate } from '@/services/api'
import type { CheckRun } from '../types'
import { allSettled, countSettled, countStatuses, formatDuration, useCheckRun, useElapsed } from '../useCheckRun'

vi.mock('@/services/api', () => ({ startCheck: vi.fn(), getJob: vi.fn() }))

const startCheckMock = vi.mocked(startCheck)
const getJobMock = vi.mocked(getJob)

const VAULT = 'CVAULT'
const POLL_INTERVAL_MS = 5000
const T0 = new Date('2026-01-01T00:00:00Z').getTime()

/** Lets pending promises (the hook's awaits) settle, then moves the clock. */
const advance = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

function renderRun() {
  const hook = renderHook(() => useCheckRun())
  const start = (vault = VAULT) => act(async () => void hook.result.current.start(vault))
  return { ...hook, start }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  startCheckMock.mockResolvedValue({ jobId: 'job-1', position: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('useCheckRun', () => {
  it('starts idle with every check pending', () => {
    const { result } = renderRun()
    expect(result.current.run.phase).toBe('idle')
    expect(result.current.run.vault).toBeNull()
    expect(Object.keys(result.current.run.checks)).toEqual(CHECK_DEFS.map((d) => d.id))
    for (const check of Object.values(result.current.run.checks)) {
      expect(check).toMatchObject({ status: 'pending', detail: null, settledAt: null })
    }
  })

  it('shows the queue position returned by startCheck', async () => {
    startCheckMock.mockResolvedValue({ jobId: 'job-1', position: 3 })
    getJobMock.mockReturnValue(new Promise(() => {}))
    const { result, start } = renderRun()

    await start()

    expect(startCheckMock).toHaveBeenCalledWith(VAULT)
    expect(result.current.run).toMatchObject({ phase: 'running', vault: VAULT, startedAt: T0, message: 'Waiting in queue — position 3' })
  })

  it('errors when the run cannot be started', async () => {
    startCheckMock.mockRejectedValue(new Error('Invalid vault address.'))
    const { result, start } = renderRun()

    await start()

    expect(result.current.run).toMatchObject({ phase: 'error', message: 'Invalid vault address.', completedAt: T0 })
    expect(getJobMock).not.toHaveBeenCalled()
  })

  it('applies snapshots while processing, then completes', async () => {
    getJobMock
      .mockResolvedValueOnce({ status: 'processing', queued: true, position: 2 })
      .mockResolvedValueOnce({
        status: 'processing',
        checks: [
          { id: 'deposit', group: 'conformance', status: 'pass', detail: 'ok' },
          { id: 'mint', group: 'conformance', status: 'running', detail: null },
        ],
      })
      .mockResolvedValueOnce({
        status: 'complete',
        checks: [
          { id: 'deposit', group: 'conformance', status: 'pass', detail: 'ok' },
          { id: 'mint', group: 'conformance', status: 'fail', detail: 'minted too few shares' },
        ],
      })
    const { result, start } = renderRun()

    await start()
    expect(result.current.run.message).toBe('Waiting in queue — position 2')

    await advance(POLL_INTERVAL_MS)
    expect(result.current.run.message).toBe('Processing… usually 1–2 minutes.')
    expect(result.current.run.checks.deposit).toEqual({ status: 'pass', detail: 'ok', settledAt: T0 + POLL_INTERVAL_MS, group: 'conformance' })
    expect(result.current.run.checks.mint).toEqual({ status: 'running', detail: null, settledAt: null, group: 'conformance' })

    await advance(POLL_INTERVAL_MS)
    const { run } = result.current
    expect(run).toMatchObject({ phase: 'done', message: 'Done.', completedAt: T0 + 2 * POLL_INTERVAL_MS })
    // A check keeps the time it first settled; one settling now gets the current time.
    expect(run.checks.deposit.settledAt).toBe(T0 + POLL_INTERVAL_MS)
    expect(run.checks.mint).toEqual({ status: 'fail', detail: 'minted too few shares', settledAt: T0 + 2 * POLL_INTERVAL_MS, group: 'conformance' })
    expect(run.checks.redeem.status).toBe('pending')
    expect(getJobMock).toHaveBeenCalledTimes(3)
    expect(getJobMock).toHaveBeenCalledWith('job-1')
  })

  it('ignores check ids it does not know and defaults missing fields', async () => {
    getJobMock.mockResolvedValue({
      status: 'complete',
      checks: [
        { id: 'not_a_check', group: 'security', status: 'fail', detail: 'x' },
        { id: 'deposit', group: 'conformance' } as never,
        { id: 'mint', group: 'conformance', status: 'pass', detail: '' },
      ],
    })
    const { result, start } = renderRun()

    await start()

    expect(result.current.run.checks).not.toHaveProperty('not_a_check')
    expect(result.current.run.checks.deposit).toEqual({ status: 'pending', detail: null, settledAt: null, group: 'conformance' })
    // An empty detail is no detail, as in app.js.
    expect(result.current.run.checks.mint.detail).toBeNull()
  })

  it('falls back to the legacy result rows when a completed job has no snapshot', async () => {
    getJobMock.mockResolvedValue({
      status: 'complete',
      checks: null,
      result: [
        { name: 'deposit', category: 'conformance', status: 'PASS', detail: '' },
        { name: 'donation_attack', category: 'security', status: 'FAIL', detail: 'share price inflated' },
      ],
    })
    const { result, start } = renderRun()

    await start()

    expect(result.current.run.phase).toBe('done')
    expect(result.current.run.checks.deposit).toEqual({ status: 'pass', detail: null, settledAt: T0, group: 'conformance' })
    expect(result.current.run.checks.donation_attack).toEqual({ status: 'fail', detail: 'share price inflated', settledAt: T0, group: 'security' })
  })

  it('maps legacy INCONCLUSIVE / NOT_APPLICABLE rows and their CLI categories', async () => {
    getJobMock.mockResolvedValue({
      status: 'complete',
      result: [
        { name: 'deposit', category: 'Security/Adversarial', status: 'INCONCLUSIVE', detail: 'no balance' },
        { name: 'donation_attack', category: 'Security/Adversarial', status: 'NOT_APPLICABLE', detail: '' },
        { name: 'mint', category: 'Positive Conformance', status: 'ERROR' as 'FAIL', detail: '' },
      ],
    })
    const { result, start } = renderRun()

    await start()

    const { checks } = result.current.run
    expect(checks.deposit).toEqual({ status: 'inconclusive', detail: 'no balance', settledAt: T0, group: 'security' })
    expect(checks.donation_attack).toMatchObject({ status: 'not_applicable', settledAt: T0, group: 'security' })
    expect(checks.mint).toMatchObject({ status: 'fail', group: 'conformance' })
  })

  it('treats inconclusive and not applicable as final, keeps a known group, and shows unknown statuses as pending', async () => {
    getJobMock.mockResolvedValue({
      status: 'complete',
      checks: [
        { id: 'deposit', group: 'security', status: 'inconclusive', detail: null },
        { id: 'mint', group: 'bogus', status: 'not_applicable', detail: null },
        { id: 'redeem', group: 'conformance', status: 'skipped' as 'pass', detail: null },
      ],
    })
    const { result, start } = renderRun()

    await start()

    const { checks } = result.current.run
    expect(checks.deposit).toMatchObject({ status: 'inconclusive', settledAt: T0, group: 'security' })
    expect(checks.mint).toMatchObject({ status: 'not_applicable', settledAt: T0, group: 'conformance' })
    expect(checks.redeem).toMatchObject({ status: 'pending', settledAt: null })
  })

  it('normalizes status case in both the snapshot and the legacy result rows', async () => {
    getJobMock
      .mockResolvedValueOnce({
        status: 'processing',
        checks: [{ id: 'deposit', group: 'conformance', status: 'PASS' as 'pass', detail: null }],
      })
      .mockResolvedValueOnce({
        status: 'complete',
        checks: null,
        result: [
          { name: 'deposit', category: 'Positive Conformance', status: 'pass' as 'PASS', detail: '' },
          { name: 'mint', category: 'Positive Conformance', status: 'Not_Applicable' as 'NOT_APPLICABLE', detail: '' },
        ],
      })
    const { result, start } = renderRun()

    await start()
    expect(result.current.run.checks.deposit.status).toBe('pass')

    await advance(POLL_INTERVAL_MS)
    expect(result.current.run.checks.mint.status).toBe('not_applicable')
  })

  it('completes with nothing to apply when a job has neither checks nor result', async () => {
    getJobMock.mockResolvedValue({ status: 'complete' })
    const { result, start } = renderRun()

    await start()

    expect(result.current.run.phase).toBe('done')
    expect(countStatuses(result.current.run).pending).toBe(CHECK_DEFS.length)
  })

  it('errors with the job error and keeps its last snapshot', async () => {
    getJobMock.mockResolvedValue({
      status: 'error',
      error: 'CLI exited with code 1',
      checks: [{ id: 'deposit', group: 'conformance', status: 'pass', detail: null }],
    })
    const { result, start } = renderRun()

    await start()

    expect(result.current.run).toMatchObject({ phase: 'error', message: 'CLI exited with code 1', completedAt: T0 })
    expect(result.current.run.checks.deposit.status).toBe('pass')
  })

  it('errors on a job error without a snapshot', async () => {
    getJobMock.mockResolvedValue({ status: 'error', error: 'boom' })
    const { result, start } = renderRun()

    await start()

    expect(result.current.run).toMatchObject({ phase: 'error', message: 'boom' })
    expect(countStatuses(result.current.run).pending).toBe(CHECK_DEFS.length)
  })

  it('errors when polling loses the connection', async () => {
    getJobMock.mockRejectedValue(new Error('Could not reach the checker backend: offline'))
    const { result, start } = renderRun()

    await start()

    expect(result.current.run).toMatchObject({
      phase: 'error',
      message: 'Lost connection while checking job status: Could not reach the checker backend: offline',
    })
  })

  it('gives up after the maximum number of polls', async () => {
    getJobMock.mockResolvedValue({ status: 'processing' })
    const { result, start } = renderRun()

    await start()
    await advance(150 * POLL_INTERVAL_MS)

    expect(getJobMock).toHaveBeenCalledTimes(150)
    expect(result.current.run.phase).toBe('error')
    expect(result.current.run.message).toMatch(/^Gave up waiting for a result/)
  })

  it('lets a new run supersede one still in flight', async () => {
    let resolveFirst!: (value: JobUpdate) => void
    getJobMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ status: 'complete', checks: [{ id: 'mint', group: 'conformance', status: 'warn', detail: null }] })
    startCheckMock
      .mockResolvedValueOnce({ jobId: 'job-1', position: null })
      .mockResolvedValueOnce({ jobId: 'job-2', position: null })
    const { result, start } = renderRun()

    await start('CFIRST')
    await start('CSECOND')
    await act(async () => resolveFirst({ status: 'complete', checks: [{ id: 'deposit', group: 'conformance', status: 'fail', detail: null }] }))

    expect(result.current.run.vault).toBe('CSECOND')
    expect(result.current.run.checks.mint.status).toBe('warn')
    expect(result.current.run.checks.deposit.status).toBe('pending')
  })

  it('drops a startCheck result that arrives after a newer run began', async () => {
    let resolveFirst!: (value: { jobId: string; position: number | null }) => void
    startCheckMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ jobId: 'job-2', position: null })
    getJobMock.mockReturnValue(new Promise(() => {}))
    const { result, start } = renderRun()

    await start('CFIRST')
    await start('CSECOND')
    await act(async () => resolveFirst({ jobId: 'job-1', position: 7 }))

    expect(result.current.run.message).not.toBe('Waiting in queue — position 7')
    expect(getJobMock).toHaveBeenCalledTimes(1)
    expect(getJobMock).toHaveBeenCalledWith('job-2')
  })

  it('stops polling after unmount', async () => {
    getJobMock.mockResolvedValue({ status: 'processing' })
    const { start, unmount } = renderRun()

    await start()
    expect(getJobMock).toHaveBeenCalledTimes(1)
    unmount()
    await advance(10 * POLL_INTERVAL_MS)

    expect(getJobMock).toHaveBeenCalledTimes(1)
  })
})

describe('useElapsed', () => {
  const baseRun = renderHook(() => useCheckRun()).result.current.run
  const at = (patch: Partial<CheckRun>): CheckRun => ({ ...baseRun, ...patch })

  it('is 0 before a run starts', () => {
    const { result } = renderHook(() => useElapsed(at({ phase: 'idle' })))
    expect(result.current).toBe(0)
  })

  it('ticks every second while running', async () => {
    const { result } = renderHook(() => useElapsed(at({ phase: 'running', startedAt: T0 })))
    expect(result.current).toBe(0)

    await advance(3000)

    expect(result.current).toBe(3000)
  })

  it('measures to completedAt once the run stops', () => {
    const { result } = renderHook(() => useElapsed(at({ phase: 'done', startedAt: T0, completedAt: T0 + 65_000 })))
    expect(result.current).toBe(65_000)
  })

  it('is 0 for a stopped run with no completion time', () => {
    const { result } = renderHook(() => useElapsed(at({ phase: 'error', startedAt: T0 })))
    expect(result.current).toBe(0)
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [999, '00:01'],
    [65_000, '01:05'],
    [600_000, '10:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected)
  })
})

describe('countStatuses', () => {
  const run = renderHook(() => useCheckRun()).result.current.run
  const withStatuses: CheckRun = {
    ...run,
    checks: {
      ...run.checks,
      deposit: { status: 'pass', detail: null, settledAt: T0, group: 'conformance' },
      mint: { status: 'fail', detail: null, settledAt: T0, group: 'conformance' },
      donation_attack: { status: 'warn', detail: null, settledAt: T0, group: 'security' },
      overflow_protection: { status: 'running', detail: null, settledAt: null, group: 'security' },
      rounding_direction: { status: 'inconclusive', detail: null, settledAt: T0, group: 'security' },
      // Reported by the backend as a security check.
      redeem: { status: 'not_applicable', detail: null, settledAt: T0, group: 'security' },
    },
  }

  it('counts every check', () => {
    expect(countStatuses(withStatuses)).toEqual({
      pass: 1,
      fail: 1,
      warn: 1,
      running: 1,
      inconclusive: 1,
      not_applicable: 1,
      pending: CHECK_DEFS.length - 6,
    })
  })

  it('counts every final status as settled, but not pending or running', () => {
    expect(countSettled(countStatuses(withStatuses))).toBe(5)
  })

  it('is settled only once every check has a final status', () => {
    expect(allSettled(withStatuses)).toBe(false)
    const final = Object.fromEntries(Object.entries(run.checks).map(([id, c]) => [id, { ...c, status: 'inconclusive' as const }]))
    expect(allSettled({ ...run, checks: final })).toBe(true)
  })

  it('counts one group only, by the group in the data', () => {
    const security = CHECK_DEFS.filter((d) => d.group === 'security').length
    expect(countStatuses(withStatuses, 'security')).toEqual({
      pass: 0,
      fail: 0,
      warn: 1,
      running: 1,
      inconclusive: 1,
      not_applicable: 1,
      pending: security - 3,
    })
  })
})
