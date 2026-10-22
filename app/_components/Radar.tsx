import { useState } from "react";

// Ring diameters as a share of the radar's width, one per range label.
const RINGS = [
  { meters: 2, size: 26 },
  { meters: 8, size: 62 },
  { meters: 20, size: 100 },
];

export interface Beacon {
  uuid: string;
  major: number; // 0-65535
  minor: number; // 0-65535
  distance: number; // meters
  angle: number; // radians, only used for placement
}

export const RADAR_RANGE_M = 20;

// Radius as a share of the radar width, interpolated between ring radii (0, 2, 8, 20 m).
function radiusFor(meters: number) {
  const stops = [0, ...RINGS.map((r) => r.meters)];
  const radii = [0, ...RINGS.map((r) => r.size / 2)];
  for (let i = 1; i < stops.length; i++) {
    if (meters <= stops[i]) {
      const t = (meters - stops[i - 1]) / (stops[i] - stops[i - 1]);
      return radii[i - 1] + t * (radii[i] - radii[i - 1]);
    }
  }
  return radii[radii.length - 1];
}

function position(b: Beacon) {
  const r = radiusFor(b.distance);
  return { x: 50 + r * Math.cos(b.angle), y: 50 + r * Math.sin(b.angle) };
}

export function Radar({ active, beacons = [] }: { active: boolean; beacons?: Beacon[] }) {
  const [picked, setPicked] = useState<Beacon | null>(null);
  // Compared by reference so a regenerated set never inherits an old selection.
  const selected = picked && beacons.includes(picked) ? picked : null;

  return (
    <div className="radar" aria-label="Radar">
      {active && <span className="radar-pulse" />}
      {RINGS.map((r) => (
        <div key={r.meters} className="radar-ring" style={{ width: `${r.size}%`, height: `${r.size}%` }}>
          <span className="radar-label">{r.meters}m</span>
        </div>
      ))}
      {beacons.map((b) => {
        const { x, y } = position(b);
        return (
          <button
            key={`${b.uuid}:${b.major}:${b.minor}`}
            className={`radar-dot${b === selected ? " selected" : ""}`}
            aria-label={`${b.uuid}, major ${b.major}, minor ${b.minor}, ${b.distance.toFixed(1)} meters`}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => setPicked(b === selected ? null : b)}
          />
        );
      })}
      {selected && (() => {
        const { x, y } = position(selected);
        const h = x < 30 ? "at-left" : x > 70 ? "at-right" : "at-center";
        const v = y < 50 ? "at-below" : "at-above";
        return (
          <div className={`dot-modal ${h} ${v}`} role="dialog" aria-label={selected.uuid} style={{ left: `${x}%`, top: `${y}%` }}>
            <button className="dot-modal-close" aria-label="Close" onClick={() => setPicked(null)}>
              ×
            </button>
            <strong className="dot-modal-uuid">{selected.uuid}</strong>
            <span>Major {selected.major} · Minor {selected.minor}</span>
            <span>{selected.distance.toFixed(1)}m</span>
          </div>
        );
      })()}
      <svg className="radar-me" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
      </svg>
    </div>
  );
}
