'use client'

import { useEffect, useRef, useState } from 'react'
import { mountNetworkChains } from '@/artwork/heroNetwork'

/** Packets hop across the mesh and leave a short-lived chain of blocks behind them. */
export function HeroNetworkChains() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [reducedMotion, setReducedMotion] = useState(true)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || reducedMotion) return
    return mountNetworkChains(canvas)
  }, [reducedMotion])

  if (reducedMotion) return null
  return <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
}
