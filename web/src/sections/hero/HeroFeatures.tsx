import { CHECK_DEFS } from '@/config/checks'
import { CheckCounter } from './CheckCounter'
import { TestnetNetwork } from './TestnetNetwork'

const conformance = CHECK_DEFS.filter((c) => c.group === 'conformance').length
const security = CHECK_DEFS.filter((c) => c.group === 'security').length

/** Hero proof points as a small bento: the check count with its split, and the network status. */
export function HeroFeatures() {
  return (
    <ul aria-label="Highlights" className="mt-space-xl grid max-w-[34rem] grid-cols-1 gap-space-sm md:grid-cols-[minmax(0,1fr)_auto]">
      <li className="flex flex-col justify-between gap-space-sm rounded-lg border border-line bg-surface/80 p-space-md backdrop-blur-sm">
        <CheckCounter />

        <p className="flex flex-wrap gap-x-space-md gap-y-space-xs text-body-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-subtle" aria-hidden="true" />
            <span className="text-fg tabular-nums">{conformance}</span> conformance
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-accent" aria-hidden="true" />
            <span className="text-fg tabular-nums">{security}</span> security
          </span>
        </p>
      </li>

      <li className="flex flex-col justify-between gap-space-sm rounded-lg border border-line bg-surface/80 p-space-md backdrop-blur-sm">
        <TestnetNetwork className="h-10 w-full" />
        <span className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-2 text-label-md font-semibold whitespace-nowrap text-pass">
            <LiveDot />
            Live on Soroban Testnet
          </span>
          <span className="text-body-sm text-muted">Stellar Testnet</span>
        </span>
      </li>
    </ul>
  )
}

/** Status dot: blinks on a steady beat. */
function LiveDot() {
  return <span className="live-blink size-1.5 flex-none rounded-full bg-pass" aria-hidden="true" />
}
