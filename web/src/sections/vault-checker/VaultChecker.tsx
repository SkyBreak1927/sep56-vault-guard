'use client'

import { SectionAmbience } from '@/components/Ambience'
import { useCheckRun } from '@/lib/useCheckRun'
import { ReportEmptyState } from './ReportEmptyState'
import { RunForm } from './RunForm'
import { VerificationReport } from './VerificationReport'

/** Try it → Report: the run form and the verification report share one check run. */
export function VaultChecker() {
  const { run, start } = useCheckRun()

  return (
    // Its own full-height band (like Why it matters) so jumping to #try-it lands on a clean screen.
    <div className="relative min-h-[calc(100svh-4rem)]">
      <SectionAmbience glow="try-glow" />
      <RunForm running={run.phase === 'running'} onRun={start} />
      <section id="results" aria-label="Verification report" className="shell">
        {run.phase === 'idle' ? (
          <div className="pb-space-xl">
            <ReportEmptyState />
          </div>
        ) : (
          <div className="py-space-xl">
            {/* Keyed by run so the selected check resets for each new run. */}
            <VerificationReport key={run.startedAt} run={run} />
          </div>
        )}
      </section>
    </div>
  )
}
