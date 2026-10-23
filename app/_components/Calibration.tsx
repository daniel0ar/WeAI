"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CALIBRATION_DISTANCES,
  distanceFromRssi,
  median,
  pathLossExponent,
  rejectOutliers,
  resetCalibration,
  saveCalibrationPoint,
  stdev,
  type CalibrationPoint,
} from "@/lib/calibration";
import type { RawSample } from "@/lib/useBleScan";

// The phone stays put and the body turns, since the antenna pattern of phone and beacon is far from round.
const HEADINGS = ["Facing the beacon", "Turn 90° right", "Turn 90° right (back to the beacon)", "Turn 90° right (left side to the beacon)"];
const SETTLE_S = 4; // time to get into position before sampling starts
const RECORD_S = 15; // per heading, so 60 s per distance
// Beacons advertise every 1.5 s, so 15 s should give ~10 samples. With fewer than MIN_SAMPLES the heading
// is extended once by EXTEND_S; if still short it pauses (keeping what it has) and lets you extend again.
const EXTEND_S = 10;
const MIN_SAMPLES = 4;
const LIVE_MS = 5000; // a beacon counts as "in range" if heard this recently

type Phase = "idle" | "settle" | "record" | "stalled";
interface Heard {
  uuid: string;
  rssiAt1m: number;
  rssi: number;
  at: number;
}

// The beacon is picked by the end of its UUID (0001, 0002, …), typed by hand.
const normalize = (suffix: string) => suffix.trim().toLowerCase();

interface Snapshot {
  now: number;
  phase: Phase;
  heading: number;
  elapsed: number; // s in the current settle/record phase
  until: number; // s the record phase runs to
  count: number; // samples at the current heading
  heard: Heard[];
}

export function Calibration({
  subscribe,
  scanning,
  start,
  points,
  onChange,
  onClose,
}: {
  subscribe: (fn: (s: RawSample) => void) => () => void;
  scanning: boolean;
  start: () => void;
  points: CalibrationPoint[];
  onChange: (points: CalibrationPoint[]) => void;
  onClose: () => void;
}) {
  const [suffix, setSuffix] = useState("0001");
  const [step, setStep] = useState(() => {
    const i = CALIBRATION_DISTANCES.findIndex((d) => !points.some((p) => p.distance === d));
    return i < 0 ? 0 : i;
  });
  const [snap, setSnap] = useState<Snapshot>({ now: 0, phase: "idle", heading: 0, elapsed: 0, until: RECORD_S, count: 0, heard: [] });
  // The measurement runs on refs, driven by one timer; `snap` is what the UI renders.
  const m = useRef({
    phase: "idle" as Phase,
    heading: 0,
    phaseStart: 0,
    until: RECORD_S,
    extended: false,
    samples: [] as number[], // loss in dB at the current heading
    perHeading: [] as number[][],
    suffix: normalize("0001"),
    step,
    points,
    onChange,
  });
  const heard = useRef(new Map<string, Heard>());
  useEffect(() => {
    Object.assign(m.current, { suffix: normalize(suffix), step, points, onChange });
  });

  useEffect(() => {
    if (!scanning) start();
  }, [scanning, start]);

  useEffect(() => {
    return subscribe((s) => {
      heard.current.set(s.uuid, { uuid: s.uuid, rssiAt1m: s.rssiAt1m, rssi: s.rssi, at: Date.now() });
      const c = m.current;
      if (c.phase === "record" && c.suffix && s.uuid.endsWith(c.suffix)) c.samples.push(s.rssiAt1m - s.rssi);
    });
  }, [subscribe]);

  const refresh = useCallback(() => {
    const c = m.current;
    const now = Date.now();
    setSnap({
      now,
      phase: c.phase,
      heading: c.heading,
      elapsed: c.phase === "settle" || c.phase === "record" ? Math.max(0, (now - c.phaseStart) / 1000) : 0,
      until: c.until,
      count: c.samples.length,
      heard: [...heard.current.values()],
    });
  }, []);

  const finishHeading = useCallback(() => {
    const c = m.current;
    c.perHeading[c.heading] = c.samples;
    c.samples = [];
    if (c.heading < HEADINGS.length - 1) {
      c.heading++;
      c.phase = "settle";
      c.phaseStart = Date.now();
      return;
    }
    const kept = rejectOutliers(c.perHeading.flat());
    const distance = CALIBRATION_DISTANCES[c.step];
    c.onChange(saveCalibrationPoint({ distance, loss: median(kept), sd: stdev(kept), count: kept.length }));
    setStep(Math.min(c.step + 1, CALIBRATION_DISTANCES.length - 1));
    c.heading = 0;
    c.phase = "idle";
  }, []);

  // settle → record → (one automatic extension) → stalled or next heading.
  useEffect(() => {
    const id = setInterval(() => {
      const c = m.current;
      const t = (Date.now() - c.phaseStart) / 1000;
      if (c.phase === "settle" && t >= SETTLE_S) {
        c.samples = [];
        c.until = RECORD_S;
        c.extended = false;
        c.phase = "record";
        c.phaseStart = Date.now();
      } else if (c.phase === "record" && t >= c.until) {
        if (c.samples.length >= MIN_SAMPLES) finishHeading();
        else if (!c.extended) {
          c.extended = true;
          c.until += EXTEND_S;
        } else c.phase = "stalled";
      }
      refresh();
    }, 250);
    return () => clearInterval(id);
  }, [finishHeading, refresh]);

  function begin() {
    Object.assign(m.current, { perHeading: [], samples: [], heading: 0, phase: "settle", phaseStart: Date.now() });
    refresh();
  }

  function extend() {
    const c = m.current;
    // Resume the clock where it stopped, with EXTEND_S more to go.
    c.phaseStart = Date.now() - c.until * 1000;
    c.until += EXTEND_S;
    c.phase = "record";
    refresh();
  }

  function acceptShort() {
    finishHeading();
    refresh();
  }

  function cancel() {
    Object.assign(m.current, { phase: "idle", heading: 0, samples: [], perHeading: [] });
    refresh();
  }

  function reset() {
    resetCalibration();
    onChange([]);
    setStep(0);
  }

  const { now, phase, heading, elapsed, until, count } = snap;
  const distance = CALIBRATION_DISTANCES[step];
  const wanted = normalize(suffix);
  // Most recently heard beacon whose UUID ends with the typed suffix.
  const live = wanted ? snap.heard.filter((h) => h.uuid.endsWith(wanted)).sort((a, b) => b.at - a.at)[0] : undefined;
  const fresh = !!live && now - live.at < LIVE_MS;
  const busy = phase !== "idle";
  const n = pathLossExponent(points);

  return (
    <div className="calib" role="dialog" aria-label="Calibration">
      <header className="calib-head">
        <h1>Calibration</h1>
        <button className="ghost" onClick={onClose} disabled={busy}>Close</button>
      </header>

      <p className="muted small">
        Calibrates the room, not one beacon: the result applies to every beacon. Each beacon already reports its own RSSI at 1 m; this measures the extra
        loss at {CALIBRATION_DISTANCES.join(", ")} m. Use any one beacon.
      </p>

      <label>
        Beacon UUID ends with
        <input value={suffix} disabled={busy} inputMode="text" autoCapitalize="none" onChange={(e) => setSuffix(e.target.value)} />
      </label>

      <p className={`calib-live${fresh ? "" : " stale"}`}>
        {fresh ? (
          <>
            <b>{Math.round(live.rssi)} dBm</b>{" "}
            <span className="muted small">
              …{live.uuid.slice(-12)} · ref {live.rssiAt1m} dBm · {distanceFromRssi(live.rssi, live.rssiAt1m, points).toFixed(1)} m now
            </span>
          </>
        ) : (
          <span className="muted">Beacon …{suffix} not heard</span>
        )}
      </p>

      <section className="calib-step">
        {busy ? (
          <p>
            <b>{distance} m</b> · heading {heading + 1}/{HEADINGS.length}: <b>{HEADINGS[heading]}</b>. Hold the phone at beacon height and keep still.
          </p>
        ) : (
          <p>
            Put the phone <b>{distance} m</b> from the beacon, at the same height, nothing between them. Start, then turn on the spot as prompted:{" "}
            {HEADINGS.length} headings × {RECORD_S} s.
          </p>
        )}
        {(phase === "settle" || phase === "record") && (
          <div className="calib-bar" aria-label={phase === "settle" ? "Get ready" : "Recording"}>
            <div
              style={{ width: `${Math.min(100, (elapsed / (phase === "settle" ? SETTLE_S : until)) * 100)}%` }}
              className={phase}
            />
            <span>
              {phase === "settle"
                ? `Get ready… ${Math.ceil(SETTLE_S - elapsed)}`
                : `Recording ${Math.max(0, Math.ceil(until - elapsed))} s${until > RECORD_S ? " (extended)" : ""} · ${count} samples`}
            </span>
          </div>
        )}
        {phase === "stalled" && (
          <>
            <p className="error">
              Only {count} sample{count === 1 ? "" : "s"} at this heading (need {MIN_SAMPLES}). The headings already done are kept.
            </p>
            <div className="calib-actions">
              <button onClick={extend}>Extend {EXTEND_S} s</button>
              {count > 0 && <button className="ghost" onClick={acceptShort}>Use {count}</button>}
              <button className="ghost" onClick={cancel}>Cancel {distance} m</button>
            </div>
          </>
        )}
        {phase === "idle" && (
          <button disabled={!fresh} onClick={begin}>
            {points.some((p) => p.distance === distance) ? `Redo ${distance} m` : `Start ${distance} m`}
          </button>
        )}
      </section>

      <ul className="calib-list">
        {CALIBRATION_DISTANCES.map((d, i) => {
          const p = points.find((q) => q.distance === d);
          return (
            <li key={d}>
              <button className={`ghost${i === step ? " current" : ""}`} disabled={busy} onClick={() => setStep(i)}>
                {d} m
              </button>
              <span>{p ? `−${p.loss.toFixed(1)} dB ±${p.sd.toFixed(1)} · ${p.count} samples · n ${(p.loss / (10 * Math.log10(d))).toFixed(2)}` : "—"}</span>
            </li>
          );
        })}
      </ul>

      <section className="calib-result">
        <dl>
          <dt>Status</dt>
          <dd>
            {points.length}/{CALIBRATION_DISTANCES.length} distances
          </dd>
          <dt>Path-loss n (overall)</dt>
          <dd>
            {n.toFixed(2)}
            {points.length === 0 && " (default)"}
          </dd>
        </dl>
        <p className="muted small">Saved on this phone as each distance finishes. It is kept when the app restarts.</p>
        <button className="ghost" disabled={busy || points.length === 0} onClick={reset}>
          Reset calibration
        </button>
      </section>
    </div>
  );
}
