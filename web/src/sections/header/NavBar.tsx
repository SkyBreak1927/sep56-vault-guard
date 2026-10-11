'use client'

import Link from 'next/link'
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { primaryNav } from '@/config/site'
import { BrandLogo } from '@/components/BrandLogo'
import { CloseIcon, MenuIcon, UserIcon } from '@/components/Icons'
import { SmartLink } from '@/components/SmartLink'
import { secondaryButton } from '@/components/styles'
import { useAuth } from '@/lib/useAuth'
import { AccountMenu } from './AccountMenu'

const HEADER_HEIGHT = 64

/** Id of the in-page section a nav href points at, if any. */
const sectionId = (href: string | undefined) => (href?.startsWith('#') ? href.slice(1) : undefined)

/**
 * Scroll spy: the nav item whose section sits under the header's lower edge.
 */
function useScrollSpy() {
  const [current, setCurrent] = useState<string | undefined>()

  useEffect(() => {
    const ids = primaryNav.map((item) => sectionId(item.href)).filter((id): id is string => !!id)
    let frame = 0
    const measure = () => {
      frame = 0
      // A section counts as current once its top crosses a line a third of the way down the viewport.
      const line = HEADER_HEIGHT + window.innerHeight / 3
      let next: string | undefined
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) next = id
      }
      // At the very bottom the last section may never reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) next = ids.at(-1)
      setCurrent(next)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return current
}

interface IndicatorBox {
  left: number
  width: number
  visible: boolean
  /** False until first placed, so the bar appears in place instead of sliding in from the left edge. */
  animate: boolean
}

/**
 * Desktop section indicator: one amber bar that slides between nav items.
 * Measures the item marked aria-current inside `list`; keeps its last spot while hidden
 * so it grows back from where it was.
 */
function useIndicator(list: RefObject<HTMLUListElement | null>, current: string | undefined) {
  const [box, setBox] = useState<IndicatorBox>({ left: 0, width: 0, visible: false, animate: false })

  useLayoutEffect(() => {
    const place = () => {
      const target = list.current?.querySelector<HTMLElement>('[aria-current]')
      setBox((prev) => {
        if (!target) return { ...prev, visible: false }
        return { left: target.offsetLeft, width: target.offsetWidth, visible: true, animate: prev.width > 0 }
      })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [list, current])

  return box
}

export function NavBar() {
  const [open, setOpen] = useState(false)
  const current = useScrollSpy()
  const menuId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const indicator = useIndicator(listRef, current)
  const { user, loading } = useAuth()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onBreakpoint = () => desktop.matches && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    desktop.addEventListener('change', onBreakpoint)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [open])

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-20 border-b border-line bg-transparent backdrop-blur-md"
    >
      {/* Desktop: logo | centered section links | account actions. */}
      <div className="shell flex h-16 items-center justify-between gap-space-lg lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <BrandLogo />

        {/* Section links + account actions. Desktop: grid cells of the row; below lg: a Level 2 dropdown under the header. */}
        <div
          id={menuId}
          className={[
            'lg:contents',
            'max-lg:absolute max-lg:inset-x-margin-mobile max-lg:top-[calc(100%+0.5rem)] max-lg:flex max-lg:flex-col',
            'max-lg:rounded-lg max-lg:border max-lg:border-line-overlay max-lg:bg-raised max-lg:p-space-sm max-lg:shadow-overlay',
            open ? '' : 'max-lg:hidden',
          ].join(' ')}
        >
          <nav aria-label="Primary" className="lg:justify-self-center">
            <ul ref={listRef} className="flex items-center gap-space-xs max-lg:flex-col max-lg:items-stretch max-lg:gap-0 lg:relative">
              {primaryNav.map((item) => {
                const active = !!current && sectionId(item.href) === current
                return (
                  <li key={item.label}>
                    <SmartLink
                      aria-current={active ? 'location' : undefined}
                      className={[
                        'relative flex items-center rounded text-label-md no-underline transition-colors duration-150 ease-out',
                        'lg:h-16 lg:px-3',
                        active ? 'text-fg' : 'text-muted can-hover:text-fg',
                        'max-lg:min-h-11 max-lg:px-3 max-lg:can-hover:bg-interactive',
                        active ? 'max-lg:bg-interactive max-lg:shadow-[inset_2px_0_0_var(--color-accent)]' : '',
                      ].join(' ')}
                      href={item.href}
                      missingHint={`${item.label} link not configured`}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </SmartLink>
                  </li>
                )
              })}
              {/* Amber line on the header's bottom edge, sliding to the current section. */}
              <li
                aria-hidden="true"
                className={[
                  'pointer-events-none absolute -bottom-px left-0 h-0.5 rounded-full bg-accent max-lg:hidden',
                  'origin-center motion-reduce:transition-none',
                  indicator.animate
                    ? 'transition-[translate,width,scale,opacity] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]'
                    : 'transition-[scale,opacity] duration-300 ease-out',
                  indicator.visible ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0',
                ].join(' ')}
                style={{ translate: `${indicator.left + 12}px 0`, width: Math.max(0, indicator.width - 24) }}
              />
            </ul>
          </nav>

          <div className="flex items-center gap-space-sm max-lg:mt-space-sm max-lg:flex-col max-lg:items-stretch max-lg:border-t max-lg:border-line max-lg:pt-space-sm lg:justify-self-end">
            {user ? (
              <AccountMenu user={user} onAction={() => setOpen(false)} />
            ) : (
              // Hidden (but holding its space) until the stored session has been read.
              <Link href="/sign-in" className={`${secondaryButton} max-lg:h-11 ${loading ? 'invisible' : ''}`}>
                <UserIcon className="size-4" />
                Sign In
              </Link>
            )}
          </div>
        </div>

        <button
          ref={toggleRef}
          type="button"
          className="-mr-2.5 inline-grid size-11 cursor-pointer place-items-center rounded text-fg hover:bg-raised lg:hidden [&_svg]:size-5"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>
    </header>
  )
}
