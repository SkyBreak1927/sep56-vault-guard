import { useState } from 'react'
import { CHECK_DEFS, CHECK_GROUPS, type CheckDef, type CheckStatus } from '@/config/checks'
import { siteLinks } from '@/config/site'
import { describeCheck } from '@/lib/findings'
import { buildReport, downloadReport, summaryLines, type ReportFormat } from '@/lib/report'
import type { CheckRun } from '@/lib/types'
import { allSettled, countSettled, countStatuses, defsInGroup, formatDuration, useElapsed } from '@/lib/useCheckRun'
import { CopyButton } from '@/components/CopyButton'
import { ArrowRightIcon, ChevronRightIcon, DownloadIcon } from '@/components/Icons'
import { StatusBadge } from '@/components/StatusBadge'
import { accentOutlineButton, fieldLabel, panel } from '@/components/styles'

const FORMATS: { id: ReportFormat; label: string }[] = [
  { id: 'json', label: 'JSON' },
  { id: 'md', label: 'Markdown' },
]

/** Security checks that have an explainer in "Why it matters". */
const RISK_CHECKS = new Set(['donation_attack', 'rounding_direction', 'overflow_protection', 'access_control_probing'])

/** Tells "Why it matters" which risk to show; detail is the check id. */
export const SELECT_RISK_EVENT = 'aegis:select-risk'

const EVIDENCE_TITLE = 'Evidence from execution'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Filled disc + glyph for settled checks; rings for checks not yet settled.
const ICON_TONE: Record<CheckStatus, string> = {
  pending: 'border-[1.5px] border-line-strong',
  running: 'border-[1.5px] border-accent border-t-transparent motion-safe:animate-spin',
  pass: 'bg-pass text-canvas',
  fail: 'bg-fail text-canvas',
  warn: 'bg-warn text-canvas',
  inconclusive: 'bg-warn text-canvas',
  not_applicable: 'border-[1.5px] border-line-strong text-muted',
}

function StatusIcon({ status, className = 'size-5' }: { status: CheckStatus; className?: string }) {
  return (
    <span className={`inline-grid flex-none place-items-center rounded-full ${ICON_TONE[status]} ${className}`} aria-hidden="true">
      {status === 'pass' && (
        <svg viewBox="0 0 20 20" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 10.5 3.25 3.25L15 7" />
        </svg>
      )}
      {status === 'inconclusive' && (
        <svg viewBox="0 0 20 20" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 7.75a2.5 2.5 0 1 1 3.5 2.3c-.6.27-1 .86-1 1.5v.2M10 15v.01" />
        </svg>
      )}
      {status === 'not_applicable' && (
        <svg viewBox="0 0 20 20" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 10h8" />
        </svg>
      )}
      {(status === 'fail' || status === 'warn') && (
        <svg viewBox="0 0 20 20" className="size-[62%]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M10 5v6M10 15v.01" />
        </svg>
      )}
    </span>
  )
}

/** Verdict line under the report header — live while running, final once settled. */
function RunBanner({ run }: { run: CheckRun }) {
  const elapsed = useElapsed(run)
  const counts = countStatuses(run)
  const total = CHECK_DEFS.length
  const settled = countSettled(counts)
  const applicable = total - counts.not_applicable
  // "9 passed · 1 inconclusive · 11 total" — zero counts other than passed are left out.
  const tally = [
    `${counts.pass} passed`,
    counts.fail > 0 && `${counts.fail} failed`,
    counts.warn > 0 && `${counts.warn} warned`,
    counts.inconclusive > 0 && `${counts.inconclusive} inconclusive`,
    counts.not_applicable > 0 && `${counts.not_applicable} not applicable`,
    `${total} total`,
  ]
    .filter(Boolean)
    .join(' · ')

  let status: CheckStatus
  let title: string
  let tone: string
  let sub: string
  if (run.phase === 'error') {
    status = 'fail'
    title = 'Run failed'
    tone = 'text-fail'
    sub = run.message ?? 'The check stopped unexpectedly.'
  } else if (run.phase === 'running') {
    status = 'running'
    title = `Running — ${settled} of ${total} checks complete`
    tone = 'text-fg'
    sub = run.message ?? 'Processing…'
  } else if (counts.fail > 0) {
    status = 'fail'
    title = `${plural(counts.fail, 'check')} failed — review required`
    tone = 'text-fail'
    sub = tally
  } else if (counts.warn > 0) {
    status = 'warn'
    title = `${plural(counts.warn, 'check')} warned — review recommended`
    tone = 'text-warn'
    sub = tally
  } else if (counts.inconclusive > 0) {
    status = 'inconclusive'
    title = 'Some checks could not finish'
    tone = 'text-warn'
    sub = tally
  } else if (applicable === 0) {
    status = 'not_applicable'
    title = 'No applicable checks'
    tone = 'text-muted'
    sub = tally
  } else {
    status = 'pass'
    title = counts.not_applicable > 0 ? 'All applicable checks passed' : `All ${total} checks passed`
    tone = 'text-pass'
    sub = tally
  }

  const { summary, duration_seconds } = buildReport(run)
  const duration = run.phase === 'running' ? formatDuration(elapsed) : `${duration_seconds}s`

  return (
    <div className="flex flex-col justify-between gap-space-md border-y border-line py-space-md md:flex-row md:items-center">
      <div className="flex items-start gap-space-md">
        <StatusIcon status={status} className="mt-0.5 size-9" />
        <div className="flex flex-col gap-space-xs">
          {/* Only the verdict is live: the ticking timer would flood screen readers. */}
          <p role="status" className={`text-headline-lg-mobile md:text-headline-lg ${tone}`}>
            {title}
          </p>
          <p className="text-body-md text-muted tabular-nums">{sub}</p>
        </div>
      </div>
      <div className="flex flex-col gap-space-xs text-body-md text-muted tabular-nums md:items-end md:text-right">
        <p>
          {duration} {run.phase === 'running' ? 'elapsed' : 'duration'} ·{' '}
          Live Soroban testnet execution
        </p>
        {run.phase === 'done' && summaryLines(summary).slice(0, 2).map((line) => <p key={line}>{line}</p>)}
      </div>
    </div>
  )
}

function CheckList({ run, selected, onSelect }: { run: CheckRun; selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-space-md">
      {CHECK_GROUPS.map((group) => {
        const defs = defsInGroup(run, group.id)
        if (defs.length === 0) return null
        return (
          <div key={group.id} className="flex flex-col gap-space-xs">
            <h3 className={fieldLabel}>
              {group.title} ({defs.length})
            </h3>
            <ul className="border-b border-line">
              {defs.map((def) => {
                const { status } = run.checks[def.id]
                const active = def.id === selected
                return (
                  <li key={def.id} className="border-t border-line-row first:border-t-0">
                    <button
                      type="button"
                      aria-current={active || undefined}
                      className={[
                        'flex min-h-11 w-full cursor-pointer items-center gap-space-md px-space-md py-2 text-left transition-colors duration-150 ease-out',
                        active ? 'shadow-[inset_2px_0_0_var(--color-accent)]' : '',
                        status === 'fail'
                          ? active ? 'bg-fail-base/15' : 'bg-fail-base/10 hover:bg-fail-base/15'
                          : active ? 'bg-raised' : 'hover:bg-raised',
                      ].join(' ')}
                      onClick={() => onSelect(def.id)}
                    >
                      <StatusIcon status={status} />
                      <span className="min-w-0 flex-1 text-body-md text-fg">{def.name}</span>
                      <StatusBadge status={status} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function CheckDetail({ def, run }: { def: CheckDef; run: CheckRun }) {
  const state = run.checks[def.id]
  const finding = describeCheck(def, state)
  const raw = state.detail

  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex flex-wrap items-center gap-space-md">
        <h3 className="text-headline-lg-mobile text-fg md:text-headline-lg">{def.name}</h3>
        <StatusBadge status={state.status} />
      </div>

      <div className="flex flex-col gap-space-xs">
        <p className="text-headline-md text-fg">{finding.headline}</p>
        {finding.explanation && <p className="text-body-lg text-pretty text-muted">{finding.explanation}</p>}
      </div>

      {finding.evidence.length > 0 && (
        <section className={`${panel} overflow-hidden`} aria-label={EVIDENCE_TITLE}>
          <h4 className={`${fieldLabel} border-b border-line px-space-md py-2.5`}>{EVIDENCE_TITLE}</h4>
          <dl>
            {finding.evidence.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-space-md border-t border-line-row px-space-md py-2 first:border-t-0">
                <dt className="text-body-md text-fg">{row.label}</dt>
                <dd className={`text-right font-mono text-code-md tabular-nums ${row.alert ? 'text-fail' : 'text-fg'}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {finding.outcome && (
        <section className={`${panel} overflow-hidden`} aria-label="Economic outcome">
          <h4 className={`${fieldLabel} border-b border-line px-space-md py-2.5`}>Economic outcome (reported separately)</h4>
          <div className="flex flex-col gap-space-xs px-space-md py-3">
            <div className="flex flex-wrap items-center justify-between gap-space-md">
              <p className="text-body-md text-fg">{finding.outcome.label}</p>
              <p className={`font-mono text-code-md tabular-nums ${finding.outcome.alert ? 'text-fail' : 'text-fg'}`}>{finding.outcome.value}</p>
            </div>
            <p className="text-body-sm text-muted">{finding.outcome.note}</p>
          </div>
        </section>
      )}

      {raw && (
        // Copy sits beside, not inside, <details>: in <summary> a click would toggle
        // the panel, and other children are hidden while it's closed.
        <div className="relative">
          {/* Keyed per check; open by default when there's nothing parsed to show. */}
          <details key={def.id} className={`${panel} group`} open={finding.evidence.length === 0 && state.status !== 'pass'}>
            <summary className="flex cursor-pointer list-none items-center gap-space-sm py-3 pr-24 pl-space-md text-body-md text-fg [&::-webkit-details-marker]:hidden">
              <ChevronRightIcon className="size-4 text-muted transition-transform duration-150 ease-out group-open:rotate-90" />
              Raw execution output
            </summary>
            <pre className="mx-space-md mb-space-md rounded border border-line bg-canvas px-3 py-2 font-mono text-code-trace whitespace-pre-wrap break-words text-muted">
              {raw}
            </pre>
          </details>
          <CopyButton value={raw} label="Copy" showLabel className="absolute top-2.5 right-space-sm" />
        </div>
      )}

      {RISK_CHECKS.has(def.id) && (
        <a
          href={siteLinks.whyItMatters}
          onClick={() => window.dispatchEvent(new CustomEvent(SELECT_RISK_EVENT, { detail: def.id }))}
          className="inline-flex w-fit items-center gap-1.5 text-body-md text-accent underline decoration-accent/40 underline-offset-4 transition-colors duration-150 ease-out hover:text-accent-hover hover:decoration-accent-hover"
        >
          Explore this risk
          <ArrowRightIcon className="size-3.5" />
        </a>
      )}
    </div>
  )
}

/** Report for a started run: header, verdict banner, and a check list with a detail pane. */
export function VerificationReport({ run }: { run: CheckRun }) {
  const [format, setFormat] = useState<ReportFormat>('json')
  const [picked, setPicked] = useState<string | null>(null)
  const done = run.phase === 'done'

  const firstFailed = CHECK_DEFS.find((def) => run.checks[def.id].status === 'fail')
  const firstListed = defsInGroup(run, CHECK_GROUPS[0].id)[0] ?? CHECK_DEFS[0]
  const inProgress = CHECK_DEFS.find((def) => run.checks[def.id].status === 'running')
  // Follows the check in progress until the user picks one.
  const selected = CHECK_DEFS.find((def) => def.id === picked) ?? inProgress ?? firstFailed ?? firstListed

  const select = (id: string) => {
    setPicked(id)
    // Stacked layout: the detail pane sits below the whole list, so bring it into view.
    if (!window.matchMedia('(min-width: 1024px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      requestAnimationFrame(() =>
        document.getElementById('check-detail')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }),
      )
    }
  }

  const timestamp = done ? run.completedAt : run.startedAt
  const when = timestamp
    ? new Date(timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <div className="flex flex-col gap-space-lg">
      <div className="flex flex-col justify-between gap-space-md md:flex-row md:items-start">
        <div className="flex flex-col gap-space-sm">
          <h3 className="text-headline-xl-mobile text-fg md:text-headline-xl">Verification report</h3>
          <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-sm">
            <span className="inline-flex h-7 items-center rounded border border-line bg-surface px-3 text-label-md text-fg">Testnet</span>
            {when && (
              <span className="text-body-md text-muted md:border-l md:border-line md:pl-space-md">
                {done ? 'Completed' : 'Started'} {when}
              </span>
            )}
          </div>
        </div>

        {/* Only a fully settled run makes a meaningful report (a job can complete without data). */}
        {done && allSettled(run) && (
          <div className="flex flex-col items-start gap-space-sm md:items-center">
            <button
              type="button"
              className={accentOutlineButton}
              onClick={() => downloadReport(run, format)}
            >
              Export report
              <DownloadIcon className="size-4" />
            </button>
            <div className="flex items-center gap-1.5 text-body-sm" role="group" aria-label="Export format">
              {FORMATS.map((f, i) => (
                <span key={f.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-subtle" aria-hidden="true">·</span>}
                  <button
                    type="button"
                    aria-pressed={format === f.id}
                    className={`inline-flex cursor-pointer items-center px-1 transition-colors duration-150 ease-out pointer-coarse:min-h-11 ${
                      format === f.id ? 'text-fg underline decoration-accent underline-offset-4' : 'text-muted hover:text-fg'
                    }`}
                    onClick={() => setFormat(f.id)}
                  >
                    {f.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <RunBanner run={run} />

      {run.phase !== 'error' && (
        <div className="grid grid-cols-1 gap-space-xl lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-0">
          <div className="lg:border-r lg:border-line lg:pr-space-lg">
            <CheckList run={run} selected={selected.id} onSelect={select} />
          </div>
          <div id="check-detail" className="scroll-mt-20 lg:pl-space-xl">
            <CheckDetail def={selected} run={run} />
          </div>
        </div>
      )}
    </div>
  )
}
