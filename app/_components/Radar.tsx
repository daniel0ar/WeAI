import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

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

const DUMMY_PROPERTIES = Array.from({ length: 6 }, (_, i) => [`property${i + 1}`, `name${i + 1}`] as const);

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
  beacon: { uuid: string; major: number; minor: number };
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

  return (
    <div
      ref={ref}
      className={`dot-modal ${classes}`}
      role="dialog"
      aria-label={beacon.uuid}
      style={{ ...style, marginTop: fit?.shift }}
    >
      <button className="dot-modal-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      {/* Plain img: a static local file, nothing for next/image to optimize. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="dot-modal-photo" src="/robot-placeholder.svg" width={PHOTO_SIZE} height={PHOTO_SIZE} alt="Robot" />
      <strong className="dot-modal-uuid">{beacon.uuid}</strong>
      <span>Major {beacon.major} · Minor {beacon.minor}</span>
      <span>{detail}</span>
      <dl className="dot-modal-props">
        {DUMMY_PROPERTIES.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
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
            key={beaconKey(b)}
            {...{ [TRIGGER_ATTR]: "" }}
            className={`radar-dot${b === selected ? " selected" : ""}`}
            aria-label={`${b.uuid}, major ${b.major}, minor ${b.minor}, ${b.distance.toFixed(1)} meters`}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => onSelect(b === selected ? null : beaconKey(b))}
          />
        );
      })}
      {selected && (() => {
        const { x, y } = position(selected);
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
