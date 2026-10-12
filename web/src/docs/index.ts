import { api } from './pages/api'
import { cli } from './pages/cli'
import { conformance } from './pages/conformance'
import { customToken } from './pages/custom-token'
import { gettingStarted } from './pages/getting-started'
import { limitations } from './pages/limitations'
import { limits } from './pages/limits'
import { output } from './pages/output'
import { preflight } from './pages/preflight'
import { security } from './pages/security'
import { sep56 } from './pages/sep-56'
import { testVaults } from './pages/test-vaults'
import { resultTypes } from './pages/types'
import type { DocsPage } from './types'

export type { DocsBlock, DocsPage, DocsParam, DocsSection } from './types'

/** Sidebar entry: a docs page by slug, or a link elsewhere on the site. */
export type DocsNavItem = { title: string; slug: string } | { title: string; href: string }

export interface DocsNavGroup {
  title: string
  items: DocsNavItem[]
}

const pages: DocsPage[] = [
  gettingStarted,
  customToken,
  cli,
  output,
  preflight,
  conformance,
  security,
  api,
  limits,
  sep56,
  resultTypes,
  testVaults,
  limitations,
]

const bySlug = new Map(pages.map((page) => [page.slug, page]))

const item = (page: DocsPage): DocsNavItem => ({ title: page.title, slug: page.slug })

/** Sidebar order; also the search order. */
export const docsNav: DocsNavGroup[] = [
  { title: 'Overview', items: [item(gettingStarted), item(customToken)] },
  { title: 'CLI', items: [item(cli), item(output), item(preflight)] },
  { title: 'Checks', items: [item(conformance), item(security)] },
  { title: 'Backend API', items: [item(api), item(limits)] },
  { title: 'SEP-56', items: [item(sep56)] },
  { title: 'Reference', items: [item(resultTypes), item(testVaults), item(limitations)] },
  // Not a docs page: the Vault Checker section on the home page.
  { title: 'Playground', items: [{ title: 'Vault Checker', href: '/#try-it' }] },
]

export const DEFAULT_DOCS_SLUG = gettingStarted.slug

export const docsHref = (slug: string) => `/docs/${slug}`

export const getDocsPage = (slug: string) => bySlug.get(slug)

export const allDocsPages = (): readonly DocsPage[] => pages

/** Docs pages in sidebar order. */
export const orderedSlugs = (): string[] =>
  docsNav.flatMap((group) => group.items.flatMap((entry) => ('slug' in entry ? [entry.slug] : [])))

export interface DocsSearchEntry {
  /** Page title, or the section heading for a section entry. */
  title: string
  /** Page title the entry belongs to (equal to `title` for the page itself). */
  page: string
  href: string
}

/** Static search index: every page title and every H2. */
export function docsSearchIndex(): DocsSearchEntry[] {
  return orderedSlugs().flatMap((slug) => {
    const page = getDocsPage(slug)!
    const href = docsHref(slug)
    return [
      { title: page.title, page: page.title, href },
      ...page.sections.map((section) => ({ title: section.title, page: page.title, href: `${href}#${section.id}` })),
    ]
  })
}
