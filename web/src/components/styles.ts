/** Shared class lists for DESIGN.md components (see design-reference/DESIGN.md › Components). */

const control = [
  'inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded px-4 text-label-md whitespace-nowrap no-underline',
  'transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50',
].join(' ')

/** Amber fill with dark text (5.37:1); hover lightens so the text stays legible. */
export const primaryButton = `${control} bg-accent font-semibold text-on-accent shadow-[0_1px_0_rgb(0_0_0/0.4)] can-hover:bg-accent-hover`

export const secondaryButton = `${control} border border-line bg-surface text-fg can-hover:border-line-strong can-hover:bg-raised`

/** Secondary button with an amber outline, for a section's main action (e.g. Export report). */
export const accentOutlineButton = `${control} border border-accent bg-surface text-fg can-hover:border-accent-hover can-hover:bg-raised`

/** Level 1 panel: audit cards, data tables, telemetry grids. */
export const panel = 'rounded-lg border border-line bg-surface'

/** Uppercase field / column label. */
export const fieldLabel = 'text-label-sm tracking-wider text-muted uppercase'

const fieldBase = [
  'h-9 w-full rounded border px-3 text-body-md text-fg placeholder:text-muted',
  'transition-[border-color,background-color,box-shadow] duration-150 ease-out',
  'focus-visible:border-accent focus-visible:shadow-[0_0_0_1px_var(--color-accent)] focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ')

/** Text input / select. */
export const field = `${fieldBase} border-line bg-canvas`

/**
 * Text input inside a surface panel (auth card): a raised fill instead of the canvas
 * well, so the field reads as a control rather than a hole in the card.
 */
export const raisedField = `${fieldBase} border-line-strong bg-raised focus-visible:bg-surface`

/** Nested code container for machine output (check details, trace logs). */
export const codeBlock = 'rounded border border-line bg-canvas px-3 py-2 font-mono text-code-trace break-words'
