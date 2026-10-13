import { Fragment } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { TerminalIcon } from '@/components/Icons'
import { StatusBadge } from '@/components/StatusBadge'
import { fieldLabel } from '@/components/styles'
import type { DocsBlock, DocsParam } from '@/docs'
import { highlight, type TokenKind } from './highlight'
import { InlineText } from './InlineText'

const TOKEN_TONE: Record<TokenKind, string | undefined> = {
  plain: undefined,
  command: 'font-semibold text-fg',
  keyword: 'text-accent-hover',
  flag: 'text-muted',
  variable: 'text-pending',
  placeholder: 'rounded-sm bg-accent/10 text-accent-hover',
  string: 'text-pass',
  key: 'text-pending',
  number: 'text-accent-hover',
  comment: 'text-muted italic',
}

const SHELLS = new Set(['bash', 'powershell', 'bat'])

const prose = 'text-body-md text-pretty text-muted'

/**
 * Wrapping for a table cell. A single short identifier stays on one line; a long one
 * (a contract address) stays on one line on mobile, where the table scrolls, and wraps
 * from md up. Prose cells keep a minimum width on mobile so rows don't grow tall.
 */
function cellWrap(cell: string) {
  if (!/^`[^`]+`$/.test(cell)) return 'max-md:min-w-48'
  return cell.length > 34 ? 'max-md:whitespace-nowrap max-md:[&_code]:wrap-normal' : 'whitespace-nowrap [&_code]:wrap-normal'
}

function BlockHeading({ children }: { children: string }) {
  return <p className={`${fieldLabel} mb-space-sm`}>{children}</p>
}

/** Code card: label and copy action in the top bar, coloured code in a darker well below. */
function CodeBlock({ block }: { block: Extract<DocsBlock, { type: 'code' }> }) {
  const shell = SHELLS.has(block.language ?? '')
  return (
    <div>
      {block.heading && <BlockHeading>{block.heading}</BlockHeading>}
      <figure className="overflow-hidden rounded-lg border border-line bg-canvas">
        <figcaption className="flex h-9 items-center justify-between gap-space-md border-b border-line bg-surface pr-space-sm pl-space-md">
          <span className="flex min-w-0 items-center gap-space-sm font-mono text-code-sm text-muted">
            {shell && <TerminalIcon className="size-3.5 flex-none" />}
            <span className="truncate">{block.label}</span>
          </span>
          <CopyButton value={block.code} label="copy" copiedLabel="copied" showLabel />
        </figcaption>
        {/* Focusable so a keyboard can scroll long lines. Prompts are display only: not selectable, not copied. */}
        <pre tabIndex={0} className="overflow-x-auto px-space-md py-space-md font-mono text-code-md leading-6 text-fg">
          <code>
            {highlight(block.code, block.language).map((line, i) => (
              <Fragment key={i}>
                {i > 0 && '\n'}
                {line.prompt && (
                  <span aria-hidden="true" className="text-subtle select-none">
                    {line.prompt}{' '}
                  </span>
                )}
                {line.tokens.map((token, j) => (
                  <span key={j} className={TOKEN_TONE[token.kind]}>
                    {token.text}
                  </span>
                ))}
              </Fragment>
            ))}
          </code>
        </pre>
      </figure>
    </div>
  )
}

function ParamsBlock({ label, rows }: { label?: string; rows: DocsParam[] }) {
  return (
    <div>
      {label && <BlockHeading>{label}</BlockHeading>}
      <dl className="divide-y divide-line-row rounded-lg border border-line bg-surface">
        {rows.map((row) => (
          <div key={row.name} className="flex flex-col gap-space-xs px-space-md py-space-sm">
            <dt className="flex flex-wrap items-baseline gap-x-space-sm gap-y-space-xs">
              <code className="font-mono text-code-md font-medium text-fg">{row.name}</code>
              <span className="font-mono text-code-sm text-accent-hover">{row.type}</span>
              {row.optional && <span className="text-label-sm text-muted">optional</span>}
            </dt>
            <dd className={prose}>
              <InlineText text={row.description} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Adjacent labelled statements (WHAT IT ASSERTS, MUTATES TARGET VAULT, …) as one list. */
function FieldsBlock({ fields }: { fields: Extract<DocsBlock, { type: 'fields' }>[] }) {
  return (
    <dl className="divide-y divide-line-row rounded-lg border border-line bg-surface">
      {fields.map((f) => (
        <div key={f.label} className="flex flex-col gap-space-xs px-space-md py-space-sm md:flex-row md:gap-space-md">
          <dt className={`${fieldLabel} md:w-44 md:flex-none md:pt-0.5`}>{f.label}</dt>
          <dd className="text-body-md text-pretty text-fg">
            <InlineText text={f.text} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function TableBlock({ block }: { block: Extract<DocsBlock, { type: 'table' }> }) {
  return (
    <div>
      {block.label && <BlockHeading>{block.label}</BlockHeading>}
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full min-w-xl border-collapse text-left text-body-md">
          <thead className="bg-raised">
            <tr>
              {block.head.map((cell) => (
                <th key={cell} scope="col" className={`${fieldLabel} px-space-md py-space-sm font-semibold`}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className="border-t border-line-row">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`px-space-md py-space-sm align-top text-pretty ${c === 0 ? 'text-fg' : 'text-muted'} ${cellWrap(cell)}`}
                  >
                    <InlineText text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NoteBlock({ block }: { block: Extract<DocsBlock, { type: 'note' }> }) {
  return (
    <div className="flex flex-col items-start gap-space-sm rounded-lg border border-line bg-surface p-space-md md:flex-row md:gap-space-md">
      {block.kind === 'verified' && <StatusBadge status="pass">Verified</StatusBadge>}
      {block.kind === 'unverified' && <StatusBadge status="warn">Not verified yet</StatusBadge>}
      <p className={`${prose} md:pt-px`}>
        <InlineText text={block.text} />
      </p>
    </div>
  )
}

type Group = { kind: 'fields'; fields: Extract<DocsBlock, { type: 'fields' }>[] } | { kind: 'block'; block: DocsBlock }

/** Joins runs of `fields` blocks so they render as a single list. */
function group(blocks: DocsBlock[]): Group[] {
  const out: Group[] = []
  for (const block of blocks) {
    const prev = out.at(-1)
    if (block.type === 'fields') {
      if (prev?.kind === 'fields') prev.fields.push(block)
      else out.push({ kind: 'fields', fields: [block] })
    } else out.push({ kind: 'block', block })
  }
  return out
}

function Block({ block }: { block: DocsBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <p className={prose}>
          <InlineText text={block.text} />
        </p>
      )
    case 'list':
      return (
        <ul className={`${prose} flex list-disc flex-col gap-space-xs pl-space-lg marker:text-subtle`}>
          {block.items.map((item) => (
            <li key={item}>
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      )
    case 'code':
      return <CodeBlock block={block} />
    case 'params':
      return <ParamsBlock label={block.label} rows={block.rows} />
    case 'table':
      return <TableBlock block={block} />
    case 'note':
      return <NoteBlock block={block} />
    case 'fields':
      return <FieldsBlock fields={[block]} />
  }
}

export function DocsBlocks({ blocks }: { blocks: DocsBlock[] }) {
  return group(blocks).map((g, i) => (
    <Fragment key={i}>{g.kind === 'fields' ? <FieldsBlock fields={g.fields} /> : <Block block={g.block} />}</Fragment>
  ))
}
