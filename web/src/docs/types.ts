/**
 * Docs content model. Each page lives in its own file under `pages/`, separate from
 * the components, so the text can change without touching the layout.
 *
 * Text fields may wrap code in backticks (`like_this`); they render as inline code.
 */

export interface DocsPage {
  slug: string
  title: string
  lead: string
  /** Small badge above the title. */
  tag?: string
  sections: DocsSection[]
}

export interface DocsSection {
  /** Anchor id (#id) and the "On this page" target; unique within the page. */
  id: string
  title: string
  intro?: string
  blocks: DocsBlock[]
}

export type DocsBlock =
  | { type: 'text'; text: string }
  /** `label` sits in the code bar (terminal, json, …); `heading` is an optional uppercase label above the block. */
  | { type: 'code'; label: string; language?: string; code: string; heading?: string }
  | { type: 'params'; label?: string; rows: DocsParam[] }
  /** One labelled statement (WHAT IT ASSERTS, PASS WHEN, …); adjacent fields render as one list. */
  | { type: 'fields'; label: string; text: string }
  | { type: 'table'; label?: string; head: string[]; rows: string[][] }
  | { type: 'list'; items: string[] }
  | { type: 'note'; text: string; kind?: 'verified' | 'unverified' }

export interface DocsParam {
  name: string
  type: string
  description: string
  optional?: boolean
}
