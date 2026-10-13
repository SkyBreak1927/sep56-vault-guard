/** Inline code in docs prose and tables. */
export const inlineCode = 'rounded-sm border border-line bg-raised px-1 font-mono text-code-md text-fg wrap-anywhere'

/** Renders docs text, turning `backtick` spans into inline code. */
export function InlineText({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
      <code key={i} className={inlineCode}>
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  )
}
