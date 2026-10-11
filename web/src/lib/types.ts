import type { CheckGroup, CheckStatus } from '@/config/checks'

export interface CheckState {
  status: CheckStatus
  detail: string | null
  /**
   * Starts as the definition's group and is overwritten by what the backend
   * reports (`group` in the status file, `category` in the legacy result), so
   * group totals come from the data and not from a fixed 7 / 4 split.
   */
  group: CheckGroup
  /** Time the check reported a final status, as seen by this browser's polling. */
  settledAt: number | null
}

export type RunPhase = 'idle' | 'running' | 'done' | 'error'

export interface CheckRun {
  phase: RunPhase
  vault: string | null
  message: string | null
  startedAt: number | null
  /** Set when the run stops, whether it completed or errored. */
  completedAt: number | null
  checks: Record<string, CheckState>
}
