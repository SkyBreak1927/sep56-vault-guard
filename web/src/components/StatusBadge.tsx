import type { CheckStatus } from '@/config/checks'

const LABEL: Record<CheckStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  pass: 'Pass',
  fail: 'Fail',
  warn: 'Warn',
  inconclusive: 'Inconclusive',
  not_applicable: 'Not applicable',
}

// DESIGN.md › Chips & Test Badges. "Pending / Invariant Check" (amber) marks a
// check in flight; checks not yet started use the tertiary "inactive" text.
const TONE: Record<CheckStatus, string> = {
  pending: 'border-line text-muted',
  running: 'border-accent/20 bg-accent/10 text-pending',
  pass: 'border-pass-base/20 bg-pass-base/10 text-pass',
  fail: 'border-fail-base/20 bg-fail-base/10 text-fail',
  warn: 'border-warn/20 bg-warn/10 text-warn',
  // No verdict: warn tone, as in the legacy UI. Not applicable is neutral.
  inconclusive: 'border-warn/20 bg-warn/10 text-warn',
  not_applicable: 'border-line-strong bg-raised text-muted',
}

/** Check status chip; `children` overrides the label (e.g. "9 Pass"). */
export function StatusBadge({ status, children }: { status: CheckStatus; children?: string }) {
  return (
    <span
      className={`inline-flex h-[22px] flex-none items-center gap-1.5 rounded border px-2 font-mono text-code-sm font-medium whitespace-nowrap uppercase tabular-nums ${TONE[status]}`}
    >
      {status === 'running' && <span className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" aria-hidden="true" />}
      {children ?? LABEL[status]}
    </span>
  )
}
