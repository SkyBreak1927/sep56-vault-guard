'use client'

import { useEffect, useState } from 'react'
import { CHECK_DEFS } from '@/config/checks'

const TOTAL = CHECK_DEFS.length
const START_DELAY = 400 // ms after mount
// Per-step delay eases out: quick at first, settling into the last few checks.
const stepDelay = (i: number) => 50 + 110 * (i / TOTAL) ** 2

/**
 * Check count that ticks up from 0 to 11 on load, lighting one bar cell per check
 * (conformance neutral, security amber). Server render and reduced motion show the final state.
 */
export function CheckCounter() {
  const [count, setCount] = useState(TOTAL)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let timer: ReturnType<typeof setTimeout>
    // Step 0 resets right away; each later step lights one more check.
    const tick = (i: number) => {
      timer = setTimeout(
        () => {
          setCount(i)
          if (i < TOTAL) tick(i + 1)
        },
        i === 0 ? 0 : i === 1 ? START_DELAY : stepDelay(i),
      )
    }
    tick(0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <>
      <div className="flex items-center gap-space-sm">
        {/* Fixed width so the label beside it doesn't shift as digits change. */}
        <span className="min-w-[2ch] text-headline-xl leading-none font-bold text-fg tabular-nums">
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">{TOTAL}</span>
        </span>
        <span className="flex flex-col">
          <span className="text-label-md font-semibold text-fg">Automated checks</span>
          <span className="text-body-sm text-muted">Deterministic verification</span>
        </span>
      </div>

      <div className="flex gap-1" aria-hidden="true">
        {CHECK_DEFS.map((check, i) => (
          <span
            key={check.id}
            className={`h-1 flex-1 rounded-sm transition-colors duration-200 ease-out motion-reduce:transition-none ${
              i >= count ? 'bg-line' : check.group === 'security' ? 'bg-accent' : 'bg-subtle'
            }`}
          />
        ))}
      </div>
    </>
  )
}
