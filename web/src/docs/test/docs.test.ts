import { describe, expect, it } from 'vitest'
import { matchParts } from '@/sections/docs/DocsSearch'
import { allDocsPages, docsNav, docsSearchIndex, getDocsPage, orderedSlugs } from '../index'
import type { DocsBlock, DocsPage } from '../types'

function blockText(block: DocsBlock): string[] {
  switch (block.type) {
    case 'text':
    case 'note':
      return [block.text]
    case 'code':
      return [block.label, block.code, block.heading ?? '']
    case 'params':
      return [block.label ?? '', ...block.rows.flatMap((row) => [row.name, row.type, row.description])]
    case 'fields':
      return [block.label, block.text]
    case 'table':
      return [block.label ?? '', ...block.head, ...block.rows.flat()]
    case 'list':
      return block.items
  }
}

/** Every piece of text a page renders. */
function pageText(page: DocsPage): string[] {
  return [
    page.title,
    page.lead,
    page.tag ?? '',
    ...page.sections.flatMap((section) => [section.title, section.intro ?? '', ...section.blocks.flatMap(blockText)]),
  ]
}

// Claims the project does not make (English and Indonesian).
const FORBIDDEN = [
  /\baudit/i,
  /certif/i,
  /guarantee/i,
  /full conformance/i,
  /100% secure/i,
  /sertifikasi/i,
  /menjamin/i,
  /kesesuaian penuh/i,
  /100% aman/i,
]

describe('docs content', () => {
  it('has a page for every slug in the navigation', () => {
    for (const slug of orderedSlugs()) expect(getDocsPage(slug), slug).toBeDefined()
  })

  it('lists every page in the navigation exactly once', () => {
    const slugs = orderedSlugs()
    expect(new Set(slugs).size).toBe(slugs.length)
    expect([...slugs].sort()).toEqual(allDocsPages().map((page) => page.slug).sort())
  })

  it('links the playground to the checker on the home page', () => {
    const playground = docsNav.at(-1)!
    expect(playground.items).toEqual([{ title: 'Vault Checker', href: '/#try-it' }])
  })

  it('uses unique, anchor-safe section ids within each page', () => {
    for (const page of allDocsPages()) {
      const ids = page.sections.map((section) => section.id)
      expect(new Set(ids).size, page.slug).toBe(ids.length)
      for (const id of ids) expect(id, `${page.slug}#${id}`).toMatch(/^[a-z0-9][a-z0-9_-]*$/)
    }
  })

  it('does not use forbidden claims', () => {
    for (const page of allDocsPages()) {
      for (const line of pageText(page)) {
        for (const pattern of FORBIDDEN) expect(line, `${page.slug}: ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('leaves no unbalanced inline code marks', () => {
    for (const page of allDocsPages()) {
      const blocks = page.sections.flatMap((section) => section.blocks).filter((block) => block.type !== 'code')
      const prose = [page.lead, ...blocks.flatMap(blockText)]
      for (const line of prose) expect((line.match(/`/g) ?? []).length % 2, `${page.slug}: ${line}`).toBe(0)
    }
  })
})

describe('docs search index', () => {
  it('indexes every page title and section heading for search', () => {
    const index = docsSearchIndex()
    const sections = allDocsPages().reduce((n, page) => n + page.sections.length, 0)
    expect(index).toHaveLength(allDocsPages().length + sections)
    expect(index).toContainEqual({ title: 'Exit codes', page: 'Output and exit codes', href: '/docs/output#exit-codes' })
  })
})

describe('docs search highlighting', () => {
  it('marks every query word, case-insensitively', () => {
    expect(matchParts('Output and exit codes', 'EXIT code')).toEqual([
      { text: 'Output and ', match: false },
      { text: 'exit', match: true },
      { text: ' ', match: false },
      { text: 'code', match: true },
      { text: 's', match: false },
    ])
  })

  it('treats regex characters in the query literally', () => {
    expect(matchParts('POST /api/check', '/api/(')).toEqual([{ text: 'POST /api/check', match: false }])
    expect(matchParts('checks[].id', '[].')).toEqual([
      { text: 'checks', match: false },
      { text: '[].', match: true },
      { text: 'id', match: false },
    ])
  })
})
