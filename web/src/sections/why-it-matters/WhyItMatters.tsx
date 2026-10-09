'use client'

import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type KeyboardEvent, type SVGProps } from 'react'
import { STORY_SPEED, type RiskSceneKind } from '@/artwork/riskScenes'
import { CHECK_DEFS } from '@/config/checks'
import { AlertIcon, LockIcon, ShieldCheckIcon, SwapIcon, TrendUpIcon } from '@/components/Icons'
import { SELECT_RISK_EVENT } from '@/sections/vault-checker/VerificationReport'
import { RiskSceneArt } from './RiskSceneArt'
import { SectionAmbience } from '@/components/Ambience'
import { SectionEyebrow, SectionHeadline } from '@/components/Section'
import { fieldLabel, panel } from '@/components/styles'

interface Risk {
  key: string
  /** Picker title. */
  name: string
  /** Short line under the picker title. */
  summary: string
  /** Picker icon. */
  Icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Detail illustration (canvas scene). */
  scene: RiskSceneKind
  /** Captions under the illustration, left to right. */
  captions: [string, string, string]
  /** When each caption's step starts in the illustration's story (scene seconds). */
  beats: [number, number, number]
  whyItMatters: string
  checkId: string
}

// Technical copy is drawn from the original risk cards and CHECK_DEFS
// (design-reference/CORRECTED_CONTENT.md); nothing here claims more than the
// check descriptions say.
const risks: Risk[] = [
  {
    key: 'donation',
    name: 'Donation attacks',
    summary: 'Catch share-price manipulation risks.',
    Icon: TrendUpIcon,
    scene: 'donation',
    captions: ['Attacker donates directly', 'Share price jumps', 'Next deposit mints ~0 shares'],
    beats: [0, 1.4, 3.0],
    whyItMatters:
      "An attacker donates assets directly to an empty vault to inflate the share price, so the next real depositor's shares round down toward zero and their deposit is absorbed.",
    checkId: 'donation_attack',
  },
  {
    key: 'rounding',
    name: 'Rounding errors',
    summary: 'Check that vault math behaves as expected.',
    Icon: SwapIcon,
    scene: 'rounding',
    captions: ['Expected value', 'Rounded value drifts', 'The gap is the loss'],
    beats: [0, 1.2, 2.6],
    whyItMatters:
      "Share math must round in the vault's favor on every operation. If it ever rounds toward the user instead, that's a slow, repeatable drain — not a one-time bug.",
    checkId: 'rounding_direction',
  },
  {
    key: 'overflow',
    name: 'Overflow risks',
    summary: 'Test how the vault handles extreme values.',
    Icon: AlertIcon,
    scene: 'overflow',
    captions: ['Extreme input', 'Approaches the integer limit', 'Stopped before it wraps'],
    beats: [0, 1.2, 2.6],
    whyItMatters:
      'Extreme inputs should fail cleanly. A vault that panics into a corrupted state, or silently wraps a huge number, can leave funds unrecoverable or wrongly accounted for.',
    checkId: 'overflow_protection',
  },
  {
    key: 'access',
    name: 'Access control',
    summary: 'Probe sensitive actions for improper access.',
    Icon: LockIcon,
    scene: 'access',
    captions: ['Unauthorized caller', 'Authorization check', 'Vault stays closed'],
    beats: [0, 1.2, 2.4],
    whyItMatters:
      "Soroban requires explicit authorization checks. A vault that lets an unapproved operator move someone else's shares has no access control, no matter what the interface promises.",
    checkId: 'access_control_probing',
  },
]

const tabId = (key: string) => `risk-tab-${key}`
const panelId = (key: string) => `risk-panel-${key}`

export function WhyItMatters() {
  const [active, setActive] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const detailRef = useRef<HTMLDivElement>(null)
  // Illustrations hold on their first frame until the detail is on screen.
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = detailRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setInView(true)
        observer.disconnect()
      },
      { threshold: 0.35 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Mobile: keep the selected option in view inside the swipe row. Scrolls the
  // row only — never the page — and is a no-op on desktop where nothing overflows.
  useEffect(() => {
    const scroller = scrollerRef.current
    const tab = tabRefs.current[active]
    if (!scroller || !tab || scroller.scrollWidth <= scroller.clientWidth) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollTo({ left: tab.offsetLeft - scroller.offsetLeft, behavior: reduce ? 'auto' : 'smooth' })
  }, [active])

  // "Explore this risk" in a report picks the matching risk before the page scrolls here.
  useEffect(() => {
    const onSelect = (e: Event) => {
      const i = risks.findIndex((r) => r.checkId === (e as CustomEvent<string>).detail)
      if (i >= 0) setActive(i)
    }
    window.addEventListener(SELECT_RISK_EVENT, onSelect)
    return () => window.removeEventListener(SELECT_RISK_EVENT, onSelect)
  }, [])

  const select = (i: number, focus = false) => {
    const next = Math.max(0, Math.min(risks.length - 1, i))
    setActive(next)
    if (focus) tabRefs.current[next]?.focus()
  }

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowRight: active + 1,
      ArrowUp: active - 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: risks.length - 1,
    }
    if (!(e.key in moves)) return
    e.preventDefault()
    select(moves[e.key], true)
  }

  return (
    // Desktop: exactly one screen tall (header excluded), the illustration absorbs the slack;
    // never shorter than 45rem so the four risk cards always fit.
    <section id="why-it-matters" aria-labelledby="why-it-matters-title" className="relative flex min-h-[calc(100svh-4rem)] flex-col lg:h-[max(calc(100svh-4rem),45rem)]">
      <SectionAmbience glow="why-glow" />
      <div className="shell flex min-h-0 flex-1 flex-col">
        {/* Desktop: header and detail stack on the left; the picker spans both rows from the top,
            so the risk cards start level with the section title. */}
        <div className="section-gap grid min-h-0 flex-1 grid-cols-1 gap-space-lg pb-space-xl lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-x-space-xl lg:gap-y-space-xl">
          <header className="scroll-reveal flex max-w-3xl flex-col gap-space-sm max-lg:mb-space-md lg:col-start-1 lg:row-start-1">
            <SectionEyebrow>Why Aegis Vault</SectionEyebrow>
            <SectionHeadline id="why-it-matters-title">
              Vaults are simple.
              <br />
              Until one thing goes wrong.
            </SectionHeadline>
            <p className="text-body-md text-pretty text-muted">
              Small mistakes in vault logic can become expensive problems. We help catch issues in core vault behavior and
              common security risks before they reach users.
            </p>
          </header>

            {/* Picker — before the detail in the DOM so it sits above it on mobile. On desktop it
                spans the full height: first card level with the title, last card level with the boxes' bottom. */}
            <div className="scroll-reveal flex min-w-0 flex-col gap-space-md lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-line lg:pl-space-lg">
              <div
                ref={scrollerRef}
                role="tablist"
                aria-label="Vault risks"
                className="relative -mx-margin-mobile flex snap-x snap-mandatory scroll-px-margin-mobile gap-space-sm overflow-x-auto px-margin-mobile py-1 [scrollbar-width:none] md:-mx-margin md:scroll-px-margin md:px-margin lg:mx-0 lg:grid lg:flex-1 lg:auto-rows-fr lg:snap-none lg:py-0 lg:gap-space-md lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
              >
                {risks.map((risk, i) => {
                  const selected = i === active
                  const { Icon } = risk
                  return (
                    <button
                      key={risk.key}
                      ref={(el) => {
                        tabRefs.current[i] = el
                      }}
                      type="button"
                      role="tab"
                      id={tabId(risk.key)}
                      aria-selected={selected}
                      aria-controls={panelId(risk.key)}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => select(i)}
                      onKeyDown={onTabKeyDown}
                      className={`group relative flex w-[60%] flex-none cursor-pointer snap-start items-start gap-space-sm overflow-hidden rounded-lg border px-space-md py-space-sm text-left lg:flex-col lg:px-space-lg lg:py-space-md transition-[border-color,background-color] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none md:w-[48%] lg:w-full ${
                        selected
                          ? // Amber tint layered over the surface so the selected card stays on the same level as the rest.
                            'border-accent/60 bg-surface bg-linear-to-r from-accent/[0.05] to-accent/[0.05]'
                          : 'border-line bg-surface can-hover:border-line-strong'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 w-[3px] bg-accent transition-opacity duration-200 motion-reduce:transition-none ${selected ? 'opacity-100' : 'opacity-0'}`}
                      />
                      {/* Mobile/tablet: compact swipe card, icon beside the title. Desktop: icon above. */}
                      <span className="flex flex-none">
                        <span
                          className="grid size-7 place-items-center rounded-md border border-accent/40 bg-accent/10 text-accent lg:size-8"
                        >
                          <Icon className="size-4" />
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-body-md font-semibold text-fg lg:text-headline-md">{risk.name}</span>
                        <span className="text-body-sm text-pretty text-muted lg:text-body-md">{risk.summary}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Detail — every panel shares one grid cell, so the area is as tall as
                the tallest risk and switching crossfades without moving the page. */}
            <div ref={detailRef} data-paused={inView ? undefined : ''} className="grid min-w-0 lg:col-start-1 lg:row-start-2 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)]">
              {risks.map((risk, i) => (
                <RiskDetail key={risk.key} risk={risk} active={i === active} playing={i === active && inView} />
              ))}
            </div>
        </div>
      </div>
    </section>
  )
}

function RiskDetail({ risk, active, playing }: { risk: Risk; active: boolean; playing: boolean }) {
  const check = CHECK_DEFS.find((c) => c.id === risk.checkId)
  return (
    <div
      id={panelId(risk.key)}
      role="tabpanel"
      aria-labelledby={tabId(risk.key)}
      inert={!active}
      // The active panel plays its story; switching risks restarts it.
      data-play={active ? '' : undefined}
      className={`col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col gap-space-lg transition-[opacity,translate,visibility] duration-[250ms] ease-out motion-reduce:transition-none ${
        active ? 'visible translate-y-0 opacity-100' : 'invisible translate-y-2 opacity-0'
      }`}
    >

      <figure className="flex min-h-0 flex-1 flex-col justify-center gap-space-sm">
        <RiskSceneArt scene={risk.scene} playing={playing} />
        <figcaption>
          <ul className="grid grid-cols-3 divide-x divide-line-strong">
            {risk.captions.map((caption, i) => (
              <li
                key={caption}
                className="risk-caption px-space-sm text-center text-body-sm text-pretty text-muted md:text-body-md"
                style={{ '--d': `${(risk.beats[i] / STORY_SPEED).toFixed(2)}s`, '--t': '0.6s' } as CSSProperties}
              >
                {caption}
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>

      <div className="mt-auto">
        {/* Two labeled panels (the report's evidence / outcome pattern), each read top-down:
            label (icon tints the meaning) → the main point in white → supporting detail muted. */}
        <div className="grid grid-cols-1 gap-space-md md:grid-cols-2">
          <section className={`${panel} flex flex-col overflow-hidden`} aria-labelledby={`${panelId(risk.key)}-why`}>
            <h3
              id={`${panelId(risk.key)}-why`}
              className={`${fieldLabel} flex items-center gap-space-sm border-b border-line px-space-md py-2.5`}
            >
              <AlertIcon className="size-3.5 flex-none text-fail" />
              Why it matters
            </h3>
            <p className="px-space-md py-space-md text-body-sm text-pretty text-fg md:text-body-md">{risk.whyItMatters}</p>
          </section>
          {check && (
            <section className={`${panel} flex flex-col overflow-hidden`} aria-labelledby={`${panelId(risk.key)}-check`}>
              <h3
                id={`${panelId(risk.key)}-check`}
                className={`${fieldLabel} flex items-center gap-space-sm border-b border-line px-space-md py-2.5`}
              >
                <ShieldCheckIcon className="size-3.5 flex-none text-accent" />
                What Aegis checks
              </h3>
              <div className="flex flex-col gap-space-sm px-space-md py-space-md">
                <p className="text-body-sm font-semibold text-fg md:text-body-md">{check.name}</p>
                {/* Check id as a Pending / invariant chip (DESIGN.md › Chips). */}
                <code className="inline-flex h-[22px] w-fit items-center rounded border border-accent/20 bg-accent/10 px-2 font-mono text-code-sm font-medium text-pending">
                  {check.id}
                </code>
                <p className="text-body-sm text-pretty text-muted md:text-body-md">{check.description}</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
