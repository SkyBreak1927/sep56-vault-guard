/**
 * Page ambience (utilities in globals.css). Decorative, static, behind all
 * content: hidden from assistive tech and never takes pointer events.
 */

/** Shared backdrop for the whole page: tonal variation and fine grain. Place in a `relative isolate` wrapper. */
export function PageAmbience() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-20" aria-hidden="true">
      <div className="ambient-page absolute inset-0" />
      <div className="ambient-grain absolute inset-0" />
    </div>
  )
}

/**
 * One section's backdrop: an amber glow that bleeds into the neighbouring
 * sections, and an optional blueprint grid kept inside the section and revealed only
 * through its mask. The section must be `relative` and not its own stacking
 * context, so the layer sits behind every section's content.
 */
export function SectionAmbience({ glow, grid }: { glow: string; grid?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
      <div className={`ambient-bleed ${glow}`} />
      {grid && <div className={`ambient-grid absolute inset-0 ${grid}`} />}
    </div>
  )
}
