import type { CheckStatus } from '@/config/checks'

/**
 * Client for the check-suite backend in server/ (Express, runs the CLI).
 * POST /api/check queues a run and returns a job id; GET /api/check/:jobId
 * reports progress, with `checks` taken from the CLI's --status-file.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/+$/, '')

/** One entry of the CLI's --status-file snapshot. */
export interface ApiCheck {
  id: string
  group: string
  /** Lowercase, but normalized before use; see useCheckRun. */
  status: CheckStatus
  detail: string | null
  /** Machine-readable cause for inconclusive / not_applicable, e.g. `insufficient_token_balance`. */
  reason_code?: string | null
}

/** The CLI's --output json shape, sent as `result` once a job completes. */
export interface ApiLegacyResult {
  name: string
  category: string
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_APPLICABLE'
  detail: string
  reason_code?: string | null
}

export type JobUpdate =
  | { status: 'processing'; checks?: ApiCheck[]; queued?: boolean; position?: number }
  | { status: 'complete'; checks?: ApiCheck[] | null; result?: ApiLegacyResult[] }
  | { status: 'error'; error: string; checks?: ApiCheck[] | null }

export class CheckerApiError extends Error {}

async function request(path: string, init?: RequestInit) {
  if (!API_BASE) throw new CheckerApiError('The checker backend is not configured (NEXT_PUBLIC_API_BASE is unset).')
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch (err) {
    throw new CheckerApiError(`Could not reach the checker backend: ${(err as Error).message}`)
  }
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

/** Queues a run; resolves with the job id and, if it is waiting, its queue position. */
export async function startCheck(vault: string): Promise<{ jobId: string; position: number | null }> {
  const { ok, body } = await request('/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault }),
  })
  if (!ok || typeof body.jobId !== 'string') throw new CheckerApiError(body.error || 'Failed to start the check.')
  return { jobId: body.jobId, position: body.queued ? body.position : null }
}

/** Shown when the backend no longer knows the job: kept 10 minutes, and lost on a server restart. */
export const JOB_EXPIRED_MESSAGE = 'This result has expired. Run the check again.'

/**
 * Polls one job. A failed run (HTTP 502, with `error` in the body) comes back as
 * `{ status: 'error' }`, not a throw; so does an unknown or expired job (404).
 */
export async function getJob(jobId: string): Promise<JobUpdate> {
  const { status, body } = await request(`/api/check/${encodeURIComponent(jobId)}`)
  if (status === 404) return { status: 'error', error: JOB_EXPIRED_MESSAGE }
  if (body.status === 'processing' || body.status === 'complete') return body
  return { status: 'error', error: body.error || 'The check failed for an unknown reason.', checks: body.checks }
}
