import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { robotTitle, type RobotRecord } from "@/lib/robots";
import { describe, type RobotMeta } from "@/lib/weaiUuid";

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
  meta: RobotMeta | null; // decoded from the UUID; null when the UUID is not in the WeAI v1 format
  robot?: RobotRecord; // names and photo saved on this phone for its brand and model
}

// Every Major-5 beacon is shown; those without saved names are unknown robots.
export const robotLabel = (b: Beacon) => (b.robot ? robotTitle(b.robot) : "Unknown robot");

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

// Minimum distance between dot centres: the 10px dot plus a visible gap.
const MIN_GAP_PX = 16;

// Places every dot at its distance-based spot, then pushes overlapping dots apart until each pair is at
// least MIN_GAP_PX apart, so no dot hides another. Positions are in % of the radar width.
function layout(beacons: Beacon[], radarPx: number) {
  const targets = beacons.map(position);
  const pts = targets.map((p) => ({ ...p }));
  const min = (MIN_GAP_PX / radarPx) * 100;
  const ITERATIONS = 200;
  for (let it = 0; it < ITERATIONS; it++) {
    // Early on, drift back toward the true spot so dots move only as far as needed; the last
    // iterations only separate, so the result never ends with an overlap.
    if (it < ITERATIONS * 0.7) {
      for (let i = 0; i < pts.length; i++) {
        pts[i].x += 0.1 * (targets[i].x - pts[i].x);
        pts[i].y += 0.1 * (targets[i].y - pts[i].y);
      }
    }
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[j].x - pts[i].x;
        let dy = pts[j].y - pts[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 1e-6) {
          // Same spot: split them along a fixed direction picked from their order.
          const a = (i + j) * 2.39996;
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1;
        }
        const push = (min - Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y)) / 2;
        pts[i].x -= (dx / d) * push;
        pts[i].y -= (dy / d) * push;
        pts[j].x += (dx / d) * push;
        pts[j].y += (dy / d) * push;
        moved = true;
      }
    }
    // Keep every dot inside the outer ring.
    for (const p of pts) {
      const dx = p.x - 50;
      const dy = p.y - 50;
      const d = Math.hypot(dx, dy);
      if (d > 50) {
        p.x = 50 + (dx / d) * 50;
        p.y = 50 + (dy / d) * 50;
      }
    }
    if (!moved && it >= ITERATIONS * 0.7) break;
  }
  return pts;
}

export const beaconKey = (b: { uuid: string; major: number; minor: number }) => `${b.uuid}:${b.major}:${b.minor}`;

// Tap/click targets that open a DotModal. They handle their own toggling, so DotModal's
// touch-away close ignores them (otherwise tapping the open dot would close and instantly reopen it).
export const TRIGGER_ATTR = "data-beacon-trigger";

const PHOTO_SIZE = 200;

// Closable popover anchored at a beacon dot. The at-* classes in className pick which side it opens
// to; if it doesn't fit there it flips, and if it fits on neither side it slides along the screen,
// covering the dot, so its full content stays visible between the header and the screen bottom.
export function DotModal({
  beacon,
  detail,
  className,
  style,
  onClose,
}: {
  beacon: Beacon;
  detail: string;
  className: string;
  style?: CSSProperties;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ side: "above" | "below"; shift: number } | null>(null);
  const key = beaconKey(beacon);

  // Before first paint: measure the room above/below the anchor dot and pick a side.
  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent;
    if (!el || !parent) return;
    const gap = Math.abs(parseFloat(getComputedStyle(el).marginTop)); // distance between dot and popup
    const anchorY = parent.getBoundingClientRect().top + el.offsetTop - parseFloat(getComputedStyle(el).marginTop);
    const headerBottom = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
    const bottomLimit = window.innerHeight - 8;
    const h = el.offsetHeight;
    const room = { above: anchorY - gap - headerBottom, below: bottomLimit - anchorY - gap };
    const preferred = className.includes("at-above") ? "above" : "below";
    const other = preferred === "above" ? "below" : "above";
    const side = h <= room[preferred] || room[preferred] >= room[other] ? preferred : other;
    // Distance to slide (down is positive) so the popup stays inside [headerBottom, bottomLimit].
    const shift = side === "above" ? Math.max(0, headerBottom - (anchorY - gap - h)) : Math.min(0, bottomLimit - (anchorY + gap + h));
    setFit({ side, shift: shift + (side === "above" ? -gap : gap) });
    // className only seeds the preferred side; re-measure when the selected beacon changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Touch-away closes. Triggers are excluded: they toggle the selection themselves.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (ref.current?.contains(t) || t.closest(`[${TRIGGER_ATTR}]`)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  const classes = fit ? className.replace(/at-(above|below)/, `at-${fit.side}`) : className;
  const label = robotLabel(beacon);
  const { meta, robot } = beacon;

  return (
    <div
      ref={ref}
      className={`dot-modal ${classes}`}
      role="dialog"
      aria-label={label}
      style={{ ...style, marginTop: fit?.shift }}
    >
      <button className="dot-modal-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      {/* Plain img: a local file or a saved data URL, nothing for next/image to optimize. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="dot-modal-photo" src={robot?.photo || "/robot-placeholder.svg"} width={PHOTO_SIZE} height={PHOTO_SIZE} alt={label} />
      <strong className="dot-modal-title">{label}</strong>
      {meta ? (
        <span>
          Robot #{meta.robotNo} · Brand {meta.brand} · Model {meta.model}
        </span>
      ) : (
        <span>This robot is not yet identified.</span>
      )}
      {meta && !robot && <span>No names or photo saved for this brand and model.</span>}
      <span>{detail}</span>
      {meta && (
        <dl className="dot-modal-props">
          {describe(meta).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <code className="dot-modal-uuid">{beacon.uuid}</code>
    </div>
  );
}

export function Radar({
  active,
  beacons = [],
  selectedKey,
  onSelect,
}: {
  active: boolean;
  beacons?: Beacon[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const selected = beacons.find((b) => beaconKey(b) === selectedKey) ?? null;
  const ref = useRef<HTMLDivElement>(null);
  const [radarPx, setRadarPx] = useState(340);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setRadarPx(e.contentRect.width || 340));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const spots = layout(beacons, radarPx);

  return (
    <div ref={ref} className="radar" aria-label="Radar">
      {active && <span className="radar-pulse" />}
      {RINGS.map((r) => (
        <div key={r.meters} className="radar-ring" style={{ width: `${r.size}%`, height: `${r.size}%` }}>
          <span className="radar-label">{r.meters}m</span>
        </div>
      ))}
      {beacons.map((b, i) => {
        const { x, y } = spots[i];
        return (
          <button
            key={beaconKey(b)}
            {...{ [TRIGGER_ATTR]: "" }}
            className={`radar-dot${b === selected ? " selected" : ""}`}
            aria-label={`${robotLabel(b)}, ${b.distance.toFixed(1)} meters`}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => onSelect(b === selected ? null : beaconKey(b))}
          />
        );
      })}
      {selected && (() => {
        const { x, y } = spots[beacons.indexOf(selected)];
        const h = x < 30 ? "at-left" : x > 70 ? "at-right" : "at-center";
        const v = y < 50 ? "at-below" : "at-above";
        return (
          <DotModal
            key={beaconKey(selected)}
            beacon={selected}
            detail={`${selected.distance.toFixed(1)}m`}
            className={`${h} ${v}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClose={() => onSelect(null)}
          />
        );
      })()}
      <svg className="radar-me" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
      </svg>
    </div>
  );
}
