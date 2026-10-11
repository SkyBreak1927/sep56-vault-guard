'use client'

import { useState } from 'react'
import { CheckIcon, CopyIcon } from './Icons'

interface CopyButtonProps {
  value: string
  /** Accessible name; also the visible text when `showLabel` is set. */
  label: string
  showLabel?: boolean
  className?: string
}

/** Copy-to-clipboard action for Soroban addresses and raw output. */
export function CopyButton({ value, label, showLabel = false, className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  // The 24px button gets a 44px hit area from ::before, which needs a positioned box.
  const positioned = /\b(absolute|fixed|relative|sticky)\b/.test(className) ? '' : 'relative'

  return (
    <button
      type="button"
      className={`inline-flex h-6 flex-none cursor-pointer items-center justify-center gap-1.5 rounded text-muted before:absolute before:-inset-2.5 before:content-[''] ${positioned} ${showLabel ? 'px-2 text-label-md' : 'w-6'} transition-colors duration-150 ease-out hover:bg-interactive hover:text-fg ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // clipboard unavailable (insecure context / denied) — nothing to do
        }
      }}
    >
      {copied ? <CheckIcon className="size-3.5 text-pass" /> : <CopyIcon className="size-3.5" />}
      <span className={showLabel ? undefined : 'sr-only'}>{copied ? 'Copied' : label}</span>
    </button>
  )
}
