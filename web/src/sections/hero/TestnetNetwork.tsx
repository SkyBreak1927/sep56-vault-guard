// Small node mesh for the hero's testnet card: peers around a live (green) node,
// with packets hopping in along the links. SVG + SMIL; motion hidden with reduced motion.

const HUB = { x: 100, y: 34 }

const peers = [
  { x: 58, y: 16 },
  { x: 62, y: 50 },
  { x: 140, y: 14 },
  { x: 144, y: 48 },
  { x: 22, y: 30 },
  { x: 180, y: 32 },
  { x: 30, y: 58 },
  { x: 172, y: 6 },
]

// [from, to] by index; -1 is the hub.
const links: [number, number][] = [
  [0, -1], [1, -1], [2, -1], [3, -1],
  [4, 0], [4, 1], [6, 1], [5, 2], [5, 3], [7, 2], [0, 1], [2, 3],
]

const at = (i: number) => (i === -1 ? HUB : peers[i])

// Routes packets travel, ending at the hub, with their start offsets (s).
const routes: { path: [number, number][]; begin: number }[] = [
  { path: [[4, 0], [0, -1]], begin: 0 },
  { path: [[5, 3], [3, -1]], begin: 1.1 },
  { path: [[6, 1], [1, -1]], begin: 2.2 },
  { path: [[7, 2], [2, -1]], begin: 3.3 },
]

const toD = (path: [number, number][]) =>
  `M${at(path[0][0]).x} ${at(path[0][0]).y}` + path.map(([, b]) => ` L${at(b).x} ${at(b).y}`).join('')

export function TestnetNetwork({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 64" fill="none" className={className} aria-hidden="true" focusable={false}>
      <g stroke="var(--color-line-strong)" strokeWidth="1">
        {links.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={at(a).x} y1={at(a).y} x2={at(b).x} y2={at(b).y} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {peers.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--color-subtle)" />
      ))}

      <g className="motion-reduce:hidden">
        {routes.map(({ path, begin }) => (
          <circle key={begin} r="1.6" fill="var(--color-pass)" opacity="0">
            <animateMotion dur="4.4s" begin={`${begin}s`} repeatCount="indefinite" path={toD(path)} keyPoints="0;1;1" keyTimes="0;0.4;1" calcMode="linear" />
            <animate attributeName="opacity" dur="4.4s" begin={`${begin}s`} repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.05;0.38;0.42;1" />
          </circle>
        ))}
        {/* Ping ring around the live node. */}
        <circle cx={HUB.x} cy={HUB.y} r="4" stroke="var(--color-pass)" strokeWidth="1" vectorEffect="non-scaling-stroke">
          <animate attributeName="r" dur="2.2s" repeatCount="indefinite" values="4;12" />
          <animate attributeName="opacity" dur="2.2s" repeatCount="indefinite" values="0.6;0" />
        </circle>
      </g>

      <circle cx={HUB.x} cy={HUB.y} r="6" fill="var(--color-pass-base)" fillOpacity="0.15" />
      <circle cx={HUB.x} cy={HUB.y} r="3.2" fill="var(--color-pass)" />
    </svg>
  )
}
