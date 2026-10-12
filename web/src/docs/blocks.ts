import type { DocsBlock, DocsParam } from './types'

/** Short constructors for the page files, so each page reads close to the content brief. */

export const text = (value: string): DocsBlock => ({ type: 'text', text: value })

export const list = (...items: string[]): DocsBlock => ({ type: 'list', items })

export const code = (language: string, label: string, value: string, heading?: string): DocsBlock => ({
  type: 'code',
  language,
  label,
  code: value,
  ...(heading ? { heading } : {}),
})

export const verified = (value: string): DocsBlock => ({ type: 'note', kind: 'verified', text: value })

export const unverified = (value: string): DocsBlock => ({ type: 'note', kind: 'unverified', text: value })

export const field = (label: string, value: string): DocsBlock => ({ type: 'fields', label, text: value })

export const table = (head: string[], rows: string[][], label?: string): DocsBlock => ({
  type: 'table',
  head,
  rows,
  ...(label ? { label } : {}),
})

export const params = (rows: DocsParam[], label?: string): DocsBlock => ({
  type: 'params',
  rows,
  ...(label ? { label } : {}),
})

/** A required parameter / field row. */
export const param = (name: string, type: string, description: string): DocsParam => ({ name, type, description })

/** An optional parameter / field row. */
export const optional = (name: string, type: string, description: string): DocsParam => ({
  name,
  type,
  description,
  optional: true,
})
