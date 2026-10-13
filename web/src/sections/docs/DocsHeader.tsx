'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { BrandLogo } from '@/components/BrandLogo'
import { CloseIcon, MenuIcon, PlayIcon } from '@/components/Icons'
import { primaryButton } from '@/components/styles'
import type { DocsNavGroup, DocsSearchEntry } from '@/docs'
import { DocsNav, TestnetOnly } from './DocsNav'
import { DocsSearch } from './DocsSearch'

/** Docs header: logo + DOCS badge, search, "Run a check"; below lg also the sidebar drawer. */
export function DocsHeader({ nav, search }: { nav: DocsNavGroup[]; search: DocsSearchEntry[] }) {
  const [open, setOpen] = useState(false)
  const drawerId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  // Close the drawer after navigating (also via search).
  const [shownPath, setShownPath] = useState(pathname)
  if (pathname !== shownPath) {
    setShownPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onBreakpoint = () => desktop.matches && setOpen(false)
    document.addEventListener('keydown', onKey)
    desktop.addEventListener('change', onBreakpoint)
    return () => {
      document.removeEventListener('keydown', onKey)
      desktop.removeEventListener('change', onBreakpoint)
    }
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="shell flex h-16 items-center gap-space-md md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[1fr_minmax(0,24rem)_1fr]">
          <div className="flex min-w-0 flex-1 items-center gap-space-sm">
            <button
              ref={toggleRef}
              type="button"
              className="-ml-2.5 inline-grid size-11 flex-none cursor-pointer place-items-center rounded text-fg hover:bg-raised lg:hidden [&_svg]:size-5"
              aria-expanded={open}
              aria-controls={drawerId}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <CloseIcon /> : <MenuIcon />}
              <span className="sr-only">{open ? 'Close docs menu' : 'Open docs menu'}</span>
            </button>
            <BrandLogo href="/" />
            <Link
              href="/docs"
              className="inline-flex h-5 items-center rounded-sm bg-fg px-1.5 font-mono text-code-sm font-semibold tracking-wider text-canvas no-underline"
            >
              DOCS
            </Link>
          </div>

          <div className="flex-none md:w-full md:max-w-sm md:justify-self-center lg:max-w-none">
            <DocsSearch index={search} />
          </div>

          <div className="flex justify-end max-md:hidden">
            <Link href="/#try-it" className={primaryButton}>
              <PlayIcon className="size-4" />
              Run a check
            </Link>
          </div>
        </div>
      </header>

      {/* Below lg: the sidebar as a drawer under the header. Outside <header>: its backdrop blur would trap a fixed child. */}
      <div
        id={drawerId}
        className={`fixed inset-x-0 top-16 bottom-0 z-20 flex-col gap-space-xl overflow-y-auto border-t border-line bg-canvas px-margin-mobile py-space-lg md:px-margin lg:hidden ${open ? 'flex' : 'hidden'}`}
      >
        <DocsNav nav={nav} onNavigate={() => setOpen(false)} />
        <Link href="/#try-it" className={`${primaryButton} h-11 md:hidden`}>
          <PlayIcon className="size-4" />
          Run a check
        </Link>
        <TestnetOnly />
      </div>
    </>
  )
}
