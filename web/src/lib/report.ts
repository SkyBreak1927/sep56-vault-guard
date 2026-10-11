import { CHECK_DEFS, type CheckGroup, type CheckStatus } from '@/config/checks'
import type { CheckRun } from './types'
import { countStatuses, defsInGroup } from './useCheckRun'

export type ReportFormat = 'json' | 'md'

const GROUP_LABEL: Record<CheckGroup, string> = { conformance: 'Core function checks', security: 'Basic security checks' }

/**
 * Headline for the run as a whole. A warn stays on the "Remediation needed"
 * side, as it was before inconclusive / not applicable existed.
 */
export function summaryTitle(counts: Record<CheckStatus, number>, total: number) {
  if (counts.fail > 0 || counts.warn > 0) return 'Remediation needed'
  if (counts.inconclusive > 0) return 'Some checks could not finish'
  if (total - counts.not_applicable === 0) return 'No applicable checks'
  if (counts.not_applicable > 0) return 'All applicable checks passed'
  return 'All checks passed'
}

/**
 * Per-group "X of N passed", where N is the checks the data puts in that group
 * that are not "not applicable" (inconclusive ones still count). There is
 * deliberately no single overall percentage.
 */
export function groupProgress(run: CheckRun, group: CheckGroup) {
  const counts = countStatuses(run, group)
  return { passed: counts.pass, total: defsInGroup(run, group).length - counts.not_applicable }
}

type Summary = Report['summary']

export function summaryLines(summary: Summary) {
  const lines = (['conformance', 'security'] as const).map((group) => {
    const { passed, total } = summary.groups[group]
    return total === 0 ? `${GROUP_LABEL[group]}: not applicable` : `${GROUP_LABEL[group]}: ${passed} of ${total} passed`
  })
  if (summary.inconclusive > 0) lines.push(`Inconclusive: ${summary.inconclusive}`)
  if (summary.not_applicable > 0) lines.push(`Not applicable: ${summary.not_applicable}`)
  return lines
}

export function buildReport(run: CheckRun) {
  const counts = countStatuses(run)
  const startedAt = run.startedAt ?? 0
  const completedAt = run.completedAt ?? startedAt
  return {
    tool: 'Aegis Vault',
    vault: run.vault ?? '',
    network: 'testnet',
    started_at: new Date(startedAt).toISOString(),
    completed_at: new Date(completedAt).toISOString(),
    duration_seconds: Math.round((completedAt - startedAt) / 1000),
    summary: {
      total: CHECK_DEFS.length,
      pass: counts.pass,
      fail: counts.fail,
      warn: counts.warn,
      inconclusive: counts.inconclusive,
      not_applicable: counts.not_applicable,
      groups: { conformance: groupProgress(run, 'conformance'), security: groupProgress(run, 'security') },
      title: summaryTitle(counts, CHECK_DEFS.length),
    },
    checks: CHECK_DEFS.map((def, i) => {
      const state = run.checks[def.id]
      return {
        number: i + 1,
        id: def.id,
        group: state.group,
        name: def.name,
        status: state.status,
        detail: state.detail,
        settled_at: state.settledAt ? new Date(state.settledAt).toISOString() : null,
      }
    }),
    timing_note: 'Timestamps are recorded by the browser while polling the backend every 5 s, so each is accurate to about 5 s.',
  }
}

export type Report = ReturnType<typeof buildReport>

function reportMarkdown(data: Report) {
  const lines = [
    '# Aegis Vault — Conformance Verification Report',
    '',
    `- Vault: \`${data.vault}\``,
    `- Network: ${data.network}`,
    `- Started: ${data.started_at}`,
    `- Completed: ${data.completed_at}`,
    `- Duration: ${data.duration_seconds} s`,
    `- Result: ${data.summary.title}`,
    ...summaryLines(data.summary).map((line) => `- ${line}`),
    '',
  ]
  for (const [group, title] of [['conformance', 'Conformance checks'], ['security', 'Security checks']]) {
    lines.push(`## ${title}`, '', '| # | Check | Status | Settled at | Detail |', '|---|---|---|---|---|')
    for (const c of data.checks.filter((c) => c.group === group)) {
      const detail = (c.detail ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| ${String(c.number).padStart(2, '0')} | ${c.name} | ${c.status.toUpperCase()} | ${c.settled_at ?? '—'} | ${detail} |`)
    }
    lines.push('')
  }
  lines.push(`_${data.timing_note}_`, '')
  return lines.join('\n')
}

/** Saves the report as a JSON or Markdown file via a temporary download link. */
export function downloadReport(run: CheckRun, format: ReportFormat) {
  const data = buildReport(run)
  const isMd = format === 'md'
  const blob = new Blob([isMd ? reportMarkdown(data) : JSON.stringify(data, null, 2)], {
    type: isMd ? 'text/markdown' : 'application/json',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `aegis-vault-report-${data.vault.slice(0, 8)}-${data.completed_at.replace(/[:.]/g, '-')}.${format}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 0)
}
