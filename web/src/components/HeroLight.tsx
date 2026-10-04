import type React from 'react'
import { ClosingParticles } from '@/sections/closing/ClosingParticles'

/**
 * Hero atmosphere: a warm bloom with the closing section's rising particles and grain.
 * Contrast falls at the section edges. Decorative, with no pointer or accessibility targets.
 */
export function HeroLight({ center }: { center?: { x: string; y: string } }) {
  // Pages without the vault artwork (auth) pin the light behind their own focal point.
  const style = center ? ({ '--light-x': center.x, '--light-y': center.y } as React.CSSProperties) : undefined
  return (
    <div className="hero-light hero-fade pointer-events-none absolute inset-0 overflow-hidden" style={style} aria-hidden="true">
      <div className="hero-bloom absolute inset-0" />
      <div className="hero-ground-light" />
      <div className="hero-grain absolute inset-0" />
      <div className="hero-vignette absolute inset-0" />
      <ClosingParticles />
    </div>
  )
}
