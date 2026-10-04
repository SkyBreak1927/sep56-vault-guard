// Hero node network: the static mesh layout plus the animated "chains" drawn on top.
// The layout comes from a fixed seed, so server and client agree on it.

export const NETWORK_W = 1600
export const NETWORK_H = 900
const COLS = 16
const ROWS = 9
const NEIGHBOURS = 3 // links per node, to its nearest neighbours

// Palette from design-reference/DESIGN.md
const ACCENT = '217,119,6' // #D97706
const ACCENT_BRIGHT = '232,144,12' // #E8900C

// Chains: a packet hops along links and leaves a lit chain behind it.
const HOP_DURATION = 0.8 // s per link
const HOPS_MIN = 4
const HOPS_MAX = 7
const SPAWN_EVERY = 2.2 // s between new chains
const MAX_CHAINS = 3
const HOLD = 1.2 // s a finished chain stays lit
const FADE = 1.6 // s to fade back into the mesh
const CONFIRM = 0.7 // s of the ring pulse when a block lands on a node
// Opacities: kept low so chains read as part of the background, not on top of it
const LINK_ALPHA = 0.16
const BLOCK_ALPHA = 0.3
const RING_ALPHA = 0.2
const PACKET_ALPHA = 0.55

export interface NetworkNode {
  x: number
  y: number
  r: number
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildNetwork() {
  const rand = mulberry32(56)
  const nodes: NetworkNode[] = []
  // jittered grid keeps the spread even; dropping some cells keeps it irregular
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (rand() < 0.25) continue
      nodes.push({
        x: ((col + 0.15 + rand() * 0.7) / COLS) * NETWORK_W,
        y: ((row + 0.15 + rand() * 0.7) / ROWS) * NETWORK_H,
        r: rand() < 0.2 ? 2.4 : 1.6,
      })
    }
  }
  const seen = new Set<string>()
  const links: [number, number][] = []
  const adjacency: number[][] = nodes.map(() => [])
  nodes.forEach((a, i) => {
    nodes
      .map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter(({ j }) => j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, NEIGHBOURS)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`
        if (seen.has(key)) return
        seen.add(key)
        links.push([i, j])
        adjacency[i].push(j)
        adjacency[j].push(i)
      })
  })
  return { nodes, links, adjacency }
}

export const network = buildNetwork()

interface Chain {
  path: number[] // node indices
  start: number // s
}

const chainEnd = (c: Chain) => c.start + (c.path.length - 1) * HOP_DURATION
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** Animates chains on a canvas laid over the static mesh. Returns a cleanup function. */
export function mountNetworkChains(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')
  const host = canvas.parentElement
  if (!ctx || !host) return () => {}
  const { nodes, adjacency } = network
  const rand = Math.random

  let width = 0
  let height = 0
  let scale = 1
  let ox = 0
  let oy = 0
  let chains: Chain[] = []
  let nextSpawn = 0.4
  let time = 0
  let last: number | null = null
  let frame = 0
  let onScreen = true

  function resize() {
    const rect = host!.getBoundingClientRect()
    width = Math.max(1, rect.width)
    height = Math.max(1, rect.height)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    // match the SVG's preserveAspectRatio="xMidYMid slice"
    scale = Math.max(width / NETWORK_W, height / NETWORK_H)
    ox = (width - NETWORK_W * scale) / 2
    oy = (height - NETWORK_H * scale) / 2
  }

  const px = (i: number) => ox + nodes[i].x * scale
  const py = (i: number) => oy + nodes[i].y * scale
  const visible = (i: number) => px(i) > 0 && px(i) < width && py(i) > 0 && py(i) < height
  // Keep chains on the copy side, where the mesh is visible (matches the hero-network mask):
  // left of the vault from lg, above it on smaller screens.
  const wide = () => width >= 1024
  const inCore = (i: number) => visible(i) && (wide() ? px(i) < width * 0.38 : py(i) < height * 0.4)
  const inRegion = (i: number) => visible(i) && (wide() ? px(i) < width * 0.55 : py(i) < height * 0.6)

  function spawn() {
    let start = -1
    for (let tries = 0; tries < 30 && start < 0; tries++) {
      const i = Math.floor(rand() * nodes.length)
      if (inCore(i)) start = i
    }
    if (start < 0) return
    const hops = HOPS_MIN + Math.floor(rand() * (HOPS_MAX - HOPS_MIN + 1))
    const path = [start]
    for (let h = 0; h < hops; h++) {
      const here = path[path.length - 1]
      const options = adjacency[here].filter((n) => !path.includes(n) && inRegion(n))
      if (!options.length) break
      path.push(options[Math.floor(rand() * options.length)])
    }
    if (path.length > 2) chains.push({ path, start: time })
  }

  function draw() {
    const c = ctx!
    c.clearRect(0, 0, width, height)
    c.lineCap = 'round'
    for (const ch of chains) {
      const end = chainEnd(ch)
      const fade = time > end + HOLD ? 1 - (time - end - HOLD) / FADE : 1
      const elapsed = time - ch.start
      const hop = Math.min(ch.path.length - 1, elapsed / HOP_DURATION)
      const done = Math.floor(hop)

      // lit links behind the packet
      c.strokeStyle = `rgba(${ACCENT},${(LINK_ALPHA * fade).toFixed(3)})`
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(px(ch.path[0]), py(ch.path[0]))
      for (let k = 1; k <= done; k++) c.lineTo(px(ch.path[k]), py(ch.path[k]))
      // the link in flight, drawn up to the packet
      let headX = px(ch.path[done])
      let headY = py(ch.path[done])
      if (done < ch.path.length - 1) {
        const t = easeInOut(hop - done)
        const a = ch.path[done]
        const b = ch.path[done + 1]
        headX = px(a) + (px(b) - px(a)) * t
        headY = py(a) + (py(b) - py(a)) * t
        c.lineTo(headX, headY)
      }
      c.stroke()

      // blocks: every node reached so far, with a ring as it lands
      for (let k = 0; k <= done; k++) {
        const x = px(ch.path[k])
        const y = py(ch.path[k])
        c.fillStyle = `rgba(${ACCENT_BRIGHT},${(BLOCK_ALPHA * fade).toFixed(3)})`
        c.beginPath()
        c.arc(x, y, 2.2, 0, Math.PI * 2)
        c.fill()
        const since = elapsed - k * HOP_DURATION
        if (since >= 0 && since < CONFIRM) {
          const p = since / CONFIRM
          c.strokeStyle = `rgba(${ACCENT_BRIGHT},${(RING_ALPHA * (1 - p) * fade).toFixed(3)})`
          c.beginPath()
          c.arc(x, y, 2.2 + p * 9, 0, Math.PI * 2)
          c.stroke()
        }
      }

      // the packet itself
      if (time < end) {
        c.fillStyle = `rgba(${ACCENT_BRIGHT},${PACKET_ALPHA})`
        c.beginPath()
        c.arc(headX, headY, 2.4, 0, Math.PI * 2)
        c.fill()
      }
    }
  }

  function tick(now: number) {
    const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000)
    last = now
    time += dt
    if (time >= nextSpawn) {
      if (chains.length < MAX_CHAINS) spawn()
      nextSpawn = time + SPAWN_EVERY * (0.7 + rand() * 0.6)
    }
    chains = chains.filter((ch) => time < chainEnd(ch) + HOLD + FADE)
    draw()
    frame = requestAnimationFrame(tick)
  }

  function start() {
    if (frame || !onScreen || document.hidden) return
    last = null
    frame = requestAnimationFrame(tick)
  }
  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
  }

  const resizeObserver = new ResizeObserver(() => {
    resize()
    draw()
  })
  resizeObserver.observe(host)
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    if (onScreen) start()
    else stop()
  })
  intersectionObserver.observe(host)
  const onVisibility = () => (document.hidden ? stop() : start())
  document.addEventListener('visibilitychange', onVisibility)

  resize()
  start()

  return () => {
    stop()
    resizeObserver.disconnect()
    intersectionObserver.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
