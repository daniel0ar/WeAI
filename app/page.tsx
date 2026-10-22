"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser } from "@/lib/auth";
import { useBleScan } from "@/lib/useBleScan";
import { useDeadReckoning } from "@/lib/useDeadReckoning";
import { MapView } from "./_components/MapView";

export default function HomePage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const ble = useBleScan();
  const nav = useDeadReckoning();

  useEffect(() => {
    if (!getUser()) router.replace("/login");
    else setStarted(true);
  }, [router]);

  if (!started) return null;

  function toggleScan() {
    if (ble.scanning) {
      ble.stop();
      setShowResult(true);
    } else {
      setShowResult(false);
      ble.start();
    }
  }

  return (
    <main className="screen">
      <MapView x={nav.pos.x} y={nav.pos.y} heading={nav.heading} />

      <div className="menu">
        <button className="icon-btn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {menuOpen && (
          <div className="menu-panel">
            <button
              onClick={() => {
                (nav.tracking ? nav.stop : nav.start)();
                setMenuOpen(false);
              }}
            >
              {nav.tracking ? "Stop tracking" : "Start tracking"}
            </button>
            <button
              onClick={() => {
                nav.reset();
                setMenuOpen(false);
              }}
            >
              Reset
            </button>
            <p className="muted small">
              {nav.steps} steps · {Math.round(nav.heading)}°
            </p>
            {nav.error && <p className="error small">{nav.error}</p>}
          </div>
        )}
      </div>

      {ble.error && <p className="toast error">{ble.error}</p>}
      {!ble.supported && <p className="toast muted small">BLE scanning is only available in the Android app.</p>}
      <button
        className={`fab${ble.scanning ? " scanning" : ""}`}
        aria-label={ble.scanning ? "Stop Bluetooth scan" : "Start Bluetooth scan"}
        disabled={!ble.supported}
        onClick={toggleScan}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 7l10 10-5 5V2l5 5L7 17" />
        </svg>
      </button>

      {showResult && (
        <div className="backdrop" onClick={() => setShowResult(false)}>
          <div className="modal" role="dialog" aria-label="Robot count" onClick={(e) => e.stopPropagation()}>
            <button className="close" aria-label="Close" onClick={() => setShowResult(false)}>
              ×
            </button>
            <h2>Robot count</h2>
            <p className="count">{ble.count}</p>
          </div>
        </div>
      )}
    </main>
  );
}
