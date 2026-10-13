import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PlayIcon } from '@/components/Icons'
import { CHECK_DEFS } from '@/config/checks'
import { StatusIcon } from './VerificationReport'

/**
 * The poster is laid out on a fixed canvas and scaled to the player, so the wheel and its labels
 * keep their proportions at every width. Players narrower than 32rem (phones) use a smaller canvas
 * with larger type and no outer labels.
 */
const WIDE = { width: 800, height: 450 }
const NARROW = { width: 360, height: 203 }

/** Wheel geometry, in the SVG's 300 × 300 viewBox. */
const C = 150
const TRACK = 110
const NODE = 14
const DISC = 62
const RING = 146

/** Demo Vault's recorded result: 10 PASS, 1 FAIL (`donation_attack`); see VAULT_CHECKS.md. */
const FAILED_ID = 'donation_attack'
const FAILED = CHECK_DEFS.filter((def) => def.id === FAILED_ID).length

const NODES = CHECK_DEFS.map((_, i) => {
  // Evenly spaced, the first at twelve o'clock.
  const angle = (i / CHECK_DEFS.length) * 2 * Math.PI - Math.PI / 2
  return { x: C + TRACK * Math.cos(angle), y: C + TRACK * Math.sin(angle) }
})

type Side = 'top' | 'right' | 'bottom' | 'left'

/** Short labels for the wheel as a whole; fixed in place, not tied to a node. */
const LABELS: { text: string; side: Side }[] = [
  { text: 'Overflow protection', side: 'top' },
  { text: 'Access control', side: 'right' },
  { text: 'Deposit conformance', side: 'bottom' },
  { text: 'Rounding safety', side: 'left' },
]

const LABEL_POSITION: Record<Side, string> = {
  top: 'bottom-full left-1/2 mb-space-xs -translate-x-1/2 text-center whitespace-nowrap',
  bottom: 'top-full left-1/2 mt-space-xs -translate-x-1/2 text-center whitespace-nowrap',
  left: 'right-full top-1/2 mr-space-xs w-16 -translate-y-1/2 text-right',
  right: 'left-full top-1/2 ml-space-xs w-16 -translate-y-1/2 text-left',
}

/** Unit direction of each label from the centre. */
const DIRECTION: Record<Side, [number, number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }

/** Wheel of the Demo Vault's recorded result: 11 check nodes (donation_attack failing) around a summary disc. */
function Wheel({ compact = false }: { compact?: boolean }) {
  return (
    <span className="relative block size-full">
      <svg viewBox="0 0 300 300" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        <g>
          <circle cx={C} cy={C} r={RING} fill="none" stroke="var(--color-line)" strokeWidth={1} />
          <circle cx={C} cy={C} r={TRACK} fill="none" stroke="var(--color-line-strong)" strokeWidth={1.5} />
          {!compact &&
            LABELS.map(({ side }) => {
              const [dx, dy] = DIRECTION[side]
              const from = TRACK + NODE + 8
              return (
                <g key={side}>
                  <line
                    x1={C + dx * from}
                    y1={C + dy * from}
                    x2={C + dx * RING}
                    y2={C + dy * RING}
                    stroke="var(--color-pass-base)"
                    strokeOpacity={0.6}
                    strokeWidth={1.5}
                  />
                  <circle cx={C + dx * RING} cy={C + dy * RING} r={3} fill="var(--color-pass)" />
                </g>
              )
            })}
          <circle cx={C} cy={C} r={DISC} fill="var(--color-surface)" stroke="var(--color-line-strong)" strokeWidth={1.5} />
        </g>
        {NODES.map((node, i) => {
          const failed = CHECK_DEFS[i].id === FAILED_ID
          return (
            <g key={i} transform={`translate(${node.x} ${node.y})`}>
              <circle r={NODE + 6} fill={failed ? 'var(--color-fail-base)' : 'var(--color-pass-base)'} fillOpacity={0.12} />
              <circle r={NODE} fill={failed ? 'var(--color-fail)' : 'var(--color-pass)'} />
              <path
                d={failed ? 'M0 -6.5v7M0 6.5v.01' : 'm-5.5 0.5 3.5 3.5 7-7.5'}
                fill="none"
                stroke="var(--color-canvas)"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )
        })}
      </svg>

      <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <StatusIcon status="pass" className={compact ? 'size-5' : 'size-8'} />
        <span className={`text-fg tabular-nums ${compact ? 'mt-space-xs text-label-sm' : 'mt-space-sm text-label-md'}`}>
          {CHECK_DEFS.length - FAILED} PASS · {FAILED} FAIL
        </span>
        <span className={`text-muted ${compact ? 'text-label-sm' : 'text-body-sm'}`}>Demo vault</span>
      </span>

      {!compact &&
        LABELS.map((label) => (
          <span key={label.side} className={`absolute text-label-md text-fg ${LABEL_POSITION[label.side]}`}>
            {label.text}
          </span>
        ))}
    </span>
  )
}

/** Outlined amber play disc beside its label; fills amber with the poster's hover or focus. */
function PlayCue({ length, compact = false }: { length?: string; compact?: boolean }) {
  return (
    <span className="flex items-center gap-space-md">
      <span
        className={`grid flex-none place-items-center rounded-full border-2 border-accent text-accent transition-[background-color,color] duration-150 ease-out group-hover:bg-accent group-hover:text-on-accent group-focus-visible:bg-accent group-focus-visible:text-on-accent ${compact ? 'size-11' : 'size-14'}`}
      >
        <PlayIcon className={`fill-current ${compact ? 'size-4' : 'size-5'}`} />
      </span>
      <span className="flex flex-col text-left">
        <span className={`text-fg ${compact ? 'text-label-md' : 'text-headline-md'}`}>Watch walkthrough</span>
        {length && <span className="font-mono text-code-sm text-muted tabular-nums">{length}</span>}
      </span>
    </span>
  )
}

const TITLE = 'See Aegis checks in action.'

/** Keeps a fixed-width canvas scaled to its frame's width. */
function useCanvasScale(width: number) {
  const frame = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const update = () => setScale(el.clientWidth / width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [width])
  return { frame, scale }
}

/** Fixed canvas, scaled to its frame; hidden until measured so it never flashes at the wrong size. */
function Canvas({ size, scale, children }: { size: { width: number; height: number }; scale: number; children: ReactNode }) {
  return (
    <span
      className="absolute top-0 left-0 origin-top-left"
      style={{ width: size.width, height: size.height, transform: `scale(${scale})`, visibility: scale ? 'visible' : 'hidden' }}
    >
      {children}
    </span>
  )
}

/**
 * Walkthrough poster: the title and play cue on the left, an all-pass verification wheel on the
 * right. Illustrative only; real results come from running a check.
 */
export function WalkthroughPoster({ length }: { length?: string }) {
  const { frame: wideFrame, scale: wideScale } = useCanvasScale(WIDE.width)
  const { frame: narrowFrame, scale: narrowScale } = useCanvasScale(NARROW.width)

  return (
    <span className="@container absolute inset-0 block text-left">
      <span ref={wideFrame} className="absolute inset-0 hidden @lg:block">
        <Canvas size={WIDE} scale={wideScale}>
          <span className="wheel-glow absolute top-0 left-87.5 size-105" aria-hidden="true" />
          <span className="absolute top-18.75 left-102.5 size-75">
            <Wheel />
          </span>
          <span className="absolute inset-y-0 left-10 flex w-72 flex-col justify-center gap-space-md">
            <span className="text-headline-xl text-balance text-fg">{TITLE}</span>
            <span className="text-body-lg text-pretty text-muted">
              Run all {CHECK_DEFS.length} checks and understand the results.
            </span>
            <span className="pt-space-sm">
              <PlayCue length={length} />
            </span>
          </span>
        </Canvas>
      </span>

      <span ref={narrowFrame} className="absolute inset-0 block @lg:hidden">
        <Canvas size={NARROW} scale={narrowScale}>
          <span className="wheel-glow absolute -top-2.5 left-39.5 size-55" aria-hidden="true" />
          <span className="absolute top-5.25 left-47 size-40">
            <Wheel compact />
          </span>
          <span className="absolute inset-y-0 left-4 flex w-40 flex-col justify-center gap-space-md">
            <span className="text-headline-lg-mobile text-balance text-fg">{TITLE}</span>
            <PlayCue length={length} compact />
          </span>
        </Canvas>
      </span>
    </span>
  )
}
