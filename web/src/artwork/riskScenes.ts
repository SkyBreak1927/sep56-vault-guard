/**
 * Canvas scenes for the Why It Matters risk explorer, in the hero's visual
 * language: batched particle dots, packets with fading tails, threat strikes
 * that flash and throw sparks, block chains that ring as they land. Each
 * scene has its own centrepiece (a vault panel of live numbers with receipts,
 * a particle padlock) so none repeats the hero's vault.
 *
 * Each scene plays its three-step story once (`play()`), then settles into an
 * idle on its final state: the centrepiece floats and dust drifts. The two attack
 * scenes keep their pressure on — overflow inputs keep pouring in and the
 * unauthorised caller keeps striking the shield, at their opening rate. Scenes are
 * laid out in a 640 × 240 design space, fitted (contain) to the canvas.
 * Colours are read from the theme tokens on :root.
 */

export type RiskSceneKind = 'donation' | 'rounding' | 'overflow' | 'access'

type RGB = readonly [number, number, number]
type Vec2 = [number, number]

const TAU = Math.PI * 2
const DESIGN_W = 640
const DESIGN_H = 240

/** Scene clock speed relative to real time; captions scale their beats by it. */
export const STORY_SPEED = 0.75

/** Story length per scene (scene seconds); after this the scene idles on its final state. */
export const STORY_END: Record<RiskSceneKind, number> = {
  donation: 6.4,
  rounding: 4,
  overflow: 4.2,
  access: 3.6,
}

/* ---------------------------------------------------------------- utils */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3
const easeIn = (t: number) => clamp01(t) ** 2
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Parses a token value: `#rrggbb` or `rgb(r g b / a)`. */
function parseColor(value: string, fallback: RGB): RGB {
  const v = value.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(v)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : fallback
}

interface Palette {
  accent: RGB
  accentBright: RGB
  fg: RGB
  threat: RGB
  canvas: RGB
  surface: RGB
  muted: RGB
  /** Font stacks for canvas text (Geist / JetBrains Mono). */
  sans: string
  mono: string
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: RGB) => parseColor(css.getPropertyValue(name), fallback)
  return {
    accent: token('--color-accent', [217, 119, 6]),
    accentBright: token('--color-accent-hover', [232, 144, 12]),
    fg: token('--color-fg', [243, 244, 246]),
    threat: token('--color-fail', [248, 113, 113]),
    canvas: token('--color-canvas', [12, 13, 14]),
    surface: token('--color-surface', [20, 22, 24]),
    muted: token('--color-muted', [156, 163, 175]),
    sans: css.getPropertyValue('--font-sans').trim() || 'ui-sans-serif, system-ui, sans-serif',
    mono: css.getPropertyValue('--font-mono').trim() || 'ui-monospace, monospace',
  }
}

const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${clamp01(a).toFixed(3)})`

/** Dots grouped by quantised alpha so a frame issues a few dozen fills (hero technique). */
class DotBatch {
  private readonly styles: string[]
  private buf = new Float32Array(3 * 1024)
  private levels: Uint16Array
  private count = 0
  private readonly n: number

  constructor(rgb: RGB, levels = 20) {
    this.n = levels
    this.styles = Array.from({ length: levels }, (_, i) => rgba(rgb, (i + 1) / levels))
    this.levels = new Uint16Array(1024)
  }

  add(x: number, y: number, r: number, alpha: number) {
    if (alpha < 0.02 || r <= 0) return
    if ((this.count + 1) * 3 > this.buf.length) {
      const grown = new Float32Array(this.buf.length * 2)
      grown.set(this.buf)
      this.buf = grown
      const lv = new Uint16Array(this.levels.length * 2)
      lv.set(this.levels)
      this.levels = lv
    }
    const i = this.count++
    this.buf[i * 3] = x
    this.buf[i * 3 + 1] = y
    this.buf[i * 3 + 2] = r
    this.levels[i] = Math.min(this.n - 1, Math.max(0, Math.round(clamp01(alpha) * this.n) - 1))
  }

  flush(c: CanvasRenderingContext2D) {
    for (let l = 0; l < this.n; l++) {
      let any = false
      for (let i = 0; i < this.count; i++) {
        if (this.levels[i] !== l) continue
        if (!any) {
          c.fillStyle = this.styles[l]
          c.beginPath()
          any = true
        }
        const x = this.buf[i * 3]
        const y = this.buf[i * 3 + 1]
        const r = this.buf[i * 3 + 2]
        if (r < 1.05) c.rect(x - r, y - r, r * 2, r * 2)
        else {
          c.moveTo(x + r, y)
          c.arc(x, y, r, 0, TAU)
        }
      }
      if (any) c.fill()
    }
    this.count = 0
  }
}

/* ------------------------------------------------------------ the scene */

interface Frame {
  c: CanvasRenderingContext2D
  /** Story time (s since play). */
  t: number
  /** Design units → canvas px. */
  k: number
  X: (x: number) => number
  Y: (y: number) => number
  pal: Palette
  /** Shared dot batches, flushed in order by the engine. */
  amber: DotBatch
  white: DotBatch
  red: DotBatch
}

/* ------------------------------------------------------------ primitives */

function drawFloor(f: Frame) {
  const { c, X, Y, pal } = f
  c.lineWidth = 1
  for (const xb of [-240, -80, 80, 240, 400, 560, 720, 880]) {
    c.strokeStyle = rgba(pal.fg, 0.05)
    c.beginPath()
    c.moveTo(X(320 + (xb - 320) * 0.4), Y(160))
    c.lineTo(X(xb), Y(240))
    c.stroke()
  }
  for (const y of [166, 180, 200, 228]) {
    c.strokeStyle = rgba(pal.fg, 0.08 * ((y - 150) / 90))
    c.beginPath()
    c.moveTo(X(0), Y(y))
    c.lineTo(X(640), Y(y))
    c.stroke()
  }
}

function glow(f: Frame, x: number, y: number, r: number, rgb: RGB, a: number) {
  if (a <= 0.01) return
  const { c, X, Y, k } = f
  const g = c.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * k)
  g.addColorStop(0, rgba(rgb, a))
  g.addColorStop(1, rgba(rgb, 0))
  c.fillStyle = g
  c.beginPath()
  c.arc(X(x), Y(y), r * k, 0, TAU)
  c.fill()
}

function ring(f: Frame, x: number, y: number, r: number, rgb: RGB, a: number, width = 1) {
  if (a <= 0.01) return
  const { c, X, Y, k } = f
  c.strokeStyle = rgba(rgb, a)
  c.lineWidth = width
  c.beginPath()
  c.arc(X(x), Y(y), r * k, 0, TAU)
  c.stroke()
}

/** A packet streak: bright head, halo, gradient tail from `tail` to `head`. */
function streak(f: Frame, tail: Vec2, head: Vec2, rgb: RGB, a: number, headR = 1.9) {
  if (a <= 0.01) return
  const { c, X, Y, k } = f
  const g = c.createLinearGradient(X(tail[0]), Y(tail[1]), X(head[0]), Y(head[1]))
  g.addColorStop(0, rgba(rgb, 0))
  g.addColorStop(1, rgba(rgb, 0.55 * a))
  c.strokeStyle = g
  c.lineWidth = Math.max(1, 1.3 * k)
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(X(tail[0]), Y(tail[1]))
  c.lineTo(X(head[0]), Y(head[1]))
  c.stroke()
  c.fillStyle = rgba(rgb, 0.18 * a)
  c.beginPath()
  c.arc(X(head[0]), Y(head[1]), headR * 2.6 * k, 0, TAU)
  c.fill()
  c.fillStyle = rgba(rgb, 0.95 * a)
  c.beginPath()
  c.arc(X(head[0]), Y(head[1]), headR * k, 0, TAU)
  c.fill()
}

/** Impact flash + sparks fanning around `dir` (radians), hero strike style. */
function impact(f: Frame, x: number, y: number, age: number, flashRgb: RGB, sparkRgb: RGB, dir: number, seed: number) {
  if (age < 0) return
  if (age < 0.5) glow(f, x, y, 10 + 12 * (age / 0.5), flashRgb, 0.5 * (1 - age / 0.5))
  if (age >= 1.1) return
  const p = age / 1.1
  const rand = mulberry32(seed)
  const travel = (1 - (1 - p) ** 2) * 34
  const batch = sparkRgb === f.pal.threat ? f.red : f.amber
  for (let i = 0; i < 7; i++) {
    const a = dir + (rand() - 0.5) * 1.9
    const d = travel * (0.5 + rand() * 0.5)
    batch.add(f.X(x + Math.cos(a) * d), f.Y(y + Math.sin(a) * d), (1.6 - p) * f.k, 0.85 * (1 - p) ** 1.5)
  }
}

function chevron(f: Frame, x: number, y: number, angle: number, rgb: RGB, a: number, size = 9) {
  if (a <= 0.01) return
  const { c, X, Y, k } = f
  c.strokeStyle = rgba(rgb, a)
  c.lineWidth = 1.5
  c.lineCap = 'round'
  c.lineJoin = 'round'
  const p = (dx: number, dy: number): Vec2 => [
    X(x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * (size / 9)),
    Y(y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * (size / 9)),
  ]
  const [ax, ay] = p(-9, -6)
  const [bx, by] = p(0, 0)
  const [cx, cy] = p(-9, 6)
  c.beginPath()
  c.moveTo(ax, ay)
  c.lineTo(bx, by)
  c.lineTo(cx, cy)
  c.stroke()
  void k
}

/** Seeded loose dust that drifts slowly — the idle "field" around a scene. */
function makeDust(seed: number, n: number, x0: number, x1: number, y0: number, y1: number) {
  const rand = mulberry32(seed)
  return Array.from({ length: n }, () => ({
    x: lerp(x0, x1, rand()),
    y: lerp(y0, y1, rand()),
    r: 0.6 + rand() * 1.1,
    a: 0.12 + rand() * 0.22,
    phase: rand() * TAU,
    speed: 0.25 + rand() * 0.35,
  }))
}
type Dust = ReturnType<typeof makeDust>

function drawDust(f: Frame, dust: Dust, appear: number) {
  for (const d of dust) {
    const x = d.x + Math.sin(f.t * d.speed + d.phase) * 6
    const y = d.y + Math.cos(f.t * d.speed * 0.8 + d.phase) * 4
    f.amber.add(f.X(x), f.Y(y), d.r * f.k, d.a * appear * (0.75 + 0.25 * Math.sin(f.t * 1.3 + d.phase)))
  }
}

/* ---------------------------------------------------------------- padlock */

/**
 * The protected action in the access scene: a particle padlock, floating.
 * `rattle` (0–1) jerks the shackle up as a refused call tries it; it drops
 * straight back — the lock holds. `pulse` (0–1) lights the keyhole.
 */
function drawLock(f: Frame, cx: number, cy: number, s: number, pulse: number, rattle: number) {
  const { c, X, Y, k, t, pal } = f
  const lift = Math.sin((TAU * t) / 7) * 2.4
  const w = s * 1.4
  const h = s * 1.12
  const top = cy - h * 0.32 - lift
  const left = cx - w / 2
  const shR = s * 0.42
  const shY = top - s * 0.2 - rattle * 5

  // floor glow under the lock
  c.save()
  c.translate(X(cx), Y(top + h + s * 0.2))
  c.scale(1, 0.2)
  const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 1.2 * k)
  g.addColorStop(0, rgba(pal.accent, 0.16 + 0.14 * pulse))
  g.addColorStop(1, rgba(pal.accent, 0))
  c.fillStyle = g
  c.beginPath()
  c.arc(0, 0, s * 1.2 * k, 0, TAU)
  c.fill()
  c.restore()

  // the shackle: a dotted arch on two legs, two dots thick
  const shackle = new DotBatch(pal.fg, 16)
  for (const rr of [shR, shR - 4.5]) {
    const n = Math.round((Math.PI * rr) / 2.8)
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI
      const lit = 0.5 + 0.5 * Math.cos(a + Math.PI * 0.75)
      shackle.add(X(cx + Math.cos(a) * rr), Y(shY + Math.sin(a) * rr), 1.15 * k, 0.4 + 0.45 * lit)
    }
    for (const side of [-1, 1]) {
      for (let y = shY; y < top + 4; y += 2.8) shackle.add(X(cx + side * rr), Y(y), 1.15 * k, side < 0 ? 0.75 : 0.45)
    }
  }
  shackle.flush(c)

  // the body: occluded, then a lit dot grid with a brighter edge
  const radius = 6
  c.fillStyle = rgba(pal.canvas, 0.96)
  c.beginPath()
  c.roundRect(X(left), Y(top), w * k, h * k, radius * k)
  c.fill()
  const body = new DotBatch(pal.fg, 16)
  const step = 4.6
  for (let y = top + step / 2; y < top + h; y += step) {
    for (let x = left + step / 2; x < left + w; x += step) {
      const u = (x - left) / w
      const v = (y - top) / h
      const edge = Math.min(u, 1 - u, v, 1 - v) < 0.06
      const lit = 1 - 0.55 * u - 0.25 * v // light from the upper left
      body.add(X(x), Y(y), (edge ? 1.1 : 0.8) * k, (edge ? 0.75 : 0.22) * lit + 0.05)
    }
  }
  body.flush(c)
  c.strokeStyle = rgba(pal.fg, 0.18)
  c.lineWidth = 1
  c.beginPath()
  c.roundRect(X(left + 3), Y(top + 3), (w - 6) * k, (h - 6) * k, (radius - 2) * k)
  c.stroke()

  // the keyhole: a gold ring and slot, lit by `pulse`
  const kx = cx
  const ky = top + h * 0.42
  const gold = new DotBatch(pal.accentBright, 12)
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU
    gold.add(X(kx + Math.cos(a) * 7), Y(ky + Math.sin(a) * 7), 1.1 * k, 0.7 + 0.3 * pulse)
  }
  for (let y = ky + 6; y <= ky + 20; y += 2.6) {
    gold.add(X(kx - 2.2), Y(y), 1 * k, 0.7 + 0.3 * pulse)
    gold.add(X(kx + 2.2), Y(y), 1 * k, 0.7 + 0.3 * pulse)
  }
  gold.flush(c)
  glow(f, kx, ky + 4, 22, pal.accent, 0.1 + 0.4 * pulse)
}

/* ----------------------------------------------------------- text, panels */

interface TextStyle {
  /** Size in design units… */
  size: number
  /** …but never below this many CSS px, so narrow canvases stay legible. */
  min: number
  rgb: RGB
  a?: number
  mono?: boolean
  weight?: number
  align?: CanvasTextAlign
}

/** Draws `s` with its baseline at (x, y); returns its width in design units. */
function text(f: Frame, s: string, x: number, y: number, o: TextStyle) {
  const { c, X, Y, k, pal } = f
  c.font = `${o.weight ?? 400} ${Math.max(o.min, o.size * k)}px ${o.mono ? pal.mono : pal.sans}`
  const w = c.measureText(s).width / k
  if ((o.a ?? 1) <= 0.01) return w
  c.textAlign = o.align ?? 'left'
  c.textBaseline = 'alphabetic'
  c.fillStyle = rgba(o.rgb, o.a ?? 1)
  c.fillText(s, X(x), Y(y))
  return w
}

function roundRect(f: Frame, x: number, y: number, w: number, h: number, r: number, fill: string | null, stroke: string | null, width = 1) {
  const { c, X, Y, k } = f
  c.beginPath()
  c.roundRect(X(x), Y(y), w * k, h * k, r * k)
  if (fill) {
    c.fillStyle = fill
    c.fill()
  }
  if (stroke) {
    c.strokeStyle = stroke
    c.lineWidth = width
    c.stroke()
  }
}

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/* ------------------------------------------------------- scene: donation */

/**
 * The attack told with numbers: a vault panel with live Assets / Shares /
 * Share price counters, and a printed receipt for each deposit. The attacker
 * buys 1 share for $1, donates $10,000 (assets jump, shares stay 1, so one
 * share costs $10,001), and the next $5,000 deposit prints a receipt for
 * 0 shares — its money now belongs to the attacker's single share.
 */
function donationScene() {
  const rand = mulberry32(7)
  const attacker: Vec2 = [72, 58]
  const you: Vec2 = [568, 58]
  const PANEL = { x: 214, y: 30, w: 212, h: 150 }
  const inletL: Vec2 = [PANEL.x, 104]
  const inletR: Vec2 = [PANEL.x + PANEL.w, 104]
  const RECEIPT = { w: 100, h: 50, y: 98 }
  /** Narrow canvases (phones): text hits its px floor, so the layout loosens. */
  const COMPACT = 0.8

  // beats (scene seconds)
  const SEED = 0.35 // attacker deposits $1…
  const SEED_FLIGHT = 0.5
  const SEEDED = SEED + SEED_FLIGHT // …and gets 1 share
  const DONATE = 1.1 // the $10,000 donation pours in, no shares minted
  const DEP = 3.0 // you deposit $5,000…
  const DEP_FLIGHT = 0.7
  const DEPOSITED = DEP + DEP_FLIGHT
  const PRINT = DEPOSITED + 0.2 // …your receipt prints…
  const EMPTY = PRINT + 0.8 // …and it is stamped: 0 shares
  const TAKE = EMPTY + 0.2 // the attacker's 1 share now owns your $5,000
  const TAKE_FLIGHT = 0.6
  const TAKEN = TAKE + TAKE_FLIGHT

  const stream = Array.from({ length: 90 }, (_, i) => {
    const sy = attacker[1] + 4 + (rand() - 0.5) * 14
    return {
      from: [attacker[0] + 26 + rand() * 6, sy] as Vec2,
      ctrl: [150 + rand() * 30, 64 + (rand() - 0.5) * 40] as Vec2,
      to: [inletL[0], inletL[1] + (rand() - 0.5) * 16] as Vec2,
      at: DONATE + (i / 90) * 1.0 + rand() * 0.12,
      flight: 0.6 + rand() * 0.3,
      r: 1 + rand() * 1.4,
    }
  })
  const bez = (p: (typeof stream)[number], q: number): Vec2 => {
    const u = 1 - q
    return [
      u * u * p.from[0] + 2 * u * q * p.ctrl[0] + q * q * p.to[0],
      u * u * p.from[1] + 2 * u * q * p.ctrl[1] + q * q * p.to[1],
    ]
  }
  const dust = makeDust(71, 20, 120, 520, 20, 220)

  /** A wallet: head and shoulders, like the access scene's caller. */
  const wallet = (f: Frame, [x, y]: Vec2, rgb: RGB, a: number) => {
    if (a <= 0.01) return
    const { c, X, Y, k } = f
    c.strokeStyle = rgba(rgb, 0.95 * a)
    c.lineWidth = 1.5
    c.beginPath()
    c.arc(X(x), Y(y - 7), 7 * k, 0, TAU)
    c.stroke()
    c.beginPath()
    c.moveTo(X(x - 12), Y(y + 13))
    c.bezierCurveTo(X(x - 10), Y(y + 4), X(x + 10), Y(y + 4), X(x + 12), Y(y + 13))
    c.stroke()
    for (let i = 0; i < 22; i++) {
      const ang = (i / 22) * TAU + f.t * 0.15
      f[rgb === f.pal.threat ? 'red' : 'white'].add(X(x + Math.cos(ang) * 24), Y(y + 2 + Math.sin(ang) * 24), 1 * k, 0.5 * a)
    }
  }

  /** A receipt slip under a wallet; `print` (0–1) slides it out. */
  const receipt = (f: Frame, cx: number, print: number, paid: string, shares: string, rgb: RGB, glowA: number) => {
    if (print <= 0) return
    const { pal } = f
    const a = smooth(0, 0.6, print)
    const rw = f.k < COMPACT ? 116 : RECEIPT.w
    const x = cx - rw / 2
    const y = RECEIPT.y - 8 * (1 - easeOut(print))
    if (glowA > 0.01) glow(f, cx, y + RECEIPT.h / 2, 64, rgb, 0.22 * glowA)
    roundRect(f, x, y, rw, RECEIPT.h, 4, rgba(pal.surface, 0.96 * a), rgba(rgb === pal.fg ? pal.fg : rgb, (rgb === pal.fg ? 0.18 : 0.75) * a))
    // perforated top edge
    for (let px = x + 6; px <= x + rw - 6; px += 4) f.white.add(f.X(px), f.Y(y + 5), 0.6 * f.k, 0.25 * a)
    text(f, `PAID ${paid}`, cx, y + 20, { size: 8.5, min: 8, rgb: pal.muted, a, mono: true, align: 'center' })
    text(f, shares, cx, y + 40, { size: 15, min: 10, rgb, a, mono: true, weight: 600, align: 'center' })
  }

  return (f: Frame) => {
    const { t, pal, c, X, Y } = f
    drawFloor(f)
    drawDust(f, dust, 0.5)

    // value held, as the story moves money in
    let landed = 0
    let pulse = 0
    for (const p of stream) {
      const age = t - p.at - p.flight
      if (age < 0) continue
      landed++
      pulse += Math.exp(-age / 0.35) * 0.08
    }
    const seeded = t >= SEEDED
    const assets =
      (seeded ? 1 : 0) + 10000 * (landed / stream.length) + 5000 * easeOut((t - DEPOSITED) / 0.4) * (t >= DEPOSITED ? 1 : 0)
    const shares = seeded ? 1 : 0
    const price = shares ? assets / shares : 0
    pulse = Math.min(1, pulse + (t >= DEPOSITED ? Math.exp(-(t - DEPOSITED) / 0.4) * 0.6 : 0))

    // 1 · the attacker: buys 1 share for $1, then donates $10,000 with no receipt
    const attA = easeOut(t / 0.5)
    wallet(f, attacker, pal.threat, attA)
    const seed = clamp01((t - SEED) / SEED_FLIGHT)
    if (t >= SEED && seed < 1) {
      const at = (q: number): Vec2 => [lerp(attacker[0] + 26, inletL[0], q), lerp(attacker[1] + 4, inletL[1], q)]
      streak(f, at(Math.max(0, easeIn(seed) - 0.25)), at(easeIn(seed)), pal.fg, smooth(0, 0.2, seed) * (1 - smooth(0.85, 1, seed)), 2.4)
    }
    for (const p of stream) {
      const q = (t - p.at) / p.flight
      if (q < 0 || q >= 1) continue
      const e = easeIn(q) * 0.85 + q * 0.15
      streak(f, bez(p, Math.max(0, e - 0.16)), bez(p, e), pal.accent, smooth(0, 0.15, q) * (1 - smooth(0.9, 1, q)), p.r)
    }
    // what the donation is: money in, no shares out
    // (on phones it sits under the attacker's receipt until the receipt's worth replaces it)
    const compact = f.k < COMPACT
    const won = smooth(TAKEN - 0.1, TAKEN + 0.3, t)
    const tagA = smooth(DONATE, DONATE + 0.4, t) * (compact ? 1 - won : 1)
    const tag: Vec2 = compact ? [attacker[0], RECEIPT.y + RECEIPT.h + 16] : [160, 156]
    text(f, '+$10,000', tag[0], tag[1], { size: 11, min: 8.5, rgb: pal.accentBright, a: tagA, mono: true, weight: 600, align: 'center' })
    if (!compact) text(f, 'donated, no shares', tag[0], tag[1] + 14, { size: 8.5, min: 8, rgb: pal.muted, a: tagA, align: 'center' })
    else text(f, 'donated', tag[0], tag[1] + 22, { size: 8.5, min: 8, rgb: pal.muted, a: tagA, align: 'center' })

    // the attacker's receipt: 1 share — which ends up worth everything in the vault
    receipt(f, attacker[0], clamp01((t - SEEDED - 0.05) / 0.4), '$1', '1 share', won > 0 ? pal.accentBright : pal.fg, won)
    if (won > 0) {
      const worth = { size: 9.5, min: 8.5, rgb: pal.accentBright, a: won, mono: true, align: 'center' as const }
      const y = RECEIPT.y + RECEIPT.h + 16
      if (!compact) text(f, `worth ${usd(price)}`, attacker[0], y, worth)
      else {
        text(f, 'worth', attacker[0], y, { ...worth, rgb: pal.muted })
        text(f, usd(price), attacker[0], y + 20, worth)
      }
    }
    if (t > TAKEN && t < TAKEN + 0.9) {
      const q = (t - TAKEN) / 0.9
      c.strokeStyle = rgba(pal.accentBright, 0.6 * (1 - q))
      c.lineWidth = 1.2
      const pad = 3 + q * 10
      c.beginPath()
      const rw = compact ? 116 : RECEIPT.w
      c.roundRect(X(attacker[0] - rw / 2 - pad), Y(RECEIPT.y - pad), (rw + pad * 2) * f.k, (RECEIPT.h + pad * 2) * f.k, 6 * f.k)
      c.stroke()
    }

    // the vault: a panel of live counters
    const panelA = smooth(0, 0.4, t)
    const { x: px, y: py, w: pw, h: ph } = PANEL
    glow(f, px + pw / 2, py + ph * 0.75, 130, pal.accent, (0.05 + 0.1 * pulse) * panelA)
    roundRect(f, px, py, pw, ph, 8, rgba(pal.surface, 0.94 * panelA), rgba(pal.fg, 0.14 * panelA))
    const left = px + 16
    const right = px + pw - 16
    text(f, 'VAULT', left, py + 21, { size: 8.5, min: 8, rgb: pal.muted, a: panelA, mono: true })
    f.amber.add(X(right - 2), Y(py + 18), 2.2 * f.k, panelA * (0.55 + 0.45 * Math.sin(t * 3)))
    c.strokeStyle = rgba(pal.fg, 0.08 * panelA)
    c.lineWidth = 1
    for (const ly of [py + 32, py + 106]) {
      c.beginPath()
      c.moveTo(X(px + 1), Y(ly))
      c.lineTo(X(px + pw - 1), Y(ly))
      c.stroke()
    }
    const label = { size: 10, min: 8.5, rgb: pal.muted, a: panelA }
    const value = { size: 15, min: 10, rgb: pal.fg, a: panelA, mono: true, weight: 600, align: 'right' as const }
    text(f, 'Assets', left, py + 62, label)
    text(f, usd(assets), right, py + 62, { ...value, rgb: pulse > 0.05 ? pal.accentBright : pal.fg })
    text(f, 'Shares', left, py + 92, label)
    text(f, String(shares), right, py + 92, value)
    // shares stay at 1 while the money pours in: underline the stuck number
    const stuck = smooth(DONATE + 0.5, DONATE + 1, t) * (1 - smooth(EMPTY + 1, EMPTY + 1.6, t))
    if (stuck > 0) {
      c.setLineDash([2 * f.k, 2 * f.k])
      c.strokeStyle = rgba(pal.accentBright, 0.6 * stuck)
      c.beginPath()
      c.moveTo(X(right - 12), Y(py + 97))
      c.lineTo(X(right + 1), Y(py + 97))
      c.stroke()
      c.setLineDash([])
    }
    // 2 · one share's price jumps with every dollar donated
    const priceA = smooth(1.3, 1.7, t)
    text(f, compact ? 'Price / share' : 'Price of 1 share', left, py + 134, label)
    const pw2 = text(f, usd(price), right, py + 134, { ...value, rgb: priceA > 0 ? pal.accentBright : pal.fg })
    if (priceA > 0) {
      glow(f, right - pw2 / 2, py + 129, 40, pal.accent, (0.1 + 0.25 * pulse) * priceA)
      if (!compact) chevron(f, right - pw2 - 8, py + 130, -Math.PI / 2, pal.accentBright, priceA, 6)
    }

    // 3 · you deposit $5,000…
    const youA = easeOut((t - (DEP - 0.4)) / 0.5)
    if (t > DEP - 0.4) {
      const hit = t > EMPTY ? Math.exp(-(t - EMPTY) / 0.25) : 0
      const at: Vec2 = [you[0] + Math.sin(t * 70) * 3 * hit, you[1]]
      wallet(f, at, pal.fg, youA)
      if (t > EMPTY) wallet(f, at, pal.threat, 0.45 + 0.55 * Math.exp(-(t - EMPTY) / 0.8))
    }
    const dep = clamp01((t - DEP) / DEP_FLIGHT)
    if (t >= DEP && dep < 1) {
      const at = (q: number): Vec2 => [lerp(you[0] - 26, inletR[0], q), lerp(you[1] + 4, inletR[1], q) - Math.sin(q * Math.PI) * 10]
      const e = easeIn(dep)
      streak(f, at(Math.max(0, e - 0.25)), at(e), pal.fg, smooth(0, 0.2, dep) * (1 - smooth(0.85, 1, dep)), 3.2)
    }

    // …your receipt prints 0 shares, and is stamped red
    const lost = smooth(EMPTY, EMPTY + 0.25, t)
    const youRgb: RGB = [lerp(pal.fg[0], pal.threat[0], lost), lerp(pal.fg[1], pal.threat[1], lost), lerp(pal.fg[2], pal.threat[2], lost)]
    receipt(f, you[0], clamp01((t - PRINT) / 0.4), '$5,000', '0 shares', lost > 0.5 ? pal.threat : t >= PRINT ? youRgb : pal.fg, lost)
    impact(f, you[0], RECEIPT.y + RECEIPT.h / 2, t - EMPTY, pal.threat, pal.threat, Math.PI / 2, 1709)

    // the sum behind it: shares are rounded down to a whole number
    const mathA = smooth(PRINT + 0.3, PRINT + 0.7, t)
    if (mathA > 0) {
      const y = PANEL.y + PANEL.h + 24
      const lhs = '$5,000 ÷ $10,001 = 0.49 → '
      const rhs = 'rounds down to 0'
      const style = { size: 9.5, min: 8.5, mono: true, a: mathA }
      const w1 = text(f, lhs, 0, y, { ...style, rgb: pal.muted, a: 0 })
      const w2 = text(f, rhs, 0, y, { ...style, rgb: pal.threat, a: 0 })
      const x0 = 320 - (w1 + w2) / 2
      text(f, lhs, x0, y, { ...style, rgb: pal.muted })
      text(f, rhs, x0 + w1, y, { ...style, rgb: pal.threat })
    }

    // your $5,000 now sits behind the attacker's single share
    const take = clamp01((t - TAKE) / TAKE_FLIGHT)
    if (t >= TAKE && take < 1) {
      const to: Vec2 = [attacker[0] + RECEIPT.w / 2, RECEIPT.y + RECEIPT.h / 2]
      const at = (q: number): Vec2 => [lerp(inletL[0], to[0], q), lerp(inletL[1], to[1], q) - Math.sin(q * Math.PI) * 18]
      const e = easeIn(take) * 0.8 + take * 0.2
      streak(f, at(Math.max(0, e - 0.25)), at(e), pal.accentBright, smooth(0, 0.15, take), 2.6)
    }
  }
}

/* ------------------------------------------------------- scene: rounding */

function roundingScene() {
  const x = (u: number) => 40 + u * 500
  const expected = (u: number) => 128 - 70 * u ** 1.3
  const actual = (u: number) => 136 + 12 * u
  const rand = mulberry32(19)
  const dust = Array.from({ length: 80 }, (_, i) => ({
    at: 0.8 + (i / 80) * 2.2,
    u: rand(),
    h: 0.12 + rand() * 0.8,
    phase: rand() * TAU,
    r: 0.7 + rand() * 1.2,
  }))
  const field = makeDust(23, 18, 20, 620, 40, 200)
  // packets: one every 0.55 s on a 1.15-lane loop at 0.42 lanes/s
  const PACKETS = 6
  const FLOW = 0.42
  const LOOP = 1.15
  // checkpoints where rounding shaves a chip off; later ones lose more
  const checks = [0.2, 0.4, 0.6, 0.8, 1].map((u, i) => ({
    u,
    // time the lane reveal reaches this checkpoint (inverse of easeOut)
    reveal: 2.2 * (1 - Math.cbrt(1 - u)),
    chips: 1 + i,
    floor: actual(u) + 30 + i * 2,
  }))
  const PILE_CAP = 12 // passes until a pile stops growing
  const FALL = 0.9
  // pile dots: fixed seeded mound shape per checkpoint, revealed one by one
  const piles = checks.map((ck, i) => {
    const pr = mulberry32(300 + i)
    return Array.from({ length: PILE_CAP * ck.chips }, (_, j) => {
      const q = (j + 1) / (PILE_CAP * ck.chips)
      const w = 3 + 9 * Math.sqrt(q) * (0.7 + 0.12 * i)
      const dx = (pr() - 0.5) * 2 * w
      return { dx, dy: -pr() * (w * 0.55) * (1 - Math.abs(dx) / w), r: 0.8 + pr() * 0.8 }
    })
  })
  /** Packet n's passes over checkpoint u up to t: count, and the times of the last few. */
  const passes = (n: number, u: number, from: number, t: number) => {
    const m = Math.floor(((t - n * 0.55) * FLOW - u) / LOOP)
    const out: number[] = []
    for (let k = Math.max(0, m - 2); k <= m; k++) {
      const te = n * 0.55 + (u + LOOP * k) / FLOW
      if (te >= from && te <= t) out.push(te)
    }
    const first = Math.max(0, Math.ceil(((from - n * 0.55) * FLOW - u) / LOOP))
    return { count: Math.max(0, m - first + 1), recent: out }
  }

  return (f: Frame) => {
    const { t, pal, c, X, Y } = f
    drawFloor(f)
    drawDust(f, field, 0.5)
    const head = easeOut(t / 2.2)

    // gap: the loss between the two values, warming to red as it widens
    const gapA = smooth(0.8, 2.4, t)
    if (gapA > 0) {
      const gg = c.createLinearGradient(X(x(0)), 0, X(x(1)), 0)
      gg.addColorStop(0, rgba(pal.accent, 0.05 * gapA))
      gg.addColorStop(0.55, rgba(pal.accent, 0.1 * gapA))
      gg.addColorStop(1, rgba(pal.threat, 0.16 * gapA))
      c.fillStyle = gg
      c.beginPath()
      const steps = 40
      for (let i = 0; i <= steps; i++) {
        const u = (i / steps) * head
        if (i) c.lineTo(X(x(u)), Y(expected(u)))
        else c.moveTo(X(x(u)), Y(expected(u)))
      }
      for (let i = steps; i >= 0; i--) {
        const u = (i / steps) * head
        c.lineTo(X(x(u)), Y(actual(u)))
      }
      c.closePath()
      c.fill()
    }

    // lanes reveal as their dotted paths
    for (let u = 0; u <= head; u += 0.012) {
      f.white.add(X(x(u)), Y(expected(u)), 0.8 * f.k, 0.45)
      f.amber.add(X(x(u)), Y(actual(u)), 0.9 * f.k, 0.7)
    }
    for (let i = 0; i < 5; i++) {
      const u = i * 0.2
      if (u > head) break
      ring(f, x(u), expected(u), 3.2, pal.fg, 0.8, 1.2)
      f.amber.add(X(x(u)), Y(actual(u)), 3 * f.k, 0.95)
      glow(f, x(u), actual(u), 8, pal.accent, 0.25)
    }

    // loss drops: a red shortfall marker at each checkpoint once reached
    c.lineWidth = 1
    c.setLineDash([2 * f.k, 3 * f.k])
    for (const ck of checks.slice(0, -1)) {
      const a = smooth(ck.reveal + 0.2, ck.reveal + 0.6, t)
      if (a <= 0) continue
      const top = expected(ck.u) + 5
      const bot = actual(ck.u) - 5
      c.strokeStyle = rgba(pal.threat, 0.55 * a)
      c.beginPath()
      c.moveTo(X(x(ck.u)), Y(top))
      c.lineTo(X(x(ck.u)), Y(lerp(top, bot, a)))
      c.stroke()
    }
    c.setLineDash([])

    // each pass, rounding shaves chips off the rounded lane; they drop and pile up
    for (let i = 0; i < checks.length; i++) {
      const ck = checks[i]
      const from = ck.reveal + 0.1
      let count = 0
      for (let n = 0; n < PACKETS; n++) {
        const pass = passes(n, ck.u, from, t)
        count += pass.count
        for (const te of pass.recent) {
          const age = t - te
          if (age >= FALL) continue
          const cr = mulberry32(Math.round(te * 1000) + i)
          for (let j = 0; j < ck.chips; j++) {
            const q = clamp01(age / (FALL * (0.8 + cr() * 0.2)))
            const drift = (cr() - 0.5) * 14
            const cx = x(ck.u) + 2 + drift * easeOut(q)
            const cy = lerp(actual(ck.u) + 2, ck.floor, easeIn(q))
            f.red.add(X(cx), Y(cy), (1.1 + cr() * 0.6) * f.k, 0.9 * (1 - 0.4 * q))
          }
        }
      }
      // the pile: one mound dot per landed chip, capped
      const landed = Math.min(piles[i].length, Math.max(0, count - 1) * ck.chips)
      for (let j = 0; j < landed; j++) {
        const d = piles[i][j]
        f.red.add(X(x(ck.u) + d.dx), Y(ck.floor + d.dy), d.r * f.k, 0.6 + 0.2 * Math.sin(t * 1.2 + j))
      }
    }

    // packets travel both lanes side by side (and keep trickling in idle)
    for (let n = 0; n < PACKETS; n++) {
      const start = n * 0.55
      const age = t - start
      if (age < 0) continue
      const u = (age * FLOW) % LOOP
      if (u > 1 || u > head + 0.02) continue
      const a = smooth(0, 0.05, u) * (1 - smooth(0.92, 1, u)) * (t > 4 ? 0.55 : 1)
      const tailU = Math.max(0, u - 0.06)
      streak(f, [x(tailU), expected(tailU)], [x(u), expected(u)], pal.fg, a * 0.8, 1.7)
      streak(f, [x(tailU), actual(tailU)], [x(u), actual(u)], pal.accent, a, 1.9)
    }

    // the rounded lane sheds value into the gap
    for (const d of dust) {
      const age = t - d.at
      if (age < 0 || d.u > head) continue
      const rise = easeOut(age / 0.9)
      const yTop = lerp(actual(d.u), expected(d.u), d.h)
      const wob = Math.sin(t * 0.8 + d.phase) * 1.6
      f.amber.add(X(x(d.u) + wob), Y(lerp(actual(d.u), yTop, rise) + wob * 0.5), d.r * f.k, 0.55 * smooth(0, 0.2, age) * (0.7 + 0.3 * Math.sin(t * 1.7 + d.phase)))
    }

    // end markers and the loss bracket
    const ex = x(1)
    const endA = smooth(2.3, 2.6, t)
    ring(f, ex, expected(1), 7 * (0.6 + 0.4 * endA), pal.fg, endA, 1.6)
    ring(f, ex, actual(1), 7 * (0.6 + 0.4 * smooth(2.5, 2.8, t)), pal.accent, smooth(2.5, 2.8, t), 1.8)
    const br = smooth(2.9, 3.3, t)
    if (br > 0) {
      c.strokeStyle = rgba(pal.threat, 0.9 * br)
      c.lineWidth = 1.2
      c.beginPath()
      c.moveTo(X(ex + 18), Y(expected(1)))
      c.lineTo(X(ex + 34), Y(expected(1)))
      c.moveTo(X(ex + 18), Y(actual(1)))
      c.lineTo(X(ex + 34), Y(actual(1)))
      c.stroke()
      c.setLineDash([3 * f.k, 4 * f.k])
      c.beginPath()
      c.moveTo(X(ex + 26), Y(expected(1)))
      c.lineTo(X(ex + 26), Y(lerp(expected(1), actual(1), br)))
      c.stroke()
      c.setLineDash([])
      // minus sign beside the bracket: the shortfall
      c.lineWidth = 1.6
      c.beginPath()
      c.moveTo(X(ex + 40), Y((expected(1) + actual(1)) / 2))
      c.lineTo(X(ex + 50), Y((expected(1) + actual(1)) / 2))
      c.stroke()
    }
  }
}

/* ------------------------------------------------------- scene: overflow */

function overflowScene() {
  const cx = 330
  const cy = 176
  const r = 104
  const LIMIT = 0.9 * Math.PI
  const at = (phi: number, rr = r): Vec2 => [cx - rr * Math.cos(phi), cy - rr * Math.sin(phi)]
  // Inputs never stop: the n-th particle leaves at n / INPUT_RATE (same pace
  // as the opening burst), seeded per index so every frame agrees.
  const INPUT_RATE = 26 // per second
  // Input volume swells and eases in waves (each swell reaches the threshold); bigger inputs push the meter harder.
  const surge = (n: number) => {
    const s = n / INPUT_RATE
    return (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(s * 1.7))) * (0.92 + 0.08 * Math.sin(s * 0.63 + 1))
  }
  const input = (n: number) => {
    const rand = mulberry32(1000 + n)
    const at = n / INPUT_RATE + rand() * 0.1
    const flight = 0.5 + rand() * 0.3
    const y = 150 + (rand() - 0.5) * 30
    const x0 = rand() * 60
    const w = (1 + rand() * 1.3) * surge(n)
    return { y, x0, at, flight, arrive: at + flight, r: w }
  }
  // Live meter after the story: driven by arriving inputs — each one kicks the
  // needle up (fast attack), then it eases back down (slow release).
  const KICK = 0.068
  const RELEASE = 0.26
  const liveLevel = (t: number) => {
    let sum = 0
    const newest = Math.floor(t * INPUT_RATE)
    for (let n = Math.max(0, newest - Math.ceil(2.2 * INPUT_RATE)); n <= newest; n++) {
      const p = input(n)
      const dt = t - p.arrive
      if (dt < 0) continue
      sum += KICK * p.r * (1 - Math.exp(-dt / 0.04)) * Math.exp(-dt / RELEASE)
    }
    return 0.5 + sum
  }
  const arcDots = 70
  const boundary = 480
  // Threshold: the highest value the vault accepts. Touching it fires the
  // value at the wall, where it is stopped instead of wrapping.
  const TH = 0.95
  const thPhi = TH * LIMIT
  const thPoint = at(thPhi)
  const hitY = thPoint[1]
  const BEAM = 0.45 // s from threshold to wall
  const live = (t: number) => smooth(STORY_END.overflow, STORY_END.overflow + 1.2, t)
  const levelAt = (t: number) => Math.min(1, lerp(easeIn(clamp01((t - 1.2) / 1.4)), liveLevel(t), live(t)))
  // Beam launches: the story's own, then every time the live meter touches the
  // threshold (re-armed once it falls back, at most one per 1.2 s). Scanned
  // forward once and cached — the level is a pure function of time.
  const launches = [2.6]
  let scanned = STORY_END.overflow + 1.2
  let armed = false
  const launchesUpTo = (t: number) => {
    for (; scanned < t; scanned += 1 / 60) {
      const l = levelAt(scanned)
      if (l < TH - 0.08) armed = true
      else if (armed && l >= TH && scanned - launches[launches.length - 1] > 1.2) {
        launches.push(scanned)
        armed = false
      }
    }
    return launches
  }
  const field = makeDust(31, 20, 0, 220, 60, 200)

  return (f: Frame) => {
    const { t, pal, c, X, Y } = f
    drawFloor(f)
    drawDust(f, field, 0.6)

    // 1 · extreme inputs pour in — and keep coming
    const newest = Math.floor(t * INPUT_RATE)
    for (let n = Math.max(0, newest - Math.ceil(0.95 * INPUT_RATE)); n <= newest; n++) {
      const p = input(n)
      const q = (t - p.at) / p.flight
      if (q < 0 || q >= 1) continue
      const e = easeIn(q)
      const pos = (v: number): Vec2 => [lerp(p.x0, cx - r, v), lerp(p.y, cy, v * v)]
      streak(f, pos(Math.max(0, e - 0.2)), pos(e), pal.accent, smooth(0, 0.2, q), p.r)
    }
    chevron(f, 214, 150, 0, pal.accent, 0.9 * smooth(0.8, 1.1, t))

    // inputs landing on the gauge flash at its base
    let landing = 0
    for (let n = Math.max(0, newest - Math.ceil(0.95 * INPUT_RATE)); n <= newest; n++) {
      const p = input(n)
      const dt = t - p.arrive
      if (dt >= 0 && dt < 0.3) landing += p.r * (1 - dt / 0.3)
    }
    glow(f, cx - r, cy, 14, pal.accent, Math.min(0.4, 0.05 * landing))

    // gauge: dotted arc + ticks. The story climbs to the threshold; afterwards
    // the needle drops back and rides the input stream, touching it on surges.
    const liveA = live(t)
    const level = levelAt(t)
    const atLimit = liveA > 0 ? smooth(TH - 0.04, TH, level) * liveA : 0
    const headPhi = level * LIMIT
    const gaugeA = smooth(1.0, 1.4, t)
    for (let i = 0; i <= arcDots; i++) {
      const phi = (i / arcDots) * Math.PI
      const [ax, ay] = at(phi)
      const lit = phi <= headPhi && t >= 1.2
      if (lit) f.amber.add(X(ax), Y(ay), 1.5 * f.k, 0.95)
      else f.white.add(X(ax), Y(ay), 0.9 * f.k, phi > thPhi ? 0.35 : 0.22)
    }
    for (let i = 0; i <= 24; i++) {
      const phi = (Math.PI * i) / 24
      const [x1, y1] = at(phi, r - 10)
      const [x2, y2] = at(phi, r - (i % 4 === 0 ? 22 : 16))
      const near = t >= 1.2 ? Math.exp(-(((phi - headPhi) / 0.18) ** 2)) : 0
      c.strokeStyle = near > 0.05 ? rgba(pal.accentBright, 0.4 + 0.6 * near) : rgba(pal.fg, 0.32)
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(X(x1), Y(y1))
      c.lineTo(X(x2), Y(y2))
      c.stroke()
    }

    // threshold indicator: a red marker across the arc, with the zone past it shaded
    const fired = launchesUpTo(t).filter((e) => e <= t)
    const lastFire = fired.length ? t - fired[fired.length - 1] : Infinity
    const markFlash = lastFire < 0.6 ? 1 - lastFire / 0.6 : 0
    if (gaugeA > 0) {
      c.strokeStyle = rgba(pal.threat, 0.22 * gaugeA)
      c.lineWidth = 3 * f.k
      c.beginPath()
      c.arc(X(cx), Y(cy), (r + 7) * f.k, Math.PI + thPhi, TAU)
      c.stroke()
      const [m1x, m1y] = at(thPhi, r - 24)
      const [m2x, m2y] = at(thPhi, r + 14)
      c.strokeStyle = rgba(pal.threat, (0.8 + 0.2 * markFlash) * gaugeA)
      c.lineWidth = 2
      c.beginPath()
      c.moveTo(X(m1x), Y(m1y))
      c.lineTo(X(m2x), Y(m2y))
      c.stroke()
      const [nx, ny] = at(thPhi, r + 22)
      const [lx, ly] = at(thPhi - 0.05, r + 30)
      const [rx, ry] = at(thPhi + 0.05, r + 30)
      c.fillStyle = rgba(pal.threat, 0.9 * gaugeA)
      c.beginPath()
      c.moveTo(X(nx), Y(ny))
      c.lineTo(X(lx), Y(ly))
      c.lineTo(X(rx), Y(ry))
      c.closePath()
      c.fill()
      glow(f, ...thPoint, 18 + 14 * markFlash, pal.threat, (0.12 + 0.35 * markFlash) * gaugeA)
    }

    // 2 · the value climbs toward the threshold
    if (t >= 1.2 && t < 2.75) {
      const [hx, hy] = at(headPhi)
      streak(f, at(Math.max(0, headPhi - 0.25)), [hx, hy], pal.accentBright, 1, 2.6)
    }
    if (liveA > 0) {
      const [hx, hy] = at(headPhi)
      f.amber.add(X(hx), Y(hy), (2.4 + atLimit) * f.k, 0.95)
    }
    if (t >= 1.2) glow(f, ...at(headPhi), 26 + 10 * atLimit, pal.accent, (0.25 + 0.2 * atLimit) * smooth(1.2, 1.6, t))
    // warning triangle: full while the story hits the threshold; afterwards it flares on each touch
    const warn = smooth(2.3, 2.6, t) * (1 - liveA * (1 - (0.4 + 0.6 * Math.max(atLimit, markFlash))))
    if (warn > 0) {
      const flick = t < 3.2 || markFlash > 0 ? 0.75 + 0.25 * Math.sin(t * 30) : 1
      const s = 0.7 + 0.3 * warn
      c.strokeStyle = rgba(pal.accentBright, warn * flick)
      c.lineWidth = 1.8
      c.lineJoin = 'round'
      c.beginPath()
      c.moveTo(X(cx), Y(cy - 44 - 22 * s))
      c.lineTo(X(cx + 26 * s), Y(cy - 44 + 22 * s))
      c.lineTo(X(cx - 26 * s), Y(cy - 44 + 22 * s))
      c.closePath()
      c.moveTo(X(cx), Y(cy - 52 + 6))
      c.lineTo(X(cx), Y(cy - 38))
      c.moveTo(X(cx), Y(cy - 31))
      c.lineTo(X(cx), Y(cy - 30.5))
      c.stroke()
      glow(f, cx, cy - 44, 34, pal.accent, 0.14 * warn)
    }

    // boundary: a dotted wall the value cannot pass; each hit ripples along it
    const wallA = smooth(2.4, 2.8, t)
    const hits = fired.map((e) => t - e - BEAM).filter((age) => age > 0 && age < 1.4)
    for (let y = 44; y <= 224; y += 5) {
      let ripple = 0
      for (const age of hits) ripple = Math.max(ripple, Math.exp(-(((Math.abs(y - hitY) - age * 90) / 10) ** 2)) * (1 - age / 1.4))
      if (ripple > 0.05) f.amber.add(X(boundary), Y(y), 1.4 * f.k, 0.4 + 0.6 * ripple)
      else f.white.add(X(boundary), Y(y), 0.9 * f.k, 0.5 * wallA)
    }
    // 3 · touching the threshold fires the value at the wall, where it stops
    fired.forEach((e, i) => {
      const age = t - e
      if (age < BEAM) {
        const q = easeIn(age / BEAM)
        const p = (v: number): Vec2 => [lerp(thPoint[0], boundary, v), hitY]
        streak(f, p(Math.max(0, q - 0.4)), p(q), pal.threat, 1, 2.4)
      } else if (age < BEAM + 1.2) {
        impact(f, boundary, hitY, age - BEAM, pal.accentBright, pal.threat, Math.PI, 5 + i)
      }
    })
    const stop = smooth(2.6 + BEAM, 3.4, t)
    if (stop > 0) {
      const flare = hits.length ? Math.max(...hits.map((age) => Math.max(0, 1 - age / 0.6))) : 0
      const sr = 16 * (0.6 + 0.4 * stop) * (1 + 0.18 * flare)
      ring(f, 528, hitY, sr, pal.threat, stop, 2)
      glow(f, 528, hitY, 30, pal.threat, 0.25 * flare)
      c.strokeStyle = rgba(pal.threat, stop)
      c.beginPath()
      c.moveTo(X(528 - sr * 0.7), Y(hitY - sr * 0.7))
      c.lineTo(X(528 + sr * 0.7), Y(hitY + sr * 0.7))
      c.stroke()
      for (let i = 0; i < 3; i++) f.white.add(X(568 + i * 22), Y(hitY), 1.6 * f.k, (0.45 - i * 0.13) * smooth(3.4, 3.9, t))
    }
  }
}

/* --------------------------------------------------------- scene: access */

function accessScene() {
  const caller: Vec2 = [110, 124]
  const vault: Vec2 = [486, 116]
  const shieldR = 150
  const shieldFrom = Math.PI * 0.8
  const shieldTo = Math.PI * 1.2
  const shieldAt = (a: number): Vec2 => [vault[0] + shieldR * Math.cos(a), vault[1] + shieldR * Math.sin(a) * 0.72]
  // The caller keeps attacking at the opening pace; every packet is turned
  // away by the shield. Strike n launches at FIRST + n · EVERY, seeded per index.
  const FIRST = 0.4
  const EVERY = 0.32
  const FLIGHT = 0.85
  const AFTERMATH = 1.3 // s a hit keeps rippling / sparking
  const opening = [1.06, 0.97, 0.9]
  const strike = (n: number) => {
    const a = Math.PI * (n < opening.length ? opening[n] : 0.86 + mulberry32(500 + n)() * 0.28)
    const at = FIRST + n * EVERY
    return { n, at, a, flight: FLIGHT, hitAt: at + FLIGHT, pos: shieldAt(a) }
  }
  const ringDots = 30
  const field = makeDust(43, 16, 20, 300, 50, 200)

  return (f: Frame) => {
    const { t, pal, c, X, Y } = f
    drawFloor(f)
    drawDust(f, field, 0.5)

    // 1 · the unauthorised caller: a node like the hero's network
    const pop = easeOut(t / 0.5)
    for (let i = 0; i < ringDots; i++) {
      const a = (i / ringDots) * TAU + t * 0.15
      f.amber.add(X(caller[0] + Math.cos(a) * 34 * pop), Y(caller[1] + Math.sin(a) * 34 * pop), 1.3 * f.k, 0.8 * pop)
    }
    glow(f, caller[0], caller[1], 46, pal.accent, 0.16 * pop)
    c.strokeStyle = rgba(pal.accent, 0.95 * pop)
    c.lineWidth = 1.5
    c.beginPath()
    c.arc(X(caller[0]), Y(caller[1] - 9), 9.5 * f.k * pop, 0, TAU)
    c.stroke()
    c.beginPath()
    c.moveTo(X(caller[0] - 16), Y(caller[1] + 17))
    c.bezierCurveTo(X(caller[0] - 13), Y(caller[1] + 5), X(caller[0] + 13), Y(caller[1] + 5), X(caller[0] + 16), Y(caller[1] + 17))
    c.stroke()
    if (t < 0.8) ring(f, caller[0], caller[1], 34 + (t / 0.8) * 16, pal.accentBright, 0.5 * (1 - t / 0.8))

    // the authorisation shield: a dotted arc of the hero's shell in front of the vault
    const shieldA = smooth(0.2, 0.7, t)
    const newest = Math.floor((t - FIRST) / EVERY)
    const hits: ReturnType<typeof strike>[] = []
    for (let n = Math.max(0, Math.ceil((t - FIRST - FLIGHT - AFTERMATH) / EVERY)); n <= newest; n++) hits.push(strike(n))
    for (let i = 0; i <= 44; i++) {
      const a = lerp(shieldFrom, shieldTo, i / 44)
      const [sx, sy] = shieldAt(a)
      let boost = 0
      for (const h of hits) {
        const age = t - h.hitAt
        if (age < 0 || age > AFTERMATH) continue
        const d = Math.abs(a - h.a) * shieldR
        boost = Math.max(boost, Math.exp(-(((d - age * 70) / 9) ** 2)) * (1 - age / AFTERMATH) + (age < 0.3 ? Math.exp(-((d / 12) ** 2)) * (1 - age / 0.3) : 0))
      }
      const idle = t > STORY_END.access ? 0.06 * (0.5 + 0.5 * Math.sin(t * 1.2 + i * 0.4)) : 0
      f.amber.add(X(sx), Y(sy), (1.1 + boost * 0.9) * f.k, (0.28 + idle + 0.7 * boost) * shieldA)
    }

    // 2 · threat packets keep striking the shield and are thrown back
    for (const h of hits) {
      const age = t - h.at
      if (age < 0) continue
      if (age < h.flight) {
        const q = age / h.flight
        const e = q * q
        const from: Vec2 = [caller[0] + 36, caller[1] + (h.pos[1] - caller[1]) * 0.15]
        const pos = (v: number): Vec2 => [lerp(from[0], h.pos[0], v), lerp(from[1], h.pos[1], v)]
        streak(f, pos(Math.max(0, e - 0.22)), pos(e), pal.threat, smooth(0, 0.25, q), 2)
      } else {
        impact(f, h.pos[0], h.pos[1], age - h.flight, pal.accentBright, pal.threat, Math.PI, 11 + h.n)
      }
    }
    // a red mark where the call was refused
    const x = smooth(1.3, 1.6, t)
    if (x > 0) {
      const s = 9 * (0.6 + 0.4 * x)
      c.strokeStyle = rgba(pal.threat, x)
      c.lineWidth = 2
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(X(282 - s), Y(124 - s))
      c.lineTo(X(282 + s), Y(124 + s))
      c.moveTo(X(282 + s), Y(124 - s))
      c.lineTo(X(282 - s), Y(124 + s))
      c.stroke()
    }

    // 3 · the vault stays closed: each strike tugs the shackle, which drops straight
    // back, and the keyhole glows calmly once the attacks are spent
    let rattle = 0
    for (const h of hits) {
      const age = t - h.hitAt
      if (age >= 0 && age < 0.22) rattle = Math.max(rattle, Math.sin((age / 0.22) * Math.PI) * 0.6)
    }
    const pulse = t > 2.3 ? Math.exp(-(((t - 2.7) / 0.35) ** 2)) * 0.7 : 0
    drawLock(f, vault[0], vault[1], 56, pulse, rattle)
  }
}

const SCENES: Record<RiskSceneKind, () => (f: Frame) => void> = {
  donation: donationScene,
  rounding: roundingScene,
  overflow: overflowScene,
  access: accessScene,
}

/* ---------------------------------------------------------------- mount */

export interface RiskSceneController {
  /** Start (or restart) the story from its first frame. */
  play(): void
  /** Stop animating; the canvas keeps its last frame. */
  stop(): void
  destroy(): void
}

/**
 * Mounts a scene on `canvas` (sized to its parent). Draws the first frame
 * immediately; with reduced motion it draws the final frame and never animates.
 */
export function mountRiskScene(canvas: HTMLCanvasElement, kind: RiskSceneKind, reducedMotion: boolean): RiskSceneController {
  const ctx = canvas.getContext('2d')
  const host = canvas.parentElement
  const noop = { play() {}, stop() {}, destroy() {} }
  if (!ctx || !host) return noop

  const draw = SCENES[kind]()
  const pal = readPalette()
  const batches = { amber: new DotBatch(pal.accent), white: new DotBatch(pal.fg), red: new DotBatch(pal.threat) }
  let width = 1
  let height = 1
  let k = 1
  let ox = 0
  let oy = 0
  let startedAt: number | null = null
  let raf = 0
  let wanted = false
  let onScreen = true

  function resize() {
    const rect = host!.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    k = Math.min(width / DESIGN_W, height / DESIGN_H)
    ox = (width - DESIGN_W * k) / 2
    oy = (height - DESIGN_H * k) / 2
  }

  function render(t: number) {
    ctx!.clearRect(0, 0, width, height)
    const frame: Frame = {
      c: ctx!,
      t,
      k,
      X: (x) => ox + x * k,
      Y: (y) => oy + y * k,
      pal,
      ...batches,
    }
    draw(frame)
    batches.white.flush(ctx!)
    batches.amber.flush(ctx!)
    batches.red.flush(ctx!)
  }

  const storyTime = () => (startedAt === null ? 0 : ((performance.now() - startedAt) / 1000) * STORY_SPEED)
  const still = () => render(reducedMotion ? STORY_END[kind] + 1 : storyTime())

  function tick() {
    raf = 0
    render(storyTime())
    if (wanted && onScreen && !document.hidden) raf = requestAnimationFrame(tick)
  }
  function run() {
    if (!raf && wanted && onScreen && !document.hidden && !reducedMotion) raf = requestAnimationFrame(tick)
  }
  function halt() {
    cancelAnimationFrame(raf)
    raf = 0
  }

  const resizeObserver = new ResizeObserver(() => {
    resize()
    still()
  })
  resizeObserver.observe(host)
  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    if (onScreen) run()
    else halt()
  })
  io.observe(host)
  const onVisibility = () => (document.hidden ? halt() : run())
  document.addEventListener('visibilitychange', onVisibility)

  resize()
  still()
  document.fonts?.ready.then(() => !raf && still())

  return {
    play() {
      startedAt = performance.now()
      wanted = true
      if (reducedMotion) still()
      else run()
    },
    stop() {
      wanted = false
      halt()
    },
    destroy() {
      halt()
      resizeObserver.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
