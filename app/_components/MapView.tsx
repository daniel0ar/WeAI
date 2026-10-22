import { MAP_H, MAP_W, bars, cafe, desks, pillars, poolTable, seats, walls } from "@/lib/mapData";

interface Props {
  x: number;
  y: number;
  /** Degrees clockwise from map-up. */
  heading: number;
}

export function MapView({ x, y, heading }: Props) {
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="map" role="img" aria-label="Floor plan">
      <rect x={0} y={0} width={MAP_W} height={MAP_H} className="map-bg" />
      {walls.map((w, i) => (
        <line key={i} {...w} className="map-wall" />
      ))}
      {pillars.map((p, i) => (
        <rect key={i} x={p.x - 0.6} y={p.y - 0.6} width={1.2} height={1.2} className="map-block" />
      ))}
      {bars.map((b, i) => (
        <rect key={i} {...b} className="map-block" />
      ))}
      {seats.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={0.4} className="map-block" />
      ))}
      <rect {...cafe} className="map-block" />
      {desks.map((d) => (
        <rect key={d.n} x={d.x} y={d.y} width={d.w} height={d.h} rx={0.1} className="map-desk" />
      ))}
      <rect {...poolTable} rx={0.2} className="map-pool" />

      <g transform={`translate(${x} ${y}) rotate(${heading})`}>
        <path d="M0 0 L-1.2 -2.4 A2.7 2.7 0 0 1 1.2 -2.4 Z" className="map-cone" />
        <circle r={0.55} className="map-me" />
      </g>
    </svg>
  );
}
