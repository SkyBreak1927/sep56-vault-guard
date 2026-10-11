# Aegis Vault

Landing page and live check runner for Aegis Vault, the SEP-56 vault conformance and security checker. Built with Next.js (App Router) and Tailwind CSS v4.

Visual design follows `../design-reference/DESIGN.md` (single source of truth); page copy follows `../design-reference/CORRECTED_CONTENT.md`.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
npm run lint    # oxlint
npm test        # vitest
npm run coverage
```

## Structure

- `src/app/` — root layout (Geist + JetBrains Mono via `next/font`, metadata), page, and `globals.css`, which maps every DESIGN.md token (colors, type scale, radii, spacing, breakpoints) into the Tailwind theme. Tailwind's default palette/scale is cleared so only DESIGN.md values exist.
- `src/sections/` — one folder per page section, holding the section and the parts only it uses: `header/`, `hero/`, `why-it-matters/`, `vault-checker/` (client: `RunForm` → `VerificationReport`), `integrate/`, `closing/`, `footer/`, `auth/` (`/sign-in` and `/sign-up` pages, design only)
- `src/components/` — shared building blocks (`Section`, `StatusBadge`, `Select`, `CopyButton`, `Icons`, …) and shared class lists in `styles.ts`
- `src/artwork/vaultSphere.ts` — framework-free Canvas 2D particle engine for the hero (vault, protective sphere, entrance assembly, scan wave, circuit traces), colored from DESIGN.md tokens. Pauses offscreen / in hidden tabs, adapts particle density, honours `prefers-reduced-motion`. Mounted by `VaultSphereArt`.
- `src/lib/useCheckRun.ts` — starts a run (`POST /api/check`) and polls `GET /api/check/:jobId`; all 11 checks render up front and update in place as each finishes
- `src/lib/report.ts` — JSON / Markdown report export
- `src/config/checks.ts` — the 11 check definitions and showcase vaults; `src/config/site.ts` — link destinations

## Configuration

External links default to the destinations in `src/config/site.ts` and can be overridden in `.env.local` (see `.env.example`):

- `NEXT_PUBLIC_GITHUB_URL`
- `NEXT_PUBLIC_SEP56_SPEC_URL`, `NEXT_PUBLIC_SEP41_SPEC_URL`
- `NEXT_PUBLIC_API_BASE` — check-suite backend; unset makes runs fail with a clear message
- `NEXT_PUBLIC_DEMO_VIDEO_URL`, `NEXT_PUBLIC_CHECK_VIDEO_URL` — YouTube walkthroughs for "Just exploring?" / "Already have a vault?" in the checker section; hidden until set
- optional overrides: `NEXT_PUBLIC_LINK_WHY_IT_MATTERS`, `NEXT_PUBLIC_LINK_TRY_IT`, `NEXT_PUBLIC_RUN_CHECKS_URL`

`NEXT_PUBLIC_*` values are inlined at build time, so rebuild after changing them.
