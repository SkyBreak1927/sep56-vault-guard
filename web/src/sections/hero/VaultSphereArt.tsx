'use client'

import { useEffect, useRef } from 'react'
import { mountVaultSphere } from '@/artwork/vaultSphere'

/** Decorative particle illustration. Hidden from assistive technology. */
export function VaultSphereArt() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return mountVaultSphere(canvas)
  }, [])

  return (
    <div
      aria-hidden="true"
      className={[
        'pointer-events-none relative',
        // mobile: full-bleed so the sphere stays large
        '-mx-margin-mobile aspect-[1/1.05] max-h-[80vh] [--fade-x:6%] [--fade-y:9%]',
        // tablet: centred, capped width
        'md:max-lg:mx-auto md:max-lg:aspect-[1.15/1] md:max-lg:w-[min(100%,680px)] md:max-lg:[--fade-x:12%]',
        // desktop: bleed to the viewport edge on the right and a little into the gutter on the
        // left; square and capped to the viewport so the sphere uses the full-height hero
        'lg:mr-[calc(-1*var(--spacing-margin))] lg:-ml-[12%] lg:aspect-square lg:max-h-[calc(100svh-8rem-1px)] lg:[--fade-x:8%] lg:[--fade-y:6%]',
      ].join(' ')}
    >
      <canvas ref={canvasRef} className="artwork-fade absolute inset-0 block size-full" />
    </div>
  )
}

