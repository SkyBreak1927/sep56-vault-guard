'use client'

import { useEffect, useRef } from 'react'
import { mountRiskScene, type RiskSceneController, type RiskSceneKind } from '@/artwork/riskScenes'

/**
 * Canvas illustration for one risk. Plays its story once each time `playing`
 * turns on, then idles; decorative, so hidden from assistive technology.
 */
export function RiskSceneArt({ scene, playing }: { scene: RiskSceneKind; playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controller = useRef<RiskSceneController | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const scene_ = mountRiskScene(canvas, scene, reduced)
    controller.current = scene_
    return () => {
      scene_.destroy()
      controller.current = null
    }
  }, [scene])

  useEffect(() => {
    if (playing) controller.current?.play()
    else controller.current?.stop()
  }, [playing])

  // 8:3 box; on desktop it may shrink below that when the one-screen section is short (the scene fits itself, contain).
  return (
    <div aria-hidden="true" className="artwork-fade relative aspect-[8/3] w-full [--fade-x:6%] [--fade-y:4%] lg:min-h-0">
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
    </div>
  )
}
