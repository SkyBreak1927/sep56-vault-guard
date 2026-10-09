'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CHECK_DEFS, CHECK_STATUSES, FINAL_STATUSES, type CheckGroup, type CheckStatus } from '@/config/checks'
import { getJob, startCheck, type ApiCheck, type ApiLegacyResult } from '@/services/api'
import type { CheckRun } from './types'

const initialRun: CheckRun = {
  phase: 'idle',
  vault: null,
  message: null,
  startedAt: null,
  completedAt: null,
  checks: Object.fromEntries(CHECK_DEFS.map((def) => [def.id, { status: 'pending', detail: null, settledAt: null, group: def.group }])),
}

const POLL_INTERVAL_MS = 5000
/** ~12.5 minutes: past the backend's own timeout plus a long queue ahead of this one. */
const MAX_POLLS = 150

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isCheckGroup = (value: unknown): value is CheckGroup => value === 'conformance' || value === 'security'

/** Merges a status snapshot into the run, stamping checks that just reached a final status. */
function applyChecks(checks: CheckRun['checks'], update: ApiCheck[]) {
  const now = Date.now()
  const next = { ...checks }
  for (const c of update) {
    const prev = next[c.id]
    if (!prev) continue
    // `checks` is lowercase and `result` uppercase; normalize so either matches.
    // A status string this UI does not know is not final; show it as pending.
    const raw = String(c.status).toLowerCase() as CheckStatus
    const status = CHECK_STATUSES.includes(raw) ? raw : 'pending'
    const settledAt = prev.settledAt ?? (FINAL_STATUSES.has(status) ? now : null)
    const group = isCheckGroup(c.group) ? c.group : prev.group
    next[c.id] = { status, detail: c.detail || null, settledAt, group }
  }
  return next
}

const LEGACY_STATUS: Partial<Record<string, CheckStatus>> = { pass: 'pass', inconclusive: 'inconclusive', not_applicable: 'not_applicable' }
const LEGACY_GROUP: Partial<Record<string, CheckGroup>> = { 'Positive Conformance': 'conformance', 'Security/Adversarial': 'security' }

/**
 * Fallback for a completed job with no cached snapshot: the CLI's --output json
 * rows. Any status other than PASS / INCONCLUSIVE / NOT_APPLICABLE (any case) is a failure.
 */
function legacyToChecks(result: ApiLegacyResult[]): ApiCheck[] {
  return result.map((r) => ({
    id: r.name,
    group: LEGACY_GROUP[r.category] ?? '',
    status: LEGACY_STATUS[String(r.status).toLowerCase()] ?? 'fail',
    detail: r.detail || null,
  }))
}

/**
 * Check run state for the report UI. Queues the vault on the checker backend
 * (server/), then polls the job, applying each per-check snapshot as it
 * arrives — conformance checks settle in order while security checks run
 * alongside them, so results land in no fixed overall order.
 */
export function useCheckRun() {
  const [run, setRun] = useState<CheckRun>(initialRun)
  // Bumped on every start/unmount so a superseded run stops itself.
  const runToken = useRef(0)

  useEffect(() => () => void runToken.current++, [])

  const start = useCallback(async (vault: string) => {
    const token = ++runToken.current
    const stale = () => token !== runToken.current
    const fail = (message: string) => setRun((r) => ({ ...r, phase: 'error', message, completedAt: Date.now() }))

    setRun({ ...initialRun, phase: 'running', vault, message: 'Starting checks… this can take about a minute or longer.', startedAt: Date.now() })

    let jobId: string
    try {
      const started = await startCheck(vault)
      jobId = started.jobId
      if (stale()) return
      if (started.position) setRun((r) => ({ ...r, message: `Waiting in queue — position ${started.position}` }))
    } catch (err) {
      if (!stale()) fail((err as Error).message)
      return
    }

    for (let poll = 0; poll < MAX_POLLS; poll++) {
      let job
      try {
        job = await getJob(jobId)
      } catch (err) {
        if (!stale()) fail(`Lost connection while checking job status: ${(err as Error).message}`)
        return
      }
      if (stale()) return

      if (job.status === 'processing') {
        const message = job.queued ? `Waiting in queue — position ${job.position}` : 'Processing… this can take about a minute or longer.'
        setRun((r) => ({ ...r, message, checks: job.checks ? applyChecks(r.checks, job.checks) : r.checks }))
        await sleep(POLL_INTERVAL_MS)
        if (stale()) return
        continue
      }

      if (job.status === 'complete') {
        const checks = job.checks ?? (job.result ? legacyToChecks(job.result) : [])
        setRun((r) => ({ ...r, phase: 'done', message: 'Done.', completedAt: Date.now(), checks: applyChecks(r.checks, checks) }))
        return
      }

      setRun((r) => ({ ...r, checks: job.checks ? applyChecks(r.checks, job.checks) : r.checks }))
      return fail(job.error)
    }

    if (!stale()) fail('Gave up waiting for a result — the check is taking unusually long. Please try again later.')
  }, [])

  return { run, start }
}

/** Ticks once a second while a run is in progress; returns elapsed ms. */
export function useElapsed(run: CheckRun) {
  const [now, setNow] = useState(() => Date.now())
  const ticking = run.phase === 'running'

  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ticking])

  if (!run.startedAt) return 0
  const end = run.completedAt ?? (ticking ? now : run.startedAt)
  return Math.max(0, end - run.startedAt)
}

export function formatDuration(ms: number) {
  const total = Math.round(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Definitions the run's data currently puts in `group`, in definition order. */
export function defsInGroup(run: CheckRun, group: CheckGroup) {
  return CHECK_DEFS.filter((def) => run.checks[def.id].group === group)
}

/** Settled = reached a final status (pass, fail, warn, inconclusive, not applicable). */
export function countSettled(counts: Record<CheckStatus, number>) {
  return counts.pass + counts.fail + counts.warn + counts.inconclusive + counts.not_applicable
}

/** Every check reached a final status: the run can be exported as a report. */
export function allSettled(run: CheckRun) {
  return CHECK_DEFS.every((def) => FINAL_STATUSES.has(run.checks[def.id].status))
}

export function countStatuses(run: CheckRun, group?: CheckGroup) {
  const counts = Object.fromEntries(CHECK_STATUSES.map((s) => [s, 0])) as Record<CheckStatus, number>
  for (const def of group ? defsInGroup(run, group) : CHECK_DEFS) {
    counts[run.checks[def.id].status] += 1
  }
  return counts
}
