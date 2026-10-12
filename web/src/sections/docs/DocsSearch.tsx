'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { SearchIcon } from '@/components/Icons'
import { field } from '@/components/styles'
import type { DocsSearchEntry } from '@/docs'

const MAX_RESULTS = 12

const noSubscribe = () => () => {}
/** Apple keyboards show ⌘ K; the server render assumes Ctrl K. */
const useIsMac = () =>
  useSyncExternalStore(noSubscribe, () => /Mac|iPhone|iPad/.test(navigator.platform), () => false)

/** Entries whose title or page contain every word of the query; page titles first. */
export function searchDocs(index: DocsSearchEntry[], query: string): DocsSearchEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return index.filter((entry) => entry.title === entry.page).slice(0, MAX_RESULTS)
  const hits = index.filter((entry) => {
    const haystack = `${entry.title} ${entry.page}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
  const titleHit = (entry: DocsSearchEntry) => words.every((word) => entry.title.toLowerCase().includes(word))
  return [...hits.filter(titleHit), ...hits.filter((entry) => !titleHit(entry))].slice(0, MAX_RESULTS)
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Splits `text` into plain and matched parts for every query word (case-insensitive). */
export function matchParts(text: string, query: string): { text: string; match: boolean }[] {
  const words = query.split(/\s+/).filter(Boolean).map(escapeRegExp)
  if (!words.length) return [{ text, match: false }]
  // Longest word first, so a shorter word can't cut a longer match short.
  const pattern = new RegExp(`(${words.sort((a, b) => b.length - a.length).join('|')})`, 'i')
  // With one capture group, split() puts the matches at the odd indexes.
  return text
    .split(pattern)
    .map((part, i) => ({ text: part, match: i % 2 === 1 }))
    .filter((part) => part.text)
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return matchParts(text, query).map((part, i) =>
    part.match ? (
      <mark key={i} className="rounded-sm bg-accent/20 text-accent-hover">
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  )
}

/** "Search docs…" trigger and its Ctrl/⌘ K dialog over a static title + H2 index. */
export function DocsSearch({ index }: { index: DocsSearchEntry[] }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const mac = useIsMac()
  const results = useMemo(() => searchDocs(index, query), [index, query])

  const open = () => {
    setQuery('')
    setActive(0)
    dialogRef.current?.showModal()
    inputRef.current?.focus()
  }
  const close = () => dialogRef.current?.close()
  const go = (entry: DocsSearchEntry | undefined) => {
    if (!entry) return
    close()
    router.push(entry.href)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (dialogRef.current?.open) close()
        else open()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const optionId = (i: number) => `${listId}-${i}`

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="flex h-9 w-full cursor-pointer items-center gap-space-sm rounded border border-line bg-surface px-3 text-body-md text-muted transition-colors duration-150 ease-out can-hover:border-line-strong can-hover:text-fg max-md:size-11 max-md:justify-center max-md:border-transparent max-md:bg-transparent max-md:px-0"
      >
        <SearchIcon className="size-4 flex-none" />
        <span className="flex-1 text-left max-md:sr-only">Search docs...</span>
        <kbd className="font-mono text-code-sm text-muted max-md:hidden">{mac ? '⌘ K' : 'Ctrl K'}</kbd>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Search docs"
        onClick={(event) => event.target === dialogRef.current && close()}
        className="m-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-lg border border-line-overlay bg-raised p-0 text-fg shadow-overlay backdrop:bg-canvas/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col">
          <div className="relative border-b border-line p-space-sm">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results.length ? optionId(active) : undefined}
              aria-autocomplete="list"
              placeholder="Search docs..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setActive(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActive((i) => Math.min(i + 1, results.length - 1))
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActive((i) => Math.max(i - 1, 0))
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  go(results[active])
                }
              }}
              className={`${field} pl-9`}
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Results" className="max-h-[60vh] overflow-y-auto p-space-sm">
            {results.map((entry, i) => (
              <li
                key={entry.href}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onClick={() => go(entry)}
                onMouseMove={() => setActive(i)}
                className={`flex cursor-pointer flex-col rounded px-space-sm py-space-sm ${i === active ? 'bg-interactive' : ''}`}
              >
                <span className="text-body-md text-fg">
                  <Highlighted text={entry.title} query={query} />
                </span>
                {entry.title !== entry.page && (
                  <span className="text-body-sm text-muted">
                    <Highlighted text={entry.page} query={query} />
                  </span>
                )}
              </li>
            ))}
            {!results.length && <li className="px-space-sm py-space-md text-body-md text-muted">No results.</li>}
          </ul>
        </div>
      </dialog>
    </>
  )
}
