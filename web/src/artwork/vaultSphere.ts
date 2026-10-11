/**
 * Procedural "vault inside a protective sphere" particle illustration.
 *
 * Canvas 2D, no dependencies. All particles are generated once per quality
 * tier from a seeded PRNG and only transformed per frame, so positions are
 * stable. Dots are batched by quantised alpha so each frame issues a few
 * dozen fills instead of thousands.
 *
 * Coordinates are in sphere-radius units: +x right, +y up, +z toward viewer.
 */

type Tier = 'low' | 'high'
type Mat3 = [number, number, number, number, number, number, number, number, number]
type RGB = readonly [number, number, number]
type Vec2 = [number, number]

const TAU = Math.PI * 2
// Palette from design-reference/DESIGN.md. The accent is the only hue; the
// vault body uses text-primary.
const ACCENT: RGB = [217, 119, 6] // #D97706 primary accent
const ACCENT_BRIGHT: RGB = [232, 144, 12] // #E8900C accent hover — ring / hub highlights
const FG: RGB = [243, 244, 246] // #F3F4F6 text primary
const THREAT: RGB = [248, 113, 113] // #F87171 fail on dark canvas — incoming attacks only
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a})`
const CANVAS = rgba([12, 13, 14], 0.95) // #0C0D0E canvas base (vault occluder)
const CAMERA_DISTANCE = 6
const STATIC_TIME = 12 // frozen time used for reduced motion

// Sphere motion
const SPIN_SPEED = TAU / 52 // one revolution ≈ 52 s
const SPHERE_TILT_X = 0.36
const SPHERE_TILT_Z = 0.08
const SCAN_PERIOD = 11 // s between scan waves
const SCAN_SWEEP = 3.6 // s a scan takes to cross the sphere
const SCAN_DELAY = 1.5 // s after assembly before the first scan
const SCAN_WIDTH = 0.045 // band sigma, sphere units

// Prelude: the loose particle field is already hanging around the vault, but
// unformed, so a few packets slip through and hit it (red flash + flicker).
// The first impact triggers assembly; hits keep landing through the gaps
// while the shield closes, then strikes bounce off the finished shell.
const PRELUDE_DURATION = 0.6 // s before assembly begins: the field reacts as the first hit lands
const PRELUDE_FLIGHT = 0.6 // s a prelude packet takes to reach the vault
const VAULT_HIT_LIFE = 1 // s a hit keeps the vault flickering
const VAULT_HIT_SIGMA = 0.14 // damage spread, sphere radii (screen)

// Strikes: a red threat packet streaks in, hits the shell and is deflected.
// The shell answers in amber (ripple + flash); only the attacker is red.
// Negative: the first volley launches while the shield is still closing, so
// its impact lands just as the shell settles.
const STRIKE_FIRST = -1.4 // s relative to the sphere finishing forming (= -STRIKE_FLIGHT)
const STRIKE_GAP_MIN = 0.5 // s between volleys
const STRIKE_GAP_MAX = 1.2
const VOLLEY_MAX_HIGH = 6 // packets per volley, each from its own direction
const VOLLEY_MAX_LOW = 3
const VOLLEY_STAGGER = 0.35 // s max delay between packets in a volley
const STRIKE_MAX_HIGH = 22 // packets alive at once
const STRIKE_MAX_LOW = 9
const STRIKE_FLIGHT = 1.4 // s a packet takes to reach the shell
const STRIKE_START_DISTANCE = 2.4 // sphere radii from centre, off canvas
const STRIKE_SIZE_MIN = 0.7 // per-packet size multiplier (streak width, head, tail length)
const STRIKE_SIZE_MAX = 1.8
const STRIKE_TAIL = 0.4 // share of the flight path the tail trails behind the head
const RIPPLE_DURATION = 1.6 // s
const RIPPLE_SPEED = 0.8 // rad/s across the shell surface
const RIPPLE_WIDTH = 0.07 // rad sigma
const FLASH_DURATION = 0.5 // s
const SPARK_LIFE = 1.2 // s
const SPARKS_HIGH = 7
const SPARKS_LOW = 4
const STRIKE_AFTERMATH = Math.max(RIPPLE_DURATION, SPARK_LIFE, VAULT_HIT_LIFE) // s after impact

// Entrance: loose particles hang in irregular drifting clusters around the
// vault, then each glides along a gentle arc onto its place on the shell.
// Paths interpolate azimuth / latitude / radius with the radius kept outside
// the shell, so nothing ever cuts through the vault.
const ASSEMBLY_DURATION = 2.4 // s
const GATHER_START = 0.1 // timeline fraction the abstract field holds before moving
const GATHER_SPREAD = 0.32 // stagger across particles
const GATHER_LENGTH = 0.55 // how long each particle takes to land
const FLIGHT_CURVE = 0.35 // max sideways bow of a path, radians (zero at both ends)
const SCATTER_CLUSTERS = 7
// The loose field is present from the first frame, circling the vault
// unformed through the prelude attack until assembly gathers it. Each particle
// orbits at its own speed; its flight blends from the moving orbit onto the shell.
const FIELD_ORBIT_SPEED = 0.55 // rad/s mean orbit of the loose field (±30% per particle)

// Vault pose + float
const VAULT_YAW = -0.52
const VAULT_PITCH = 0.24
const VAULT_DROP = -0.01
const VAULT_SCALE = 1.2 // uniform size of the vault inside the sphere (sphere size unchanged)
const FLOAT_PERIOD = 7 // s
const FLOAT_AMPLITUDE = 0.028

const MAX_POINTER_YAW = 0.1
const MAX_POINTER_PITCH = 0.06

// Vault geometry: a true cube (half extent) with softly bevelled edges.
const VS = 0.4
const VR = 0.05
const SIDE_INSET = 0.055
const SIDE_INSET_RADIUS = 0.03

// Front door (radii on the front face)
const DOOR_RIM = 0.31
const RING_MID = 0.25
const GOLD_RING = 0.226
const RING_INNER = 0.155
const HUB_RADIUS = 0.044
const SPOKE_END = 0.148
const STUD_COUNT = 8

// Sphere particle kinds
const SHELL = 0
const DUST = 1
const RING = 2
const NODE = 3

// Vault particle kinds
const V_FACE = 0
const V_EDGE = 1
const V_BORDER = 2
const V_RING = 3
const V_STUD = 4
const V_SPOKE = 5
const V_DOOR = 6
const V_GOLD = 7
const V_HUB = 8

/* ------------------------------------------------------------------ math */

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

const rotX = (a: number): Mat3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [1, 0, 0, 0, c, -s, 0, s, c]
}
const rotY = (a: number): Mat3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, 0, s, 0, 1, 0, -s, 0, c]
}
const rotZ = (a: number): Mat3 => {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}
function mul(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9) as Mat3
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
    }
  }
  return o
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeInOutSine = (v: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(v))
const linspace = (from: number, to: number, step: number) => {
  const n = Math.max(1, Math.round((to - from) / step))
  const out: number[] = []
  for (let i = 0; i <= n; i++) out.push(from + ((to - from) * i) / n)
  return out
}

/** Unsigned distance from (x, y) to the outline of a centred rounded rect. */
function roundedRectDistance(x: number, y: number, hw: number, hh: number, r: number) {
  const qx = Math.abs(x) - (hw - r)
  const qy = Math.abs(y) - (hh - r)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return Math.abs(outside + Math.min(Math.max(qx, qy), 0) - r)
}

/** Evenly spaced points along a centred rounded-rect outline. */
function roundedRectOutline(hw: number, hh: number, r: number, step: number): Vec2[] {
  const out: Vec2[] = []
  const sx = hw - r
  const sy = hh - r
  const lines: [number, number, number, number][] = [
    [-sx, hh, sx, hh],
    [hw, sy, hw, -sy],
    [sx, -hh, -sx, -hh],
    [-hw, -sy, -hw, sy],
  ]
  for (const [x0, y0, x1, y1] of lines) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step))
    for (let i = 0; i < n; i++) out.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])
  }
  const corners: [number, number, number][] = [
    [sx, sy, 0],
    [-sx, sy, Math.PI / 2],
    [-sx, -sy, Math.PI],
    [sx, -sy, Math.PI * 1.5],
  ]
  const steps = Math.max(2, Math.round(((Math.PI / 2) * r) / step))
  for (const [cx, cy, start] of corners) {
    for (let i = 1; i < steps; i++) {
      const th = start + (Math.PI / 2) * (i / steps)
      out.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r])
    }
  }
  return out
}

function convexHull(points: Vec2[]): Vec2[] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Vec2[] = []
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop()
    lower.push(pt)
  }
  const upper: Vec2[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop()
    upper.push(pt)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function insideConvex(hull: Vec2[], x: number, y: number) {
  const n = hull.length
  for (let i = 0; i < n; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % n]
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false
  }
  return n > 2
}

/* --------------------------------------------------------- dot batching */

class DotBatch {
  private readonly styles: string[]
  private readonly buffers: Float32Array[]
  private readonly counts: Uint32Array
  private readonly levels: number

  constructor(rgb: RGB, levels = 24) {
    this.levels = levels
    this.styles = Array.from({ length: levels }, (_, i) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${((i + 1) / levels).toFixed(3)})`)
    this.buffers = Array.from({ length: levels }, () => new Float32Array(3 * 512))
    this.counts = new Uint32Array(levels)
  }

  add(x: number, y: number, r: number, alpha: number) {
    if (alpha < 0.02) return
    const level = Math.min(this.levels - 1, Math.max(0, Math.round(alpha * this.levels) - 1))
    const count = this.counts[level]
    let buf = this.buffers[level]
    if ((count + 1) * 3 > buf.length) {
      const grown = new Float32Array(buf.length * 2)
      grown.set(buf)
      this.buffers[level] = buf = grown
    }
    buf[count * 3] = x
    buf[count * 3 + 1] = y
    buf[count * 3 + 2] = r
    this.counts[level] = count + 1
  }

  flush(ctx: CanvasRenderingContext2D) {
    for (let l = 0; l < this.levels; l++) {
      const count = this.counts[l]
      if (!count) continue
      const buf = this.buffers[l]
      ctx.fillStyle = this.styles[l]
      ctx.beginPath()
      for (let i = 0; i < count; i++) {
        const x = buf[i * 3]
        const y = buf[i * 3 + 1]
        const r = buf[i * 3 + 2]
        if (r < 1.05) {
          ctx.rect(x - r, y - r, r * 2, r * 2)
        } else {
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, TAU)
        }
      }
      ctx.fill()
      this.counts[l] = 0
    }
  }
}

/* -------------------------------------------------------- particle data */

interface SphereData {
  count: number
  pos: Float32Array // xyz
  kind: Uint8Array
  hash: Float32Array
  phase: Float32Array
  speed: Float32Array
  amp: Float32Array
  // entrance, per particle (spherical coordinates)
  azimuth: Float32Array // final angle around the spin axis
  latitude: Float32Array // final angle above/below the equator
  scatterAngle: Float32Array // abstract start, unwrapped next to the final azimuth
  scatterLatitude: Float32Array
  scatterRadius: Float32Array
  curve: Float32Array // signed sideways bow of the flight path
  gatherDelay: Float32Array // timeline fraction when the particle starts to move
}

interface VaultData {
  count: number
  pos: Float32Array // xyz
  normal: Float32Array // xyz
  kind: Uint8Array
  tone: Float32Array // per-particle brightness multiplier
  spacing: number
}

interface Strike {
  start: number // s, global time the packet launches
  normal: [number, number, number] // shell strikes: impact direction in view space (fixed while the shell spins)
  local: [number, number, number] | null // vault strikes: hit point in vault-local space
  flight: number // s from launch to impact
  from: Vec2 // packet origin, sphere radii from centre, screen orientation (y down)
  sparks: Float32Array // per spark: angle off the outward normal, speed
  size: number // packet scale, STRIKE_SIZE_MIN..MAX
}

function buildSphere(tier: Tier, rand: () => number): SphereData {
  const dustCount = tier === 'low' ? 260 : 520
  const ringStep = tier === 'low' ? 0.06 : 0.046
  const xyz: number[] = []
  const kinds: number[] = []
  const push = (x: number, y: number, z: number, k: number) => {
    xyz.push(x, y, z)
    kinds.push(k)
  }

  // Evenly spaced shell built from latitude rows, so the surface reads as
  // ordered dotted bands that slide past each other as the sphere spins.
  const rows = tier === 'low' ? 38 : 52
  const spacing = Math.PI / rows
  for (let r = 0; r < rows; r++) {
    const polar = (r + 0.5) * spacing
    const y = Math.cos(polar)
    const ringRadius = Math.sin(polar)
    const dots = Math.max(6, Math.round((TAU * ringRadius) / spacing))
    const offset = rand() * TAU
    for (let i = 0; i < dots; i++) {
      const th = offset + (i / dots) * TAU
      push(Math.cos(th) * ringRadius, y, Math.sin(th) * ringRadius, SHELL)
    }
  }

  // Fine haze just outside the shell.
  for (let i = 0; i < dustCount; i++) {
    let x = 0
    let y = 0
    let z = 0
    let d = 0
    do {
      x = rand() * 2 - 1
      y = rand() * 2 - 1
      z = rand() * 2 - 1
      d = Math.hypot(x, y, z)
    } while (d < 0.05 || d > 1)
    const radius = 1.025 + rand() ** 2.4 * 0.08
    push((x / d) * radius, (y / d) * radius, (z / d) * radius, DUST)
  }

  // Delicate brighter arcs along a few latitudes.
  const rings: { height: number; gap: number }[] = [
    { height: 0, gap: 0 },
    { height: 0.46, gap: 0.35 },
    { height: -0.55, gap: 0.5 },
  ]
  for (const ring of rings) {
    const radius = Math.sqrt(1 - ring.height * ring.height)
    const steps = Math.round((TAU * radius) / ringStep)
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU
      // leave a few gaps so the arcs read as delicate segments, not wires
      if (ring.gap && Math.sin(a * 3 + ring.height * 7) > 1 - ring.gap * 2) continue
      const r = 1.006
      push(Math.cos(a) * radius * r, ring.height * r, Math.sin(a) * radius * r, RING)
    }
  }

  // A handful of larger beacons on the surface.
  const nodeCount = tier === 'low' ? 7 : 10
  for (let i = 0; i < nodeCount; i++) {
    const y = rand() * 1.6 - 0.8
    const th = rand() * TAU
    const r = Math.sqrt(1 - y * y)
    push(Math.cos(th) * r * 1.008, y * 1.008, Math.sin(th) * r * 1.008, NODE)
  }

  const count = kinds.length
  const data: SphereData = {
    count,
    pos: Float32Array.from(xyz),
    kind: Uint8Array.from(kinds),
    hash: new Float32Array(count),
    phase: new Float32Array(count),
    speed: new Float32Array(count),
    amp: new Float32Array(count),
    azimuth: new Float32Array(count),
    latitude: new Float32Array(count),
    scatterAngle: new Float32Array(count),
    scatterLatitude: new Float32Array(count),
    scatterRadius: new Float32Array(count),
    curve: new Float32Array(count),
    gatherDelay: new Float32Array(count),
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand())
  // Loose clusters: elongated arcs at different heights and distances.
  const clusters = Array.from({ length: SCATTER_CLUSTERS }, (_, k) => ({
    angle: (k / SCATTER_CLUSTERS) * TAU + (rand() - 0.5) * 0.8,
    radius: 1.05 + rand() * 0.8,
    y: (rand() - 0.5) * 1.1,
    slope: (rand() - 0.5) * 0.9, // tilts each wisp so they don't all lie flat
  }))
  for (let i = 0; i < count; i++) {
    const fx = data.pos[i * 3]
    const fy = data.pos[i * 3 + 1]
    const fz = data.pos[i * 3 + 2]
    const az = Math.atan2(fz, fx)
    const lat = Math.asin(Math.max(-1, Math.min(1, fy / Math.hypot(fx, fy, fz))))
    data.azimuth[i] = az
    data.latitude[i] = lat

    let sa: number
    let sr: number
    let sy: number
    if (rand() < 0.82) {
      const c = clusters[Math.floor(rand() * SCATTER_CLUSTERS)]
      // elongated along the arc, thin across it: reads as a wisp
      sa = c.angle + gauss() * 0.22
      sr = c.radius + gauss() * 0.09
      sy = c.y + gauss() * 0.06 + (sa - c.angle) * c.slope
    } else {
      sa = rand() * TAU
      sr = 0.95 + rand() * 1.1
      sy = (rand() - 0.5) * 1.5
    }
    sr = Math.max(0.9, sr)
    sy = Math.max(-0.95, Math.min(0.95, sy))
    // Unwrap so interpolating the angle never swings the long way round.
    data.scatterAngle[i] = sa + TAU * Math.round((az - sa) / TAU)
    data.scatterLatitude[i] = Math.atan2(sy, sr)
    data.scatterRadius[i] = Math.max(1.08, Math.hypot(sr, sy))
    data.curve[i] = (rand() - 0.5) * 2 * FLIGHT_CURVE
    // Mostly random, slightly equator-first, so the shell fills in organically.
    data.gatherDelay[i] = GATHER_START + GATHER_SPREAD * (0.7 * rand() + 0.3 * Math.abs(Math.sin(lat)))
    data.hash[i] = rand()
    data.phase[i] = rand() * TAU
    data.speed[i] = 0.6 + rand() * 1.4
    data.amp[i] = rand() < 0.28 ? 0.2 + rand() * 0.3 : rand() * 0.08
  }
  return data
}

function buildVault(tier: Tier, rand: () => number): VaultData {
  const s = tier === 'low' ? 0.03 : 0.02
  const xyz: number[] = []
  const nrm: number[] = []
  const kinds: number[] = []
  const tones: number[] = []
  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number, k: number, tone = 1) => {
    xyz.push(x, y, z)
    nrm.push(nx, ny, nz)
    kinds.push(k)
    // subtle per-particle variation keeps surfaces textured, not flat
    tones.push(tone * (0.92 + rand() * 0.16))
  }
  const front = (x: number, y: number, depth: number, k: number, tone = 1) =>
    push(x, y, VS + depth, 0, 0, 1, k, tone)

  const inner = VS - VR

  /* faces: front (+z), right (+x), top (+y) */
  for (const u of linspace(-inner, inner, s)) {
    for (const v of linspace(-inner, inner, s)) {
      // front: leave room for the door
      if (Math.hypot(u, v) > DOOR_RIM + s * 0.9) push(u, v, VS, 0, 0, 1, V_FACE, 0.78)
      // right: inset border, keep a clean gap either side of it
      if (roundedRectDistance(v, u, VS - SIDE_INSET, VS - SIDE_INSET, SIDE_INSET_RADIUS) > s * 0.7) {
        push(VS, u, v, 1, 0, 0, V_FACE, 0.9)
      }
      push(u, VS, v, 0, 1, 0, V_FACE, 1)
    }
  }
  for (const [z, y] of roundedRectOutline(VS - SIDE_INSET, VS - SIDE_INSET, SIDE_INSET_RADIUS, s * 0.8)) {
    push(VS + 0.001, y, z, 1, 0, 0, V_BORDER)
  }

  /* softly bevelled edges: quarter cylinders around each of the 12 edges */
  const arcSteps = Math.max(3, Math.round(((Math.PI / 2) * VR) / (s * 0.75)))
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3
    const c = (a + 2) % 3
    for (const sb of [-1, 1]) {
      for (const sc of [-1, 1]) {
        for (const ua of linspace(-inner, inner, s)) {
          for (let k = 1; k < arcSteps; k++) {
            const th = (k / arcSteps) * (Math.PI / 2)
            const n = [0, 0, 0]
            n[b] = sb * Math.cos(th)
            n[c] = sc * Math.sin(th)
            const p = [0, 0, 0]
            p[a] = ua
            p[b] = sb * inner + VR * n[b]
            p[c] = sc * inner + VR * n[c]
            push(p[0], p[1], p[2], n[0], n[1], n[2], V_EDGE)
          }
        }
      }
    }
  }
  /* rounded corners: octant of a small sphere */
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let i = 1; i < arcSteps; i++) {
          const polar = (i / arcSteps) * (Math.PI / 2)
          const ringSteps = Math.max(1, Math.round(arcSteps * Math.sin(polar)))
          for (let j = 0; j <= ringSteps; j++) {
            const az = (j / ringSteps) * (Math.PI / 2)
            const nx = Math.sin(polar) * Math.cos(az)
            const ny = Math.sin(polar) * Math.sin(az)
            const nz = Math.cos(polar)
            push(sx * (inner + VR * nx), sy * (inner + VR * ny), sz * (inner + VR * nz), sx * nx, sy * ny, sz * nz, V_EDGE)
          }
        }
      }
    }
  }

  /* circular door */
  const circle = (r: number, step: number, depth: number, k: number, tone = 1, offset = 0) => {
    const n = Math.max(8, Math.round((TAU * r) / step))
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * TAU
      front(Math.cos(a) * r, Math.sin(a) * r, depth, k, tone)
    }
  }
  // Concentric textured bands; each sits a little deeper than the last.
  const band = (r0: number, r1: number, depth: number, tone: number) => {
    for (let r = r0; r <= r1 + 1e-6; r += s) circle(r, s, depth, V_DOOR, tone, r * 11)
  }

  // Ring 1 – outer rim, with a recessed gap just inside it.
  circle(DOOR_RIM, s * 0.55, 0.004, V_RING)
  circle(DOOR_RIM - s * 0.75, s * 0.6, 0.004, V_RING, 0.7)
  band(RING_MID + s * 0.9, DOOR_RIM - s * 1.9, -0.002, 0.85)
  // a few restrained studs on the rim band
  for (let i = 0; i < STUD_COUNT; i++) {
    const a = (i / STUD_COUNT) * TAU + Math.PI / STUD_COUNT
    const r = (RING_MID + DOOR_RIM) / 2
    front(Math.cos(a) * r, Math.sin(a) * r, 0.003, V_STUD)
  }

  // Ring 2 – middle ring followed by the narrow gold accent.
  circle(RING_MID, s * 0.55, -0.004, V_RING, 0.9)
  circle(GOLD_RING, s * 0.62, -0.006, V_GOLD)
  band(RING_INNER + s * 0.9, GOLD_RING - s * 1.1, -0.008, 0.66)

  // Ring 3 – inner ring around the deepest recess.
  circle(RING_INNER, s * 0.55, -0.01, V_RING, 0.85)
  band(HUB_RADIUS + s * 1.4, RING_INNER - s * 1.1, -0.014, 0.5)

  // Hub: gold core with a white collar.
  front(0, 0, 0.012, V_HUB)
  for (let r = s * 0.5; r <= HUB_RADIUS - s * 0.4; r += s * 0.5) circle(r, s * 0.5, 0.012, V_HUB)
  circle(HUB_RADIUS + s * 0.45, s * 0.5, 0.01, V_RING, 0.95)

  // Three radial locking spokes, raised slightly above the door.
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i / 3) * TAU
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    for (let r = HUB_RADIUS + s * 1.2; r <= SPOKE_END; r += s * 0.45) {
      for (const w of [-0.008, 0, 0.008]) front(ca * r - sa * w, sa * r + ca * w, 0.016, V_SPOKE)
    }
    front(ca * (SPOKE_END + s * 0.4), sa * (SPOKE_END + s * 0.4), 0.018, V_STUD)
  }

  const count = kinds.length
  return {
    count,
    pos: Float32Array.from(xyz),
    normal: Float32Array.from(nrm),
    kind: Uint8Array.from(kinds),
    tone: Float32Array.from(tones),
    spacing: s,
  }
}

function buildSparks(rand: () => number) {
  const sparks = new Float32Array(SPARKS_HIGH * 2)
  for (let i = 0; i < SPARKS_HIGH; i++) {
    sparks[i * 2] = (rand() - 0.5) * 2.6
    sparks[i * 2 + 1] = 0.5 + rand() * 0.7
  }
  return sparks
}

const strikeSize = (rand: () => number) => STRIKE_SIZE_MIN + rand() ** 2 * (STRIKE_SIZE_MAX - STRIKE_SIZE_MIN)

const strikeOrigin = (approach: number): Vec2 => [
  Math.cos(approach) * STRIKE_START_DISTANCE,
  -Math.sin(approach) * STRIKE_START_DISTANCE,
]

function buildStrike(start: number, theta: number, rand: () => number): Strike {
  const nz = -0.1 + rand() * 0.45
  const ring = Math.sqrt(1 - nz * nz)
  const approach = theta + (rand() - 0.5) * 0.5
  return {
    start,
    normal: [Math.cos(theta) * ring, Math.sin(theta) * ring, nz],
    local: null,
    flight: STRIKE_FLIGHT,
    from: strikeOrigin(approach),
    sparks: buildSparks(rand),
    size: strikeSize(rand),
  }
}

// Prelude hits on the faces the camera sees: the door face (+z), the right
// side (+x) and the top (+y), each approached from its own direction.
const PRELUDE_HITS: { delay: number; face: 'front' | 'side' | 'top'; approach: number }[] = [
  { delay: 0, face: 'front', approach: Math.PI + 0.25 },
  { delay: 0.3, face: 'side', approach: -0.3 },
  { delay: 0.6, face: 'top', approach: Math.PI / 2 + 0.45 },
  // keep coming while the shield closes, until deflected strikes take over
  { delay: 0.95, face: 'front', approach: Math.PI - 0.5 },
  { delay: 1.3, face: 'side', approach: 0.35 },
  { delay: 1.65, face: 'top', approach: Math.PI / 2 - 0.4 },
  { delay: 2.0, face: 'front', approach: Math.PI + 0.7 },
]

function buildVaultStrike(start: number, face: 'front' | 'side' | 'top', approach: number, rand: () => number): Strike {
  const u = (rand() - 0.5) * 0.5
  const v = (rand() - 0.5) * 0.5
  const local: [number, number, number] = face === 'front' ? [u, v, VS] : face === 'side' ? [VS, v, u] : [u, VS, v]
  return { start, normal: [0, 0, 1], local, flight: PRELUDE_FLIGHT, from: strikeOrigin(approach + (rand() - 0.5) * 0.3), sparks: buildSparks(rand), size: strikeSize(rand) }
}


/** Initial quality guess from device hints; refined at runtime by frame timing. */
function detectTier(width: number, finePointer: boolean): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const fewCores = (nav.hardwareConcurrency ?? 8) <= 4
  const lowMemory = (nav.deviceMemory ?? 8) <= 4
  return width < 640 || !finePointer || fewCores || lowMemory ? 'low' : 'high'
}

/* ---------------------------------------------------------------- mount */

/**
 * Mounts the artwork on a canvas. Sizing follows the canvas' parent element.
 * Returns a cleanup function that cancels frames and removes all listeners.
 */
/** Sphere centre and radius (px) inside a host of the given size. */
function sphereLayout(width: number, height: number) {
  const radius = Math.min(width * 0.4, height * 0.41)
  return { cx: width / 2, cy: height / 2, radius }
}

export function mountVaultSphere(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d', { alpha: true })
  const host = canvas.parentElement
  if (!ctx || !host) return () => {}

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)')

  const backBatch = new DotBatch(ACCENT)
  const frontBatch = new DotBatch(ACCENT)
  const vaultBatch = new DotBatch(FG)
  const goldBatch = new DotBatch(ACCENT_BRIGHT, 16)
  const vaultHitBatch = new DotBatch(THREAT, 16)
  const strikeRand = mulberry32(31)
  let strikes: Strike[] = []
  let nextStrikeAt: number | null = null

  let tier: Tier | null = null
  let downgraded = false // set once if frame timing shows the device struggling
  let limbDots = new Float32Array(0) // angle, radius factor, phase
  let sphere: SphereData | null = null
  let vault: VaultData | null = null
  let width = 0
  let height = 0
  let glow: CanvasGradient | null = null

  let time = 0
  let lastTimestamp: number | null = null
  let raf = 0
  let inView = true
  let pageVisible = document.visibilityState !== 'hidden'
  let reducedMotion = reducedMotionQuery.matches
  let slowFrames = 0
  // Assembly clock starts on the first animated frame (i.e. first time in view).
  let assemblyStart: number | null = null
  let skipAssembly = reducedMotion
  let sampledFrames = 0

  const pointerTarget = { x: 0, y: 0 }
  const pointer = { x: 0, y: 0 }

  const vaultCorners: Vec2[] = Array.from({ length: 8 }, () => [0, 0] as Vec2)

  function applyTier(next: Tier) {
    if (next === tier) return
    tier = next
    // Same seeds every time: identical constellation per tier.
    sphere = buildSphere(tier, mulberry32(1337))
    vault = buildVault(tier, mulberry32(4242))
    const limbRand = mulberry32(99)
    const limbCount = tier === 'low' ? 420 : 720
    limbDots = new Float32Array(limbCount * 3)
    for (let i = 0; i < limbCount; i++) {
      limbDots[i * 3] = (i / limbCount) * TAU + (limbRand() - 0.5) * 0.004
      limbDots[i * 3 + 1] = 1 - limbRand() ** 1.6 * 0.06
      limbDots[i * 3 + 2] = limbRand() * TAU
    }
  }

  function resize() {
    const rect = host!.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    const nextTier = downgraded ? 'low' : detectTier(width, finePointerQuery.matches)
    const dpr = Math.min(window.devicePixelRatio || 1, nextTier === 'low' ? 1.5 : 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    applyTier(nextTier)
    glow = null
    draw()
  }

  const layout = () => sphereLayout(width, height)

  function draw() {
    if (!sphere || !vault) return
    const c = ctx!
    const t = reducedMotion ? STATIC_TIME : time
    // negative during the prelude, so the shell (and its rim / glow) stays hidden
    const sinceStart = assemblyStart === null ? (skipAssembly ? Infinity : 0) : time - assemblyStart - PRELUDE_DURATION
    const formation = reducedMotion ? 1 : clamp01(sinceStart / ASSEMBLY_DURATION)
    const assembling = formation < 1
    const settled = smoothstep(0.75, 1, formation) // rim, glow and float ease in at the end
    const sinceFormed = reducedMotion ? -1 : sinceStart - ASSEMBLY_DURATION - SCAN_DELAY
    // s since the loose field began (prelude included); 0 before the timeline starts
    const sinceField = assemblyStart === null ? 0 : Math.max(0, sinceStart + PRELUDE_DURATION)
    const { cx, cy, radius: R } = layout()
    c.clearRect(0, 0, width, height)

    const camera = mul(rotX(pointer.y * MAX_POINTER_PITCH), rotY(pointer.x * MAX_POINTER_YAW))
    const sphereMatrix = mul(camera, mul(mul(rotZ(SPHERE_TILT_Z), rotX(SPHERE_TILT_X)), rotY(t * SPIN_SPEED)))
    const vaultMatrix = mul(camera, mul(rotX(VAULT_PITCH), rotY(VAULT_YAW)))
    const lift = VAULT_DROP + (reducedMotion ? 0 : settled * FLOAT_AMPLITUDE * Math.sin((TAU * t) / FLOAT_PERIOD))
    const unit = R / 240 // scale factor relative to the reference size
    const shift = { x: pointer.x * 6 * unit, y: pointer.y * 4 * unit }

    // Scan band: a narrow horizontal band sweeping top → bottom, then resting.
    const scanPhase = (Math.max(0, sinceFormed) % SCAN_PERIOD) / SCAN_SWEEP
    const scanActive = sinceFormed > 0 && scanPhase < 1
    const scanY = 1.15 - 2.3 * scanPhase
    const scanBoost = (y: number) => {
      if (!scanActive) return 0
      const d = (y - scanY) / SCAN_WIDTH
      return d > 4 || d < -4 ? 0 : Math.exp(-0.5 * d * d)
    }
    // The door's gold ring brightens as the band passes over it.
    const doorPulse = scanActive ? Math.exp(-0.5 * ((scanY - lift) / 0.16) ** 2) : 0

    // Shell response to strikes that have landed: an amber ring spreading from
    // the impact point plus a brief hot spot. Angles are on the unit sphere.
    const impacts: { nx: number; ny: number; nz: number; front: number; fade: number; flash: number; minCos: number }[] = []
    if (!reducedMotion) {
      for (const s of strikes) {
        if (s.local) continue
        const age = time - s.start - s.flight
        if (age < 0 || age > RIPPLE_DURATION) continue
        const front = age * RIPPLE_SPEED
        const flash = age < FLASH_DURATION ? 1 - age / FLASH_DURATION : 0
        const [nx, ny, nz] = s.normal
        const reach = Math.max(front + 4 * RIPPLE_WIDTH, flash > 0 ? 0.36 : 0)
        impacts.push({ nx, ny, nz, front, fade: (1 - age / RIPPLE_DURATION) ** 1.5, flash, minCos: Math.cos(Math.min(Math.PI, reach)) })
      }
    }
    const impactBoost = (x: number, y: number, z: number) => {
      let boost = 0
      for (const im of impacts) {
        const cosA = x * im.nx + y * im.ny + z * im.nz
        if (cosA < im.minCos) continue
        const a = Math.acos(Math.min(1, cosA))
        const d = (a - im.front) / RIPPLE_WIDTH
        boost += Math.exp(-0.5 * d * d) * im.fade + im.flash * Math.exp(-0.5 * (a / 0.12) ** 2)
      }
      return boost > 1 ? 1 : boost
    }

    const project = (x: number, y: number, z: number, out: Vec2) => {
      const k = CAMERA_DISTANCE / (CAMERA_DISTANCE - z)
      out[0] = cx + x * k * R
      out[1] = cy - y * k * R
      return k
    }

    /* vault silhouette (used for occlusion and front-particle thinning) */
    const vm = vaultMatrix // rotation only: used for normals
    const vp = vm.map((v) => v * VAULT_SCALE) as Mat3 // positions
    let ci = 0
    const e = VS - VR * 0.3
    for (const sx of [-e, e]) {
      for (const sy of [-e, e]) {
        for (const sz of [-e, e]) {
          project(
            vp[0] * sx + vp[1] * sy + vp[2] * sz,
            vp[3] * sx + vp[4] * sy + vp[5] * sz + lift,
            vp[6] * sx + vp[7] * sy + vp[8] * sz,
            vaultCorners[ci++],
          )
        }
      }
    }
    const hull = convexHull(vaultCorners)

    /* sphere particles */
    const sm = sphereMatrix
    const sp = sphere
    const baseSize = Math.min(1.6, Math.max(0.7, 1.05 * unit))
    const tmp: Vec2 = [0, 0]
    for (let i = 0; i < sp.count; i++) {
      let lx = sp.pos[i * 3]
      let ly = sp.pos[i * 3 + 1]
      let lz = sp.pos[i * 3 + 2]
      let appear = 1
      let orbiting = 0 // 1 while in flight, 0 once settled on the shell
      if (assembling) {
        const g = smoothstep(sp.gatherDelay[i], sp.gatherDelay[i] + GATHER_LENGTH, formation)
        const e = easeInOutSine(g)
        const finalRadius = Math.hypot(lx, ly, lz)
        // the loose field circles the vault; each flight starts from where its
        // particle currently is on that orbit, so nothing unwinds backwards
        const orbitSpeed = FIELD_ORBIT_SPEED * (0.7 + 0.6 * sp.hash[i])
        const orbitAz = sp.scatterAngle[i] + orbitSpeed * sinceField
        // target unwrapped once, against the orbit position at launch
        const launchAz = sp.scatterAngle[i] + orbitSpeed * (PRELUDE_DURATION + sp.gatherDelay[i] * ASSEMBLY_DURATION)
        const targetAz = sp.azimuth[i] + TAU * Math.round((launchAz - sp.azimuth[i]) / TAU)
        const az = orbitAz + (targetAz - orbitAz) * e + sp.curve[i] * Math.sin(Math.PI * e)
        const lat = sp.scatterLatitude[i] + (sp.latitude[i] - sp.scatterLatitude[i]) * e
        const radius = sp.scatterRadius[i] + (finalRadius - sp.scatterRadius[i]) * e
        const ring = Math.cos(lat) * radius
        lx = Math.cos(az) * ring
        ly = Math.sin(lat) * radius
        lz = Math.sin(az) * ring
        appear = 0.9 + 0.1 * e
        orbiting = 1 - smoothstep(0.5, 1, g)
      }
      const x = sm[0] * lx + sm[1] * ly + sm[2] * lz
      const y = sm[3] * lx + sm[4] * ly + sm[5] * lz
      const z = sm[6] * lx + sm[7] * ly + sm[8] * lz
      const k = project(x, y, z, tmp)
      const depth = clamp01((z + 1) / 2)
      const limb = 1 - Math.min(1, Math.abs(z))
      const kind = sp.kind[i]

      let alpha: number
      let size: number
      if (kind === DUST) {
        alpha = 0.06 + 0.2 * depth
        size = baseSize * 0.55
      } else if (kind === NODE) {
        alpha = z > 0 ? 0.55 - 0.25 * z : 0.3 + 0.25 * depth
        size = baseSize * 2.3
      } else {
        // Bright rim, quiet interior; the near hemisphere is the dimmest so
        // the vault reads clearly through it.
        alpha = (0.2 + 0.68 * limb ** 4) * (z > 0 ? 1 - 0.6 * z : 1)
        size = baseSize * (0.6 + 0.4 * depth)
        if (kind === RING) {
          alpha = alpha * 1.3 + 0.12
          size *= 1.45
        }
      }
      if (orbiting > 0 && kind !== NODE) {
        // particles in flight glow a little brighter; still dimmer in front
        alpha += (0.65 * (z > 0 ? 1 - 0.35 * z : 1) - alpha) * orbiting
      }
      const shimmer = 1 - sp.amp[i] * (0.5 + 0.5 * Math.sin(t * sp.speed[i] + sp.phase[i]))
      const scan = kind === DUST ? 0 : scanBoost(y)
      const hit = kind === DUST || !impacts.length ? 0 : impactBoost(x, y, z)
      alpha = clamp01((alpha * shimmer + scan * (0.3 + 0.2 * depth) + hit * 0.5) * appear)
      size *= k * (1 + 0.35 * scan + 0.45 * hit)

      const front = z > 0.02
      if (front && insideConvex(hull, tmp[0], tmp[1])) {
        // keep the sphere translucent where it crosses the vault
        // (particles in flight pass clearly in front, then thin out
        // smoothly as they settle onto the shell)
        if (kind === DUST) continue
        if (kind === SHELL) {
          if (sp.hash[i] < 0.78) {
            alpha *= 0.8 * smoothstep(0.1, 0.6, orbiting)
            if (alpha < 0.02) continue
          } else {
            alpha *= 0.3 + 0.5 * orbiting
          }
        } else {
          alpha *= 0.5 + 0.3 * orbiting
        }
      }
      ;(front ? frontBatch : backBatch).add(tmp[0], tmp[1], size, alpha)
    }

    // Silhouette band. A sphere's outline is view-independent, so these dots
    // live in screen space; they drift slowly so the rim keeps shimmering.
    const limbRadius = (R * CAMERA_DISTANCE) / Math.sqrt(CAMERA_DISTANCE * CAMERA_DISTANCE - 1)
    const limbCount = limbDots.length / 3
    for (let i = 0; i < limbCount; i++) {
      const a = limbDots[i * 3] + t * 0.035
      const r = limbRadius * limbDots[i * 3 + 1]
      const ph = limbDots[i * 3 + 2]
      const flicker = 0.78 + 0.22 * Math.sin(t * 1.3 + ph)
      const scan = scanBoost((-Math.sin(a) * r) / R)
      const hit = impacts.length ? impactBoost(Math.cos(a), -Math.sin(a), 0) : 0
      const alpha = ((0.95 - (1 - limbDots[i * 3 + 1]) * 9) * flicker + scan * 0.3 + hit * 0.4) * settled
      backBatch.add(cx + Math.cos(a) * r, cy + Math.sin(a) * r, baseSize * 0.95 * (1 + 0.3 * scan + 0.5 * hit), alpha)
    }

    backBatch.flush(c)

    /* minimal glow hugging the rim */
    if (!glow) {
      glow = c.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.12)
      glow.addColorStop(0, rgba(ACCENT, 0))
      glow.addColorStop(0.35, rgba(ACCENT, 0.06))
      glow.addColorStop(1, rgba(ACCENT, 0))
    }
    c.globalAlpha = settled
    c.fillStyle = glow
    c.beginPath()
    c.arc(cx, cy, R * 1.12, 0, TAU)
    c.fill()
    c.globalAlpha = 1

    /* strikes: packet in flight, then impact flash and deflected sparks */
    const sparkCount = tier === 'low' ? SPARKS_LOW : SPARKS_HIGH
    const strikeTarget = (s: Strike, out: Vec2) => {
      if (s.local) {
        const [lx, ly, lz] = s.local
        project(vp[0] * lx + vp[1] * ly + vp[2] * lz, vp[3] * lx + vp[4] * ly + vp[5] * lz + lift, vp[6] * lx + vp[7] * ly + vp[8] * lz, out)
      } else {
        project(s.normal[0], s.normal[1], s.normal[2], out)
      }
      return out
    }
    const drawPacket = (ox: number, oy: number, hx0: number, hy0: number, p: number, size: number) => {
      // accelerating streak with a fading tail; bigger packets trail longer
      const at = (q: number) => {
        const e = q * q
        return [ox + (hx0 - ox) * e, oy + (hy0 - oy) * e] as Vec2
      }
      const appear = smoothstep(0, 0.25, p)
      const [hx, hy] = at(p)
      const [tx, ty] = at(Math.max(0, p - STRIKE_TAIL * Math.min(1.25, size)))
      const tail = c.createLinearGradient(tx, ty, hx, hy)
      tail.addColorStop(0, rgba(THREAT, 0))
      tail.addColorStop(1, rgba(THREAT, 0.8 * appear))
      c.strokeStyle = tail
      c.lineWidth = Math.max(1, 2 * size * unit)
      c.lineCap = 'round'
      c.beginPath()
      c.moveTo(tx, ty)
      c.lineTo(hx, hy)
      c.stroke()
      c.fillStyle = rgba(THREAT, 0.22 * appear)
      c.beginPath()
      c.arc(hx, hy, 6 * size * unit, 0, TAU)
      c.fill()
      c.fillStyle = rgba(THREAT, 0.95 * appear)
      c.beginPath()
      c.arc(hx, hy, 2.4 * size * unit, 0, TAU)
      c.fill()
    }
    const drawFlash = (x: number, y: number, impactAge: number, rgb: RGB) => {
      if (impactAge >= FLASH_DURATION) return
      const f = 1 - impactAge / FLASH_DURATION
      const flashR = (10 + 10 * (1 - f)) * unit
      const flash = c.createRadialGradient(x, y, 0, x, y, flashR)
      flash.addColorStop(0, rgba(rgb, 0.45 * f))
      flash.addColorStop(1, rgba(rgb, 0))
      c.fillStyle = flash
      c.beginPath()
      c.arc(x, y, flashR, 0, TAU)
      c.fill()
    }
    const drawSparks = (x: number, y: number, out: number, sparks: Float32Array, impactAge: number) => {
      if (impactAge >= SPARK_LIFE) return
      const p = impactAge / SPARK_LIFE
      const travel = (1 - (1 - p) ** 2) * 0.22 * R
      const r = (1.5 - p) * unit
      c.fillStyle = rgba(THREAT, 0.85 * (1 - p) ** 1.5)
      c.beginPath()
      for (let i = 0; i < sparkCount; i++) {
        const dir = out + sparks[i * 2]
        const dist = travel * sparks[i * 2 + 1]
        const sx = x + Math.cos(dir) * dist
        const sy = y + Math.sin(dir) * dist
        c.moveTo(sx + r, sy)
        c.arc(sx, sy, r, 0, TAU)
      }
      c.fill()
    }
    const drawStrikes = (onVault: boolean) => {
      if (reducedMotion) return
      const hit: Vec2 = [0, 0]
      for (const s of strikes) {
        if (!!s.local !== onVault) continue
        const age = time - s.start
        if (age < 0) continue // later packet of a volley, not launched yet
        strikeTarget(s, hit)
        const ox = cx + s.from[0] * R
        const oy = cy + s.from[1] * R
        if (age < s.flight) {
          drawPacket(ox, oy, hit[0], hit[1], age / s.flight, s.size)
          continue
        }
        const impactAge = age - s.flight
        // the shell glows amber where it holds; the bare vault flashes red
        drawFlash(hit[0], hit[1], impactAge, onVault ? THREAT : ACCENT_BRIGHT)
        // shell: sparks fan outward; vault: they kick back toward the attacker
        const out = onVault ? Math.atan2(oy - hit[1], ox - hit[0]) : Math.atan2(hit[1] - cy, hit[0] - cx)
        drawSparks(hit[0], hit[1], out, s.sparks, impactAge)
      }
    }
    drawStrikes(false)

    // Damage on the bare vault: screen-space hit points with a quick-rise,
    // slow-decay envelope. Empty once the prelude is over.
    const vaultHits: { x: number; y: number; env: number }[] = []
    let vaultHitPeak = 0
    if (!reducedMotion) {
      for (const s of strikes) {
        if (!s.local) continue
        const ia = time - s.start - s.flight
        if (ia < 0 || ia > VAULT_HIT_LIFE) continue
        const env = Math.min(1, ia / 0.08) * (1 - ia / VAULT_HIT_LIFE) ** 1.5
        const [x, y] = strikeTarget(s, [0, 0])
        vaultHits.push({ x, y, env })
        vaultHitPeak = Math.max(vaultHitPeak, env)
      }
    }
    const hitSigma2 = 2 * (VAULT_HIT_SIGMA * R) ** 2
    const doorFlicker = vaultHitPeak * (0.6 + 0.4 * Math.sin(time * 38))

    /* vault body occluder */
    c.save()
    c.fillStyle = CANVAS
    c.strokeStyle = CANVAS
    c.lineJoin = 'round'
    c.lineWidth = VR * 0.6 * R
    c.beginPath()
    hull.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)))
    c.closePath()
    c.fill()
    c.stroke()
    c.restore()

    /* vault particles */
    const vt = vault
    const dotR = Math.max(0.5, vt.spacing * R * 0.15 * VAULT_SCALE)
    // light from upper right, toward the viewer
    const L: [number, number, number] = [0.3, 0.78, 0.55]
    for (let i = 0; i < vt.count; i++) {
      const nx0 = vt.normal[i * 3]
      const ny0 = vt.normal[i * 3 + 1]
      const nz0 = vt.normal[i * 3 + 2]
      const nz = vm[6] * nx0 + vm[7] * ny0 + vm[8] * nz0
      if (nz < -0.05) continue
      const nx = vm[0] * nx0 + vm[1] * ny0 + vm[2] * nz0
      const ny = vm[3] * nx0 + vm[4] * ny0 + vm[5] * nz0
      const lx = vt.pos[i * 3]
      const ly = vt.pos[i * 3 + 1]
      const lz = vt.pos[i * 3 + 2]
      const z = vp[6] * lx + vp[7] * ly + vp[8] * lz
      const k = project(vp[0] * lx + vp[1] * ly + vp[2] * lz, vp[3] * lx + vp[4] * ly + vp[5] * lz + lift, z, tmp)

      let damage = 0
      if (vaultHits.length) {
        for (const h of vaultHits) {
          damage += h.env * Math.exp(-((tmp[0] - h.x) ** 2 + (tmp[1] - h.y) ** 2) / hitSigma2)
        }
        if (damage > 0.02) {
          damage = Math.min(1, damage) * (0.6 + 0.4 * Math.sin(time * 45 + i * 12.99))
          tmp[0] += Math.sin(time * 53 + i * 7.31) * damage * 1.5 * unit
          tmp[1] += Math.cos(time * 47 + i * 3.17) * damage * 1.5 * unit
        } else {
          damage = 0
        }
      }

      const kind = vt.kind[i]
      const tone = vt.tone[i]
      if (kind === V_GOLD || kind === V_HUB) {
        const alpha = clamp01(((kind === V_HUB ? 0.85 : 0.5) + 0.32 * doorPulse) * tone)
        const r = dotR * k * (kind === V_HUB ? 1.4 : 1.05) * (1 + 0.1 * doorPulse)
        const red = Math.max(damage, doorFlicker)
        goldBatch.add(tmp[0], tmp[1], r, alpha * (1 - 0.5 * red))
        if (red > 0) vaultHitBatch.add(tmp[0], tmp[1], r, alpha * red)
        continue
      }

      const lit = 0.45 + 0.55 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2])
      const facing = smoothstep(-0.05, 0.3, nz)
      const depthFade = 0.82 + 0.18 * clamp01((z + 0.7) / 1.4)
      let alpha = lit * facing * depthFade * tone
      let size = dotR
      switch (kind) {
        case V_EDGE:
          alpha = alpha * 1.3 + 0.05
          size *= 1.08
          break
        case V_BORDER:
          alpha = alpha * 1.05 + 0.05
          break
        case V_RING:
          alpha = alpha * 1.25 + 0.18
          size *= 1.12
          break
        case V_STUD:
          alpha = 0.55 + 0.35 * lit
          size *= 2
          break
        case V_SPOKE:
          alpha = alpha * 1.2 + 0.25
          size *= 1.15
          break
        case V_DOOR:
          alpha *= 0.95
          break
        default:
          alpha *= 0.82
      }
      alpha = clamp01(alpha)
      vaultBatch.add(tmp[0], tmp[1], size * k, damage ? alpha * (1 - 0.7 * damage) : alpha)
      if (damage) vaultHitBatch.add(tmp[0], tmp[1], size * k, alpha * damage)
    }
    vaultBatch.flush(c)
    goldBatch.flush(c)
    vaultHitBatch.flush(c)
    drawStrikes(true)

    frontBatch.flush(c)
  }

  function frame(timestamp: number) {
    raf = 0
    const dt = lastTimestamp === null ? 0 : Math.min(0.05, (timestamp - lastTimestamp) / 1000)
    lastTimestamp = timestamp
    time += dt
    if (assemblyStart === null) {
      assemblyStart = skipAssembly ? time - PRELUDE_DURATION - ASSEMBLY_DURATION : time
      if (!skipAssembly) {
        for (const h of PRELUDE_HITS) strikes.push(buildVaultStrike(time + h.delay, h.face, h.approach, strikeRand))
      }
    }
    const ease = 1 - Math.exp(-dt * 3)
    pointer.x += (pointerTarget.x - pointer.x) * ease
    pointer.y += (pointerTarget.y - pointer.y) * ease

    // Strike schedule: retire finished strikes, launch the next on its timer.
    strikes = strikes.filter((s) => time - s.start < s.flight + STRIKE_AFTERMATH)
    const sinceFormed = time - assemblyStart - PRELUDE_DURATION - ASSEMBLY_DURATION
    if (sinceFormed > STRIKE_FIRST) {
      if (nextStrikeAt === null) nextStrikeAt = time
      const maxAlive = tier === 'low' ? STRIKE_MAX_LOW : STRIKE_MAX_HIGH
      // prelude vault hits are pre-scheduled, so only shell strikes count toward the cap
      const alive = strikes.reduce((n, s) => n + (s.local === null ? 1 : 0), 0)
      if (time >= nextStrikeAt && alive < maxAlive) {
        // A volley: several packets, staggered, spread around the rim so the
        // impacts don't overlap. Any direction: flanks, top and bottom alike.
        const volleyMax = Math.min(tier === 'low' ? VOLLEY_MAX_LOW : VOLLEY_MAX_HIGH, maxAlive - alive)
        const count = 1 + Math.floor(strikeRand() * volleyMax)
        let theta = strikeRand() * TAU
        for (let i = 0; i < count; i++) {
          const delay = i === 0 ? 0 : strikeRand() * VOLLEY_STAGGER * i
          strikes.push(buildStrike(time + delay, theta, strikeRand))
          theta += TAU / count + (strikeRand() - 0.5) * 0.6
        }
        nextStrikeAt = time + STRIKE_GAP_MIN + strikeRand() * (STRIKE_GAP_MAX - STRIKE_GAP_MIN)
      }
    }

    const started = performance.now()
    draw()
    // If drawing alone regularly blows the frame budget, drop to the light tier once.
    if (tier === 'high' && !downgraded) {
      sampledFrames++
      if (performance.now() - started > 12) slowFrames++
      if (sampledFrames >= 90) {
        if (slowFrames > 45) {
          downgraded = true
          resize()
        }
        sampledFrames = slowFrames = 0
      }
    }
    schedule()
  }

  function schedule() {
    const shouldRun = inView && pageVisible && !reducedMotion
    if (shouldRun && !raf) {
      raf = requestAnimationFrame(frame)
    } else if (!shouldRun && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    if (!shouldRun) lastTimestamp = null
  }

  /* listeners */
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      inView = entries.some((e) => e.isIntersecting)
      schedule()
    },
    { rootMargin: '64px' },
  )
  intersectionObserver.observe(canvas)

  const onVisibility = () => {
    pageVisible = document.visibilityState !== 'hidden'
    schedule()
  }
  document.addEventListener('visibilitychange', onVisibility)

  const onReducedMotion = () => {
    reducedMotion = reducedMotionQuery.matches
    if (reducedMotion) {
      skipAssembly = true
      strikes = []
      pointer.x = pointer.y = pointerTarget.x = pointerTarget.y = 0
    }
    draw()
    schedule()
  }
  reducedMotionQuery.addEventListener('change', onReducedMotion)

  const onPointerMove = (event: PointerEvent) => {
    if (reducedMotion || event.pointerType !== 'mouse' || !finePointerQuery.matches) return
    const rect = canvas.getBoundingClientRect()
    const nx = ((event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2)) * 1.2
    const ny = ((event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2)) * 1.2
    pointerTarget.x = Math.max(-1, Math.min(1, nx))
    pointerTarget.y = Math.max(-1, Math.min(1, ny))
  }
  const onPointerLeave = () => {
    pointerTarget.x = 0
    pointerTarget.y = 0
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onPointerLeave)

  resize()
  schedule()

  return () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    resizeObserver.disconnect()
    intersectionObserver.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    reducedMotionQuery.removeEventListener('change', onReducedMotion)
    window.removeEventListener('pointermove', onPointerMove)
    document.documentElement.removeEventListener('pointerleave', onPointerLeave)
  }
}
