'use client'

import { useEffect, useRef, type CSSProperties } from 'react'

/** Seeded (Park–Miller) so the server render and the client agree on every particle. */
let seed = 11
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const between = (a: number, b: number) => a + rand() * (b - a)

// Palette from design-reference/DESIGN.md
const tones = ['var(--color-accent)', 'var(--color-accent-hover)']
const brightTone = 'var(--color-pending)' // pale amber, accents and a few others
const EDGE = 12 // px below and above the section where particles enter and leave

/**
 * 60 points rising from below the section to above it; the first 24 show on mobile and
 * the first 40 on tablet. `rise` < 1 makes a particle fade out early, so the lower part is
 * a little denser. `offset` starts each one part-way, so the field is full at once.
 */
const particles = Array.from({ length: 60 }, (_, i) => {
  const bright = rand() < 0.09
  return {
    tier: i < 24 ? '' : i < 40 ? 'max-md:hidden' : 'max-lg:hidden',
    offset: rand(),
    speed: between(15, 30), // px/s
    rise: rand() < 0.25 ? between(0.55, 0.9) : 1,
    sway: between(8, 24), // px either side
    swayPeriod: between(7, 14), // s
    swayPhase: rand(),
    peak: bright ? between(0.8, 1) : between(0.35, 0.7),
    style: {
      '--x': `${between(5, 95).toFixed(1)}%`,
      '--size': `${(bright ? between(3.5, 4.5) : rand() < 0.75 ? between(2, 3) : between(3, 4)).toFixed(1)}px`,
      '--tone': bright || rand() < 0.12 ? brightTone : tones[i % 2],
      '--spread': bright ? '4' : '2.2', // feathered edge; a halo on the bright ones
    } as CSSProperties,
  }
})

/**
 * Amber points rising through the closing section. Web Animations of translate, transform
 * and opacity with concrete values, so the compositor runs them off the main thread at
 * sub-pixel precision. Rebuilt only when the section resizes, keeping each one's progress;
 * paused off-screen. Before hydration and with reduced motion: a still, spread-out field.
 */
export function ClosingParticles() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = ref.current
    if (!layer) return
    const elements = [...layer.children] as HTMLElement[]
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let rises: Animation[] = []
    let sways: Animation[] = []
    let travel = 0
    let onScreen = true

    const sync = () => {
      for (const a of [...rises, ...sways]) {
        if (onScreen && !document.hidden) a.play()
        else a.pause()
      }
    }

    function build() {
      const progress = rises.map((a) => {
        const duration = Number(a.effect?.getTiming().duration)
        return (Number(a.currentTime) % duration) / duration
      })
      for (const a of [...rises, ...sways]) a.cancel()
      rises = []
      sways = []
      if (reducedMotion.matches || !travel) return
      elements.forEach((el, i) => {
        const p = particles[i]
        const distance = travel * p.rise
        const duration = (distance / p.speed) * 1000
        const rise = el.animate(
          [
            { translate: '0 0', opacity: 0 },
            { opacity: p.peak, offset: 0.12 },
            { opacity: p.peak, offset: 0.85 },
            { translate: `0 ${-distance.toFixed(1)}px`, opacity: 0 },
          ],
          { duration, iterations: Infinity, easing: 'linear' },
        )
        rise.currentTime = (progress[i] ?? p.offset) * duration
        const half = (p.swayPeriod / 2) * 1000
        const sway = el.animate([{ transform: `translateX(${-p.sway.toFixed(1)}px)` }, { transform: `translateX(${p.sway.toFixed(1)}px)` }], {
          duration: half,
          iterations: Infinity,
          direction: 'alternate',
          easing: 'ease-in-out',
        })
        sway.currentTime = p.swayPhase * half * 2
        rises.push(rise)
        sways.push(sway)
      })
      sync()
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.height + EDGE * 2)
      if (next === travel) return
      travel = next
      layer.style.setProperty('--travel', String(travel))
      build()
    })
    resizeObserver.observe(layer)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting
      sync()
    })
    intersectionObserver.observe(layer)
    document.addEventListener('visibilitychange', sync)
    reducedMotion.addEventListener('change', build)

    return () => {
      for (const a of [...rises, ...sways]) a.cancel()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', sync)
      reducedMotion.removeEventListener('change', build)
    }
  }, [])

  return (
    <div ref={ref} className="closing-particles absolute inset-0">
      {particles.map(({ tier, style, offset, rise, peak }, i) => (
        <span
          key={i}
          className={`closing-particle ${tier}`}
          style={{ ...style, '--offset': offset.toFixed(3), '--rise': rise.toFixed(2), '--peak': peak.toFixed(2) } as CSSProperties}
        />
      ))}
    </div>
  )
}
