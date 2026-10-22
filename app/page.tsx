"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/auth";
import { useBleScan } from "@/lib/useBleScan";
import { beaconKey, DotModal, Radar, RADAR_RANGE_M, TRIGGER_ATTR, type Beacon } from "./_components/Radar";

export default function HomePage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [testBeacons, setTestBeacons] = useState<Beacon[]>([]);
  // The one open popup (list or radar), by beacon key so it survives the periodic list refresh.
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const ble = useBleScan();

  useEffect(() => {
    if (!getUser()) router.replace("/login");
    else setStarted(true);
  }, [router]);

  // Scanning is on by default once the user is signed in and BLE is available.
  const { supported, start } = ble;
  useEffect(() => {
    if (started && supported) start();
  }, [started, supported, start]);

  if (!started) return null;

  function generateTestBeacons() {
    const n = 1 + Math.floor(Math.random() * 12);
    setTestBeacons(
      Array.from({ length: n }, (_, i) => ({
        uuid: crypto.randomUUID(),
        major: Math.floor(Math.random() * 65536),
        minor: Math.floor(Math.random() * 65536),
        distance: 1 + Math.random() * 49,
        angle: Math.random() * 2 * Math.PI,
      })),
    );
    setMenuOpen(false);
  }

  function resetTestBeacons() {
    setTestBeacons([]);
    setMenuOpen(false);
  }

  // Real beacons are listed only: distance isn't measured yet, so they stay off the radar.
  const inRange = testBeacons.filter((b) => b.distance <= RADAR_RANGE_M);
  const outOfRange = testBeacons.filter((b) => b.distance > RADAR_RANGE_M).sort((a, b) => a.distance - b.distance);

  return (
    <main className="screen">
      <header className="topbar">
        <span className="logo">WeAI</span>
        <button className="icon-btn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      <p className="detected">Detected: {ble.beacons.length + testBeacons.length}</p>

      {menuOpen && (
        <div className="backdrop drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <nav className="drawer" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <button className="ghost" onClick={() => setMenuOpen(false)}>Close</button>
            {testBeacons.length > 0 ? (
              <button onClick={resetTestBeacons}>Reset</button>
            ) : (
              <button onClick={generateTestBeacons}>Test</button>
            )}
          </nav>
        </div>
      )}

      {ble.beacons.length + outOfRange.length > 0 && (
        <ul className="far-list" aria-label="Detected beacons">
          {[
            ...ble.beacons.map((b) => ({ ...b, detail: `${Math.round(b.rssi)} dBm` })),
            ...outOfRange.map((b) => ({ ...b, detail: `${Math.round(b.distance)}m` })),
          ].map((b) => {
            const key = beaconKey(b);
            return (
              <li key={key}>
                <button
                  {...{ [TRIGGER_ATTR]: "" }}
                  className={`far-row${key === pickedKey ? " selected" : ""}`}
                  aria-label={`${b.uuid}, major ${b.major}, minor ${b.minor}, ${b.detail}`}
                  onClick={() => setPickedKey(key === pickedKey ? null : key)}
                >
                  <span className="far-id">
                    <code className="far-uuid">{b.uuid}</code>
                    <span className="far-meta">Major {b.major} · Minor {b.minor}</span>
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

      {ble.error && <p className="toast error">{ble.error}</p>}
      {!ble.supported && <p className="toast muted small">BLE scanning is only available in the Android app.</p>}
      <button
        className={`scan-btn${ble.scanning ? " scanning" : ""}`}
        disabled={!ble.supported}
        onClick={() => (ble.scanning ? ble.stop() : ble.start())}
      >
        {ble.scanning ? "Scanning" : "Scan"}
      </button>
    </main>
  );
}
