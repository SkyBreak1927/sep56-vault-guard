import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import logo from '@/assets/logo-dark.svg'
import { PauseIcon, PlayIcon } from '@/components/Icons'

/** The centre button fades out after this long without pointer or keyboard activity while playing. */
const IDLE_MS = 2500
const SEEK_STEP = 5
/** A click on the footage waits this long for a second click (fullscreen) before toggling play. */
const DOUBLE_CLICK_MS = 200

/** Seconds → m:ss, for the slider's spoken value. */
function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const s = Math.floor(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Promo walkthrough with deliberately minimal controls: a centred play/pause
 * button and a thin progress slider along the bottom edge. A branded poster
 * covers the frame until the viewer presses play, and the file only starts
 * downloading then.
 */
export function WalkthroughPlayer({ src }: { src: string }) {
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const idleTimer = useRef<number | undefined>(undefined)
  const clickTimer = useRef<number | undefined>(undefined)
  /** Page scroll when fullscreen was entered; restored on exit, which otherwise lands elsewhere. */
  const scrollBeforeFullscreen = useRef<number | null>(null)

  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [idle, setIdle] = useState(false)
  const [failed, setFailed] = useState(false)

  const wake = useCallback(() => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS)
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(idleTimer.current)
      window.clearTimeout(clickTimer.current)
    },
    [],
  )

  const togglePlay = () => {
    const el = video.current
    if (!el) return
    if (el.paused || el.ended) {
      setStarted(true)
      el.play().catch(() => setPlaying(false))
    } else {
      el.pause()
    }
  }

  useEffect(() => {
    const restore = () => {
      const y = scrollBeforeFullscreen.current
      if (document.fullscreenElement || y === null) return
      scrollBeforeFullscreen.current = null
      // After the exit's relayout settles; instant, so the page's smooth scrolling doesn't animate it.
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' })))
    }
    document.addEventListener('fullscreenchange', restore)
    return () => document.removeEventListener('fullscreenchange', restore)
  }, [])

  // The whole player goes fullscreen so the centre button and slider come along.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else if (root.current?.requestFullscreen) {
      scrollBeforeFullscreen.current = window.scrollY
      root.current.requestFullscreen().catch(() => {
        scrollBeforeFullscreen.current = null
      })
    } else {
      // iOS Safari only lets the <video> itself go fullscreen.
      const el = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
      el?.webkitEnterFullscreen?.()
    }
  }

  // Single click plays/pauses, double click toggles fullscreen without also toggling play twice.
  const onSurfaceClick = () => {
    window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(togglePlay, DOUBLE_CLICK_MS)
  }

  const onSurfaceDoubleClick = () => {
    window.clearTimeout(clickTimer.current)
    toggleFullscreen()
  }

  const seek = (time: number) => {
    const el = video.current
    if (!el || !duration) return
    el.currentTime = Math.min(duration, Math.max(0, time))
    setCurrent(el.currentTime)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    // The slider handles its own arrow keys.
    if (target.tagName === 'INPUT') return
    const onButton = target.tagName === 'BUTTON'
    const actions: Record<string, () => void> = {
      k: togglePlay,
      ArrowLeft: () => seek(current - SEEK_STEP),
      ArrowRight: () => seek(current + SEEK_STEP),
      ...(onButton ? {} : { ' ': togglePlay }),
    }
    const action = actions[event.key]
    if (action) {
      event.preventDefault()
      wake()
      action()
    }
  }

  const controlsHidden = playing && idle
  const progress = duration ? (current / duration) * 100 : 0

  return (
    <div
      ref={root}
      role="region"
      aria-label="Walkthrough video"
      tabIndex={0}
      className={`relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-canvas [&:fullscreen]:rounded-none [&:fullscreen]:border-0 ${controlsHidden ? 'cursor-none' : ''}`}
      onPointerMove={wake}
      onPointerLeave={() => playing && setIdle(true)}
      onFocus={wake}
      onKeyDown={onKeyDown}
    >
      <video
        ref={video}
        src={src}
        preload="none"
        playsInline
        // Clicks go to the layer above, which handles double-click fullscreen itself
        // (the browser's own would fullscreen the bare <video>, without these controls).
        className="pointer-events-none absolute inset-0 size-full bg-canvas object-contain"
        onPlay={() => {
          setPlaying(true)
          wake()
        }}
        onPause={() => {
          setPlaying(false)
          setIdle(false)
        }}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration)
          setFailed(false)
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />

      {!started || failed ? (
        <button
          type="button"
          className="walkthrough-poster group absolute inset-0 grid cursor-pointer place-items-center bg-canvas disabled:cursor-default"
          aria-label={failed ? 'Video unavailable' : 'Play walkthrough'}
          disabled={failed}
          onClick={togglePlay}
        >
          {/* The play disc sits dead centre (on the rings, where the playing-state button
              appears); the lockup stacks above it, its bottom edge one disc-height above centre. */}
          <span
            className={`absolute inset-x-0 flex flex-col items-center gap-space-sm md:gap-space-md ${failed ? 'top-1/2 -translate-y-1/2' : 'bottom-1/2 mb-14 md:mb-16'}`}
          >
            {/* Plain <img>: the static import already carries the basePath. */}
            <img src={logo.src} width={logo.width} height={logo.height} alt="" className="block h-7 w-auto md:h-10" />
            <span className="text-body-md tracking-[0.4em] text-muted md:text-body-lg">
              {failed ? 'video unavailable' : 'walkthrough'}
            </span>
          </span>
          {!failed && (
            <span
              className={`${playButton} absolute top-1/2 left-1/2 size-14 -translate-1/2 md:size-16 can-hover:group-hover:scale-105 can-hover:group-hover:border-accent can-hover:group-hover:text-accent`}
            >
              <PlayIcon className="size-5 fill-current" />
            </span>
          )}
        </button>
      ) : (
        <>
          {/* Click the footage to play/pause, double-click for fullscreen; the centre button is the labelled control. */}
          <div
            className="absolute inset-0"
            aria-hidden="true"
            onClick={onSurfaceClick}
            onDoubleClick={onSurfaceDoubleClick}
          />
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            className={[
              playButton,
              'absolute top-1/2 left-1/2 size-14 -translate-1/2 cursor-pointer md:size-16',
              'can-hover:scale-105 can-hover:border-accent can-hover:text-accent',
              controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100',
            ].join(' ')}
            onClick={togglePlay}
          >
            {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5 fill-current" />}
          </button>

          <input
            type="range"
            aria-label="Seek"
            aria-valuetext={`${clock(current)} of ${clock(duration)}`}
            min={0}
            max={duration || 0}
            step="any"
            value={current}
            disabled={!duration}
            className="video-scrubber inset-x-0"
            style={{ '--progress': `${progress}%` } as CSSProperties}
            onChange={(e) => seek(Number(e.target.value))}
          />
        </>
      )}
    </div>
  )
}

/**
 * Quiet glass disc over the footage: translucent canvas, hairline border and a
 * light icon, warming to amber on hover. Sized per use (48–64px, all above the
 * 44px touch target). PlayIcon's triangle already sits right of the viewBox
 * centre, which is the optical centre, so it needs no extra nudge.
 */
const playButton = [
  'grid place-items-center rounded-full border border-line-strong bg-canvas/55 text-fg backdrop-blur-md',
  'transition-[opacity,scale,border-color,color] duration-150 ease-out',
].join(' ')
