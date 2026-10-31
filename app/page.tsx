"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getUser } from "@/lib/auth";
import { CALIBRATION_DISTANCES, distanceFromRssi, loadCalibration, type CalibrationPoint } from "@/lib/calibration";
import { loadRobots, type Registry, type RobotRecord } from "@/lib/robots";
import { useBleScan, type RawSample } from "@/lib/useBleScan";
import { AI_LOCATION, CONTROL, decodeUuid, encodeUuid, MOBILITY, robotKey, type RobotMeta } from "@/lib/weaiUuid";
import { AddRobot } from "./_components/AddRobot";
import { AskAi } from "./_components/AskAi";
import { Calibration } from "./_components/Calibration";
import { beaconKey, DotModal, Radar, RADAR_RANGE_M, robotLabel, TRIGGER_ATTR, type Beacon } from "./_components/Radar";

// There is no bearing to a beacon, only distance, so each one gets a fixed angle derived from its
// identity. That keeps its dot from jumping around the radar between updates.
function angleFor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (h / 2 ** 32) * 2 * Math.PI;
}

const rnd = (n: number) => Math.floor(Math.random() * n);

// Metadata for a fake robot. About half use a brand and model saved on this phone, so their cards show its names and photo.
function fakeMeta(robotNo: number, saved: RobotRecord[]): RobotMeta {
  const pick = saved.length > 0 && Math.random() < 0.5 ? saved[rnd(saved.length)] : null;
  const mobility = rnd(MOBILITY.length);
  return {
    brand: pick ? pick.brand : 1 + rnd(999),
    model: pick ? pick.model : 1 + rnd(999),
    mobility,
    control: rnd(CONTROL.length),
    ai: rnd(AI_LOCATION.length),
    reachCm: rnd(300),
    speedCmS: mobility === 0 ? 0 : 5 + rnd(400),
    weightG: 100 + rnd(50000),
    volumeL: 1 + rnd(200),
    robotNo,
  };
}

// Second line of a list row.
function rowDetail(b: Beacon) {
  if (!b.meta) return b.uuid;
  return b.robot ? `#${b.meta.robotNo} · ${MOBILITY[b.meta.mobility] ?? "?"}` : `#${b.meta.robotNo} · Brand ${b.meta.brand} · Model ${b.meta.model}`;
}

export default function HomePage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [testBeacons, setTestBeacons] = useState<Beacon[]>([]);
  // The one open popup (list or radar), by beacon key so it survives the periodic list refresh.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationPoint[]>([]);
  const [robots, setRobots] = useState<Registry>({});
  const [addingRobot, setAddingRobot] = useState(false);
  // The AI chat replaces the Scan button while open.
  const [askingAi, setAskingAi] = useState(false);
  const sampleSink = useRef<((s: RawSample) => void) | null>(null);
  const subscribeSamples = useCallback((fn: (s: RawSample) => void) => {
    sampleSink.current = fn;
    return () => {
      sampleSink.current = null;
    };
  }, []);
  const ble = useBleScan((s) => sampleSink.current?.(s));

  useEffect(() => {
    if (!getUser()) router.replace("/login");
    else {
      setCalibration(loadCalibration());
      setRobots(loadRobots());
      setStarted(true);
    }
  }, [router]);

  // Scanning is on by default once the user is signed in and BLE is available.
  const { supported, start } = ble;
  useEffect(() => {
    if (started && supported) start();
  }, [started, supported, start]);

  if (!started) return null;

  function generateTestBeacons() {
    const saved = Object.values(robots);
    const n = 1 + rnd(12);
    setTestBeacons(
      Array.from({ length: n }, (_, i) => {
        const place = { major: 5, minor: rnd(65536), distance: 1 + Math.random() * 49, angle: Math.random() * 2 * Math.PI };
        // About 1 in 5 has a UUID that is not in the WeAI format.
        if (Math.random() < 0.2) return { ...place, uuid: crypto.randomUUID(), meta: null };
        // Robot numbers from 9001, out of the way of real beacons.
        const meta = fakeMeta(9001 + i, saved);
        return { ...place, uuid: encodeUuid(meta), meta };
      }),
    );
    setMenuOpen(false);
  }

  function resetTestBeacons() {
    setTestBeacons([]);
    setMenuOpen(false);
  }

  // Real beacons go on the radar only once all calibration distances are measured and they are
  // within range; until then, or when farther, they stay in the list.
  const calibrated = CALIBRATION_DISTANCES.every((d) => calibration.some((p) => p.distance === d));
  // The saved name and photo for the beacon's brand and model, looked up on every render so edits show at once.
  const withRobot = (b: Beacon): Beacon => ({ ...b, robot: b.meta ? robots[robotKey(b.meta)] : undefined });
  const real: Beacon[] = ble.beacons
    .map((b) => ({
      uuid: b.uuid,
      major: b.major,
      minor: b.minor,
      distance: distanceFromRssi(b.rssi, b.rssiAt1m, calibration),
      angle: angleFor(beaconKey(b)),
      meta: decodeUuid(b.uuid),
    }))
    .map(withRobot);
  const tests = testBeacons.map(withRobot);
  const onRadar = (b: Beacon) => b.distance < RADAR_RANGE_M;
  const realListed = calibrated ? real.filter((b) => !onRadar(b)) : real;
  const inRange = [...(calibrated ? real.filter(onRadar) : []), ...tests.filter((b) => b.distance <= RADAR_RANGE_M)];
  const outOfRange = tests.filter((b) => b.distance > RADAR_RANGE_M).sort((a, b) => a.distance - b.distance);

  return (
    <main className="screen">
      <header className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/weai-logo-white.png" alt="WeAI" className="logo" />
        <button className="icon-btn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      <p className="detected">Detected: {real.length + tests.length}</p>

      {menuOpen && (
        <div className="backdrop drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <nav className="drawer" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <button className="ghost" onClick={() => setMenuOpen(false)}>Close</button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setCalibrating(true);
              }}
            >
              Calibrate
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                setAddingRobot(true);
              }}
            >
              Add robot
            </button>
            {testBeacons.length > 0 ? (
              <button onClick={resetTestBeacons}>Reset</button>
            ) : (
              <button onClick={generateTestBeacons}>Test</button>
            )}
          </nav>
        </div>
      )}

      {realListed.length + outOfRange.length > 0 && (
        <ul className="far-list" aria-label="Detected beacons">
          {[
            ...realListed,
            ...outOfRange,
          ]
            // Farthest first.
            .sort((a, b) => b.distance - a.distance)
            .map((b) => ({ ...b, detail: b.distance >= RADAR_RANGE_M ? `>${RADAR_RANGE_M}m` : `${b.distance.toFixed(1)}m` }))
            .map((b) => {
            const key = beaconKey(b);
            return (
              <li key={key}>
                <button
                  {...{ [TRIGGER_ATTR]: "" }}
                  className={`far-row${key === pickedKey ? " selected" : ""}`}
                  aria-label={`${robotLabel(b)}, ${b.detail}`}
                  onClick={() => setPickedKey(key === pickedKey ? null : key)}
                >
                  <span className="far-id">
                    <span className="far-name">{robotLabel(b)}</span>
                    {b.meta ? <span className="far-meta">{rowDetail(b)}</span> : <code className="far-uuid">{rowDetail(b)}</code>}
                  </span>
                  {b.detail}
                  <span className="far-dot" aria-hidden="true" />
                </button>
                {key === pickedKey && (
                  <DotModal beacon={b} detail={b.detail} className="at-right at-below" onClose={() => setPickedKey(null)} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Radar active={ble.scanning} beacons={inRange} selectedKey={pickedKey} onSelect={setPickedKey} />

      {addingRobot && <AddRobot robots={robots} onChange={setRobots} onClose={() => setAddingRobot(false)} />}

      {calibrating && (
        <Calibration
          subscribe={subscribeSamples}
          scanning={ble.scanning}
          start={ble.start}
          points={calibration}
          onChange={setCalibration}
          onClose={() => setCalibrating(false)}
        />
      )}

      {ble.error && <p className="toast error">{ble.error}</p>}
      {!ble.supported && <p className="toast muted small">BLE scanning is only available in the Android app.</p>}
      {askingAi ? (
        // Real beacons only: test robots are not sent to the AI.
        <AskAi detected={real} onClose={() => setAskingAi(false)} />
      ) : (
        <>
          <button
            className={`scan-btn${ble.scanning ? " scanning" : ""}`}
            disabled={!ble.supported}
            onClick={() => (ble.scanning ? ble.stop() : ble.start())}
          >
            {ble.scanning ? "Scanning" : "Scan"}
          </button>
          <button className="ai-fab" aria-label="Ask AI about nearby robots" onClick={() => setAskingAi(true)}>
            ✨
          </button>
        </>
      )}
    </main>
  );
}
