import { NETWORK_H, NETWORK_W, network } from '@/artwork/heroNetwork'
import { HeroNetworkChains } from './HeroNetworkChains'

const { nodes, links } = network

/** Faint node mesh across the whole hero, with animated chains on top. */
export function HeroNetwork() {
  return (
    <div className="hero-network pointer-events-none absolute inset-0" aria-hidden="true">
      <svg
        viewBox={`0 0 ${NETWORK_W} ${NETWORK_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        fill="none"
        focusable={false}
      >
        <g stroke="var(--color-fg)" strokeOpacity="0.05" strokeWidth="1">
          {links.map(([a, b]) => (
            <line
              key={`${a}-${b}`}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={n.r} fill="var(--color-fg)" fillOpacity="0.14" />
        ))}
      </svg>
      <HeroNetworkChains />
    </div>
  )
}
