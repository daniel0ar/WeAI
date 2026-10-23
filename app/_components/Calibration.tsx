"use client";

import { useEffect, useRef, useState } from "react";
import { fitCalibration, median, percentile, rejectOutliers, saveCalibration, stdev } from "@/lib/calibration";
import { distanceFromRssi } from "@/lib/ibeacon";
import type { RawSample } from "@/lib/useBleScan";

// "check" distances are held out of the fit, so the error on them is an honest accuracy estimate.
const POINTS: { d: number; check?: boolean }[] = [
  { d: 1 }, { d: 2 }, { d: 3 }, { d: 4, check: true }, { d: 5 }, { d: 6, check: true }, { d: 8 }, { d: 10 },
];
// The phone stays put and the body turns, since the antenna pattern of phone and beacon is far from round.
const HEADINGS = ["Facing the beacon", "Turn 90° right", "Turn 90° right (back to the beacon)", "Turn 90° right (left side to the beacon)"];
const SETTLE_S = 4; // time to get into position before sampling starts
const RECORD_S = 15; // per heading
// A heading keeps recording past RECORD_S until it has TARGET_SAMPLES, up to MAX_RECORD_S. Dips happen
// (body between phone and beacon, Android dropping packets); if it is still short at the cap it is
// kept with a warning rather than discarding the headings already done.
const TARGET_SAMPLES = 30;
const MAX_RECORD_S = 30;
const MIN_SAMPLES = 3;

type Phase = "idle" | "settle" | "record";
interface Result {
  median: number;
  sd: number;
  count: number;
  dropped: number; // outliers rejected
  spread: number; // dB between the highest and lowest heading median
  short: number; // headings that ended with fewer than TARGET_SAMPLES
}

export function Calibration({
  subscribe,
  scanning,
  start,
  onClose,
}: {
  subscribe: (fn: (s: RawSample) => void) => () => void;
  scanning: boolean;
  start: () => void;
  onClose: () => void;
}) {
  const [suffix, setSuffix] = useState("0001");
  const [step, setStep] = useState(0);
  const [heading, setHeading] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [live, setLive] = useState<{ rssi: number; uuid: string; at: number } | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [count, setCount] = useState(0);
  const samples = useRef<number[]>([]);
  const perHeading = useRef<number[][]>([]);
  const phaseStart = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const suffixRef = useRef(suffix);
  useEffect(() => {
    phaseRef.current = phase;
    suffixRef.current = suffix.trim().toLowerCase();
  });

  useEffect(() => {
    if (!scanning) start();
  }, [scanning, start]);

  useEffect(() => {
    return subscribe((s) => {
      if (!s.uuid.endsWith(suffixRef.current)) return;
      setLive({ rssi: s.rssi, uuid: s.uuid, at: Date.now() });
      if (phaseRef.current === "record") samples.current.push(s.rssi);
    });
  }, [subscribe]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (phase === "idle") return;
    const id = setInterval(() => {
      const t = (Date.now() - phaseStart.current) / 1000;
      setElapsed(t);
      setCount(samples.current.length);
      if (phase === "settle" && t >= SETTLE_S) {
        samples.current = [];
        phaseStart.current = Date.now();
        setElapsed(0);
        setPhase("record");
        return;
      }
      const data = samples.current;
      if (phase !== "record" || t < RECORD_S || (data.length < TARGET_SAMPLES && t < MAX_RECORD_S)) return;
      if (data.length < MIN_SAMPLES) {
        setError(`Only ${data.length} samples heard at heading ${heading + 1}, even after waiting. Is beacon …${suffixRef.current} in range?`);
        setPhase("idle");
        return;
      }
      perHeading.current[heading] = data;
      if (heading < HEADINGS.length - 1) {
        phaseStart.current = Date.now();
        setElapsed(0);
        setHeading(heading + 1);
        setPhase("settle");
        return;
      }
      const pooled = perHeading.current.flat();
      const kept = rejectOutliers(pooled);
      const medians = perHeading.current.map(median);
      setResults((r) => ({
        ...r,
        [POINTS[step].d]: {
          median: median(kept),
          sd: stdev(kept),
          count: kept.length,
          dropped: pooled.length - kept.length,
          spread: Math.max(...medians) - Math.min(...medians),
          short: perHeading.current.filter((h) => h.length < TARGET_SAMPLES).length,
        },
      }));
      setStep(Math.min(step + 1, POINTS.length - 1));
      setHeading(0);
      setPhase("idle");
    }, 200);
    return () => clearInterval(id);
  }, [phase, step, heading]);

  function begin() {
    setError(null);
    setSaved(false);
    perHeading.current = [];
    setHeading(0);
    phaseStart.current = Date.now();
    setElapsed(0);
    setPhase("settle");
  }

  const fit = fitCalibration(POINTS.filter((p) => !p.check && results[p.d]).map((p) => ({ distance: p.d, rssi: results[p.d].median })));
  const estimate = (d: number) => (fit && results[d] ? distanceFromRssi(results[d].median, fit.rssiAt1m, fit) : null);
  const checkErrors = POINTS.filter((p) => p.check && results[p.d]).map((p) => Math.abs(estimate(p.d)! - p.d));
  const fresh = live && now - live.at < 3000;
  const seconds = phase === "settle" ? SETTLE_S : elapsed >= RECORD_S ? MAX_RECORD_S : RECORD_S;
  const busy = phase !== "idle";
  const cur = POINTS[step];

  function save() {
    if (!fit || !live) return;
    saveCalibration(live.uuid, { rssiAt1m: fit.rssiAt1m, n: fit.n });
    setSaved(true);
  }

  return (
    <div className="calib" role="dialog" aria-label="Calibration">
      <header className="calib-head">
        <h1>Calibration</h1>
        <button className="ghost" onClick={onClose} disabled={busy}>Close</button>
      </header>

      <label>
        Beacon UUID ends with
        <input
          value={suffix}
          disabled={busy}
          inputMode="text"
          autoCapitalize="none"
          onChange={(e) => {
            setSuffix(e.target.value);
            setResults({});
            setStep(0);
            setLive(null);
            setSaved(false);
          }}
        />
      </label>

      <p className={`calib-live${fresh ? "" : " stale"}`}>
        {fresh ? (
          <>
            <b>{Math.round(live.rssi)} dBm</b> <span className="muted small">…{live.uuid.slice(-12)}</span>
          </>
        ) : (
          <span className="muted">Beacon …{suffix} not heard</span>
        )}
      </p>

      <section className="calib-step">
        {busy ? (
          <p>
            <b>{cur.d} m</b> · heading {heading + 1}/{HEADINGS.length}: <b>{HEADINGS[heading]}</b>. Hold the phone at beacon height and keep still.
          </p>
        ) : (
          <p>
            Put the phone <b>{cur.d} m</b> from the beacon{cur.check ? " (check point: kept out of the fit)" : ""}, at the same height, nothing between
            them. Start, then turn on the spot as prompted: {HEADINGS.length} headings × {RECORD_S} s.
          </p>
        )}
        {busy && (
          <div className="calib-bar" aria-label={phase === "settle" ? "Get ready" : "Recording"}>
            <div style={{ width: `${Math.min(100, (elapsed / seconds) * 100)}%` }} className={phase} />
            <span>
              {phase === "settle" ? `Get ready… ${Math.ceil(SETTLE_S - elapsed)}` : `Recording ${Math.max(0, Math.ceil(RECORD_S - elapsed))} s${elapsed >= RECORD_S ? " (extending for more samples)" : ""} · ${count} samples`}
            </span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button disabled={busy || !fresh} onClick={begin}>
          {busy ? "Measuring…" : results[cur.d] ? `Redo ${cur.d} m` : `Start ${cur.d} m`}
        </button>
      </section>

      <ul className="calib-list">
        {POINTS.map((p, i) => {
          const r = results[p.d];
          const est = estimate(p.d);
          return (
            <li key={p.d}>
              <button className={`ghost${i === step ? " current" : ""}`} disabled={busy} onClick={() => setStep(i)}>
                {p.d} m{p.check ? " ✓" : ""}
              </button>
              <span>
                {r ? `${r.median.toFixed(1)} dBm ±${r.sd.toFixed(1)} · ${r.count} (−${r.dropped}) · dir ${r.spread.toFixed(0)} dB${r.short ? ` · ⚠${r.short} short` : ""}` : "—"}
                {r && est !== null && ` → ${est.toFixed(1)} m`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        ⚠ short = headings that stayed under {TARGET_SAMPLES} samples after waiting. ✓ = check point. −n = outliers rejected; dir = difference between the highest and lowest heading (large means orientation matters, or the
        spot is multipath-heavy).
      </p>

      <section className="calib-result">
        {fit ? (
          <>
            <dl>
              <dt>RSSI @ 1 m</dt>
              <dd>{fit.rssiAt1m.toFixed(1)} dBm</dd>
              <dt>Path-loss n</dt>
              <dd>{fit.n.toFixed(2)}</dd>
              <dt>Fit error (training)</dt>
              <dd>±{fit.residual.toFixed(1)} dB</dd>
              {checkErrors.length > 0 && (
                <>
                  <dt>Check error, median</dt>
                  <dd>{median(checkErrors).toFixed(1)} m</dd>
                  <dt>Check error, p90</dt>
                  <dd>{percentile(checkErrors, 0.9).toFixed(1)} m</dd>
                </>
              )}
            </dl>
            {checkErrors.length === 0 && <p className="muted small">Measure the ✓ distances (4 m, 6 m) to get an honest error.</p>}
            {checkErrors.length === 1 && <p className="muted small">With one check point the p90 is just that error.</p>}
            <button disabled={busy || !fresh} onClick={save}>{saved ? "Saved" : "Save for this beacon"}</button>
          </>
        ) : (
          <p className="muted small">Measure at least two non-check distances (1 m first) to get a fit.</p>
        )}
      </section>
    </div>
  );
}
