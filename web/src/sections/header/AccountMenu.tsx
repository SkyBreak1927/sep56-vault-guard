'use client'

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { SignOutIcon } from '@/components/Icons'
import { secondaryButton } from '@/components/styles'
import { getSupabase } from '@/lib/supabase'

/** Display name and avatar from the OAuth provider's profile (GitHub, Google); email users have neither. */
function profile(user: User) {
  const meta = user.user_metadata ?? {}
  const name: string | undefined = meta.full_name ?? meta.name ?? meta.user_name
  const avatar: string | undefined = meta.avatar_url ?? meta.picture
  return { name, avatar, label: name ?? user.email ?? 'Account' }
}

/** Provider photo, or the first letter of the name / email when there isn't one (or it fails to load). */
function Avatar({ user, className }: { user: User; className: string }) {
  const { avatar, label } = profile(user)
  const [broken, setBroken] = useState(false)
  const base = `${className} shrink-0 rounded-full border border-line-strong bg-interactive`
  if (avatar && !broken) {
    // Plain <img>: images are unoptimized (next.config). no-referrer keeps Google avatars from 403ing.
    return <img src={avatar} alt="" referrerPolicy="no-referrer" className={`${base} object-cover`} onError={() => setBroken(true)} />
  }
  return (
    <span aria-hidden="true" className={`${base} grid place-items-center text-label-md text-fg uppercase`}>
      {label.charAt(0)}
    </span>
  )
}

function Identity({ user }: { user: User }) {
  const { name } = profile(user)
  return (
    <div className="flex min-w-0 items-center gap-space-sm">
      <Avatar user={user} className="size-8" />
      <div className="flex min-w-0 flex-col">
        {name && <span className="truncate text-label-md text-fg">{name}</span>}
        <span className={`truncate text-body-sm ${name ? 'text-muted' : 'text-fg'}`}>{user.email}</span>
      </div>
    </div>
  )
}

const signOut = () => void getSupabase()?.auth.signOut()

/**
 * Signed-in account control. Desktop: avatar button opening a Level 2 menu
 * (identity + Sign Out). Below lg it already sits in the nav dropdown, so it
 * renders the same content inline.
 */
export function AccountMenu({ user, onAction }: { user: User; onAction: () => void }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const hovered = useRef(false)

  // Mouse hover opens the menu; a short delay lets the pointer cross the gap to it.
  // Touch and keyboard still use the button's click toggle.
  const hoverOpen = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'mouse') return
    window.clearTimeout(closeTimer.current)
    hovered.current = true
    setOpen(true)
  }
  const hoverClose = (event: ReactPointerEvent) => {
    if (event.pointerType !== 'mouse') return
    hovered.current = false
    closeTimer.current = window.setTimeout(() => setOpen(false), 150)
  }
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const { label } = profile(user)

  return (
    <>
      {/* Below lg: inline in the nav dropdown. */}
      <div className="flex flex-col gap-space-sm lg:hidden">
        <div className="px-3 py-space-xs">
          <Identity user={user} />
        </div>
        <button
          type="button"
          className={`${secondaryButton} h-11`}
          onClick={() => {
            onAction()
            signOut()
          }}
        >
          <SignOutIcon className="size-4" />
          Sign Out
        </button>
      </div>

      {/* Desktop: avatar button + menu. */}
      <div ref={rootRef} className="relative max-lg:hidden" onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
        <button
          ref={buttonRef}
          type="button"
          className="grid size-11 cursor-pointer place-items-center rounded-full transition-colors duration-150 ease-out can-hover:bg-raised"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          // A mouse hovering here already opened it, so its click shouldn't close it again.
          onClick={() => setOpen((v) => hovered.current || !v)}
        >
          <Avatar user={user} className="size-8" />
          <span className="sr-only">Account menu for {label}</span>
        </button>

        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className={`absolute top-[calc(100%+0.5rem)] right-0 w-64 rounded-lg border border-line-overlay bg-raised p-space-xs shadow-overlay ${open ? '' : 'hidden'}`}
        >
          <div className="px-3 py-space-sm">
            <Identity user={user} />
          </div>
          <div className="my-space-xs h-px bg-line" aria-hidden="true" />
          <button
            type="button"
            role="menuitem"
            className="flex h-9 w-full cursor-pointer items-center gap-space-sm rounded px-3 text-label-md text-muted transition-colors duration-150 ease-out can-hover:bg-interactive can-hover:text-fg"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            <SignOutIcon className="size-4" />
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
