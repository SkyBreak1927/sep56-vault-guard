---
name: Aegis Vault Conformance System
colors:
  surface: '#121416'
  surface-dim: '#121416'
  surface-bright: '#37393b'
  surface-container-lowest: '#0c0e10'
  surface-container-low: '#1a1c1e'
  surface-container: '#1e2022'
  surface-container-high: '#282a2c'
  surface-container-highest: '#333537'
  on-surface: '#e2e2e5'
  on-surface-variant: '#dbc2b0'
  inverse-surface: '#e2e2e5'
  inverse-on-surface: '#2f3133'
  outline: '#a38c7c'
  outline-variant: '#554336'
  surface-tint: '#ffb77d'
  primary: '#ffb77d'
  on-primary: '#4d2600'
  primary-container: '#d97707'
  on-primary-container: '#432100'
  inverse-primary: '#904d00'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb3ad'
  on-tertiary: '#68000a'
  tertiary-container: '#ff5451'
  on-tertiary-container: '#5c0008'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdcc3'
  primary-fixed-dim: '#ffb77d'
  on-primary-fixed: '#2f1500'
  on-primary-fixed-variant: '#6e3900'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#121416'
  on-background: '#e2e2e5'
  surface-variant: '#333537'
typography:
  headline-xl:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-xl-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-md:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  label-sm:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system establishes a high-precision, institutional security posture tailored for protocol engineers, smart contract auditors, and financial risk officers interacting with Stellar/Soroban SEP-56 vault architectures. The aesthetic executes a hyper-focused developer-SaaS ethos—clean, technical, restrained, and unyielding in visual discipline.

### Personality & Tone
- **Authoritative & Rigorous:** No decorative frivolity or gratuitous illustration. Every pixel serves verification, telemetry, and audit reporting.
- **Calm & Diagnostic:** Complex cryptographic invariants and multi-step contract calls are parsed through high-contrast structural layouts, deep charcoal canvas tiers, and strict typographical hierarchies.
- **Target Audience:** Core protocol developers, security compliance auditors, and institutional liquidity managers demanding absolute clarity over smart contract states.

### Visual Strategy
The design language synthesizes modern technical minimalism with engineering-grade instrument UI. Surfaces leverage micro-contrasting dark charcoal steps, razor-thin 1px borders, and deliberate typographic scaling. Amber serves as a focused primary accent denoting verification execution and state transitions, while muted, desaturated status indicators articulate passing and failing test vectors without visual fatigue.

## Colors

The color architecture is built strictly for dark mode, relying on an obsidian-to-charcoal baseline that prevents eye strain during extended audit reviews while maximizing the legibility of telemetry data.

### Baseline Canvas & Surfaces
- **Canvas Base (`#0C0D0E`):** Root viewport background, grounding low-priority framing and sidebars.
- **Surface Level 1 (`#141618`):** Primary panel, card, and modular audit container background.
- **Surface Level 2 (`#1C1E22`):** Elevated modals, dropdown drawers, nested code execution blocks, and table row hover states.
- **Surface Interactive (`#25282E`):** Hover states for secondary actions, active segmented controls, and selected table cells.

### Accent & Semantics
- **Primary Accent (`#D97706`):** Deep amber/copper. Restricted to primary system actions (e.g., initiating audit runs, generating cryptographically signed proofs), key focal metrics, and active selection indicators.
- **Primary Accent Subtle (`rgba(217, 119, 6, 0.12)`): Amber pill backgrounds, active tab pills, and focus ring halos.
- **Conforming / Pass (`#10B981` / desaturated `#34D399` on dark canvas):** Signals passed invariant checks, verified signatures, and validated SEP-56 requirements. Paired with `rgba(16, 185, 129, 0.10)` backgrounds.
- **Non-Conforming / Fail (`#EF4444` / desaturated `#F87171` on dark canvas):** Highlights critical vulnerabilities, trace reversions, and schema mismatches. Paired with `rgba(239, 68, 68, 0.10)` backgrounds.
- **Warning / Non-Critical (`#F59E0B`):** Re-entrancy cautions, unoptimized gas overhead, or deprecated interface calls.

### Text & Border Tokens
- **Text Primary (`#F3F4F6`):** 96% contrast white for titles, numerical values, and critical diagnostic reads.
- **Text Secondary (`#9CA3AF`):** Muted neutral for supporting labels, meta descriptions, and table headers.
- **Text Tertiary (`#6B7280`):** De-emphasized timestamps, inactive states, and static structure.
- **Border Default (`rgba(255, 255, 255, 0.08)`): Ubiquitous 1px boundary separating panels, code containers, and list rows.
- **Border Highlight (`rgba(255, 255, 255, 0.16)`): Subtle interactive border emphasis on card hover or focused elements.

## Typography

Typography governs the density and scannability of audit trails. Geist provides an objective, geometric neo-grotesque foundation across all interface copy, while JetBrains Mono is strictly enforced for machine representations.

### Typographic Principles
- **Separation of Concerns:** Human prose, analytical titles, and dashboard controls remain exclusively in `Geist`. Soroban contract IDs (`C...`), cryptographic hashes, transaction sequences, raw WASM hex offsets, and terminal outputs rely exclusively on `JetBrains Mono`.
- **Vertical Rhythm & Tracking:** Headlines employ negative tracking (`-0.02em` to `-0.03em`) for a solid, high-density editorial profile. Numerical tables and audit matrices must use tabular figures (`font-variant-numeric: tabular-nums`) to prevent jitter across refreshing streaming RPC feeds.
- **Scale Restraint:** Sizes span conservatively from 11px to 32px to honor desktop density and complex split-pane inspection views.

## Layout & Spacing

The layout is anchored around a 12-column fluid grid system bounded by maximum ergonomic viewport widths, structured to host simultaneous trace logs, AST visualizers, and invariant matrices.

### Canvas Grid & Layout Strategy
- **Max Width:** Core views constrain to `1440px` centered width for analytics dashboards, with full-width fluid configurations for multi-column split IDE and diff inspectors.
- **Columns & Gutters:** 12 columns with `1.5rem` (24px) gutters on desktop (`>= 1024px`), compressing to 8 columns with `1rem` (16px) gutters on tablet (`>= 768px`), and a single 4-column flow with `0.75rem` (12px) gutters on mobile (`< 768px`).
- **Vertical Cadence:** Multiples of 4px. Structural sections use `2.5rem` (40px) vertical spacing. Related input groups and status pills use `0.5rem` (8px) gaps.
- **Breakpoint Tiers:**
  - Mobile: `< 768px` (docked navigation, stacked contract panels)
  - Tablet: `768px - 1023px` (collapsible telemetry drawer, responsive 2-column metrics)
  - Desktop: `1024px - 1439px` (standard side-navigation, master-detail audit lists)
  - Wide Display: `>= 1440px` (pinned sidebars, persistent terminal drawer, parallel test trees)

## Elevation & Depth

This system intentionally rejects heavy diffuse dropshadows and 3D skeuomorphism in favor of tonal tiering and architectural micro-borders.

### Structural Depth
- **Level 0 (Root `#0C0D0E`):** Global canvas behind workspaces and secondary toolbars.
- **Level 1 (Panels `#141618`):** Audit cards, data tables, and telemetry grids. Border: `1px solid rgba(255, 255, 255, 0.08)`.
- **Level 2 (Overlays `#1C1E22`):** Dropdowns, tooltips, popovers, and diagnostic drill-downs. Border: `1px solid rgba(255, 255, 255, 0.14)`. Shadows are strictly restricted to a crisp edge-depth ring: `box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)`.
- **Interactive State Depth:** Focused elements and active tab bars do not float; they gain surface luminosity (advancing from `#141618` to `#1C1E22`) paired with an amber indicator line or border highlight (`#D97706`).

## Shapes

A soft, controlled corner radius (`roundedness: 1` / base 4px) is utilized across the system. This preserves the precision engineering look of audit tooling, avoiding both aggressive brutalist 0px edges and overly consumer-facing circular pill geometry.

### Radius Assignments
- **Base Components (0.25rem / 4px):** Buttons, code snippets, status badges, text inputs, segmented button controls.
- **Container Elements (0.5rem / 8px):** Primary audit cards, modal dialogs, test result containers, code viewer windows.
- **Contextual Micro-Elements (0.125rem / 2px):** Table focus indicators, progress bar track thumbs, tooltips.
- **Pill Exception:** Purely round badges (`rounded-full`) are strictly forbidden except for circular system state indicators (e.g., pulsing 6px connection node dots).

## Components

### Buttons
- **Primary:** Background `#D97706`, text `#2F1500` (`on-primary-fixed`, 5.37:1, passes WCAG AA; white on this amber is only 3.19:1), 4px radius, 0 1px shadow. Hover: lightens to `#E8900C` so the dark text stays legible (6.86:1); darkening the fill instead would drop contrast. Focus: 2px offset ring with `#D97706`. Height: 36px (desktop standard).
- **Secondary / Outline:** Background `#141618`, border `1px solid rgba(255, 255, 255, 0.08)`, text `#F3F4F6`. Hover: Background `#1C1E22`, border `rgba(255, 255, 255, 0.16)`.
- **Destructive:** Background `rgba(239, 68, 68, 0.12)`, border `1px solid rgba(239, 68, 68, 0.24)`, text `#F87171`. Hover: Background `rgba(239, 68, 68, 0.20)`.

### Chips & Test Badges
- **Format:** Height 22px, font JetBrains Mono 11px, weight 500, padding 0 8px, radius 4px.
- **Pass Badge:** Background `rgba(16, 185, 129, 0.10)`, text `#34D399`, border `1px solid rgba(16, 185, 129, 0.20)`.
- **Fail Badge:** Background `rgba(239, 68, 68, 0.10)`, text `#F87171`, border `1px solid rgba(239, 68, 68, 0.20)`.
- **Pending / Invariant Check:** Background `rgba(217, 119, 6, 0.10)`, text `#FBBF24`, border `1px solid rgba(217, 119, 6, 0.20)`.

### Form Controls & Inputs
- **Text Inputs:** Height 36px, background `#0C0D0E`, border `1px solid rgba(255, 255, 255, 0.08)`, text `#F3F4F6`, radius 4px. Placeholder: `#6B7280`. Focus: Border `#D97706`, box-shadow `0 0 0 1px #D97706`.
- **Monospace Address Input:** Specialized input pairing input text styling with `JetBrains Mono` and an inline contract verification icon on the right edge.
- **Checkboxes & Radios:** 16x16px square with 2px radius (checkbox) or circular (radio). Background `#0C0D0E`, border `1px solid rgba(255, 255, 255, 0.20)`. Checked: Background `#D97706`, border `#D97706`.

### Cards & Audit Panels
- Base surface `#141618`, border `1px solid rgba(255, 255, 255, 0.08)`, radius 8px, padding `1.5rem`.
- Card Header contains title in `Geist 16px weight 600`, right-aligned test status chip, and optional action dropdown.
- Card footers are separated by a 1px border `rgba(255, 255, 255, 0.08)` and render secondary metadata in `Geist 12px #9CA3AF`.

### Data Tables & Invariant Lists
- **Structure:** Alternate row striping is omitted. Surface is `#141618`. Header row uses background `#0C0D0E`, font `Geist 11px uppercase tracking-wider weight 600 #9CA3AF`.
- **Rows:** 44px minimum height, border-bottom `1px solid rgba(255, 255, 255, 0.05)`. Hover state: `#1C1E22`.
- Cells containing Soroban addresses display copy-to-clipboard actions on row hover.

### Specialized Component: Conformance Check Tree
- Dedicated hierarchical tree view rendering SEP-56 requirements (e.g., `SEP-0056::vault_share_burn`, `SEP-0056::deposit_authorization`).
- Collapsible accordions with 1px border lines, nesting code assertion trace logs inside `#0C0D0E` nested code containers using `JetBrains Mono 12px`.