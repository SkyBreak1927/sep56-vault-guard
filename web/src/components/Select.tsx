import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CheckIcon, ChevronDownIcon } from './Icons'
import { field } from './styles'

export interface SelectOption {
  value: string
  label: string
  /** Shown but not selectable; `hint` explains why (e.g. "Soon"). */
  disabled?: boolean
  hint?: string
}

interface SelectProps {
  id: string
  /** Id of the visible label; combined with the trigger's own text for its accessible name. */
  labelId: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  /** Extra classes for the trigger (e.g. a taller `h-11`). */
  className?: string
}

/**
 * Listbox styled per DESIGN.md (input trigger, Level 2 overlay) in place of a
 * native <select>. Follows the WAI-ARIA select-only combobox keyboard model.
 */
export function Select({ id, labelId, value, options, onChange, disabled, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const listId = `${id}-listbox`
  const optionId = (i: number) => `${id}-option-${i}`
  const selected = options.find((o) => o.value === value)
  const enabled = options.flatMap((o, i) => (o.disabled ? [] : [i]))

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  const choose = (i: number) => {
    const option = options[i]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
    trigger.current?.focus()
  }

  // Moves to the next/previous selectable option, skipping disabled ones.
  const step = (dir: 1 | -1) => {
    const pos = enabled.indexOf(active)
    const next = enabled[Math.min(enabled.length - 1, Math.max(0, (pos === -1 ? 0 : pos) + dir))]
    if (next !== undefined) setActive(next)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        show()
      }
      return
    }
    const actions: Record<string, () => void> = {
      ArrowDown: () => step(1),
      ArrowUp: () => step(-1),
      Home: () => setActive(enabled[0] ?? 0),
      End: () => setActive(enabled[enabled.length - 1] ?? 0),
      Enter: () => choose(active),
      ' ': () => choose(active),
      Escape: () => setOpen(false),
    }
    if (event.key === 'Tab') return setOpen(false)
    const action = actions[event.key]
    if (action) {
      event.preventDefault()
      action()
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelId} ${id}`}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        className={`${field} flex cursor-pointer items-center justify-between gap-space-sm text-left aria-expanded:border-accent ${className}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDownIcon
          className={`size-4 flex-none text-muted transition-transform duration-150 ease-out ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute top-full right-0 left-0 z-20 mt-1 min-w-max rounded-lg border border-line-overlay bg-raised p-1 shadow-[0_4px_20px_-2px_rgb(0_0_0/0.65),0_0_0_1px_rgb(255_255_255/0.08)]"
        >
          {options.map((option, i) => {
            const isSelected = option.value === value
            return (
              <li
                key={option.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                className={[
                  'flex h-8 items-center gap-space-sm rounded px-2 text-body-md',
                  option.disabled ? 'cursor-not-allowed text-subtle' : 'cursor-pointer text-fg',
                  i === active && !option.disabled ? 'bg-interactive' : '',
                ].join(' ')}
                onPointerEnter={() => !option.disabled && setActive(i)}
                onClick={() => choose(i)}
              >
                <CheckIcon className={`size-3.5 flex-none text-accent ${isSelected ? '' : 'invisible'}`} />
                <span className="flex-1">{option.label}</span>
                {option.hint && (
                  <span className="rounded border border-line px-1.5 font-mono text-code-sm text-muted uppercase">
                    {option.hint}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
