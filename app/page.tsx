"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, logout } from "@/lib/auth";
import { useBleScan } from "@/lib/useBleScan";
import { useDeadReckoning } from "@/lib/useDeadReckoning";
import { MapView } from "./_components/MapView";

export default function HomePage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const ble = useBleScan();
  const nav = useDeadReckoning();

  useEffect(() => {
    if (!getUser()) router.replace("/login");
    else setStarted(true);
  }, [router]);

  if (!started) return null;

  return (
    <main className="center top">
      <div className="card wide">
        <header className="row">
          <h1>BLE Scout</h1>
          <button
            className="ghost"
            onClick={() => {
              ble.stop();
              nav.stop();
              logout();
              router.replace("/login");
            }}
          >
            Exit
          </button>
        </header>

        <section>
          <MapView x={nav.pos.x} y={nav.pos.y} heading={nav.heading} />
          <div className="row controls">
            {nav.tracking ? (
              <button onClick={nav.stop}>Stop tracking</button>
            ) : (
              <button onClick={nav.start}>Start tracking</button>
            )}
            <button className="ghost" onClick={nav.reset}>
              Reset
            </button>
            <span className="muted small">
              {nav.steps} steps · {Math.round(nav.heading)}°
            </span>
          </div>
          {nav.error && <p className="error">{nav.error}</p>}
          <p className="muted small">
            Hold the phone flat, pointing the way you face. Your first reading counts as facing the top of the map.
          </p>
        </section>

        <section>
          <h2>Robot count</h2>
          <p className="count">{ble.count}</p>
          {ble.error && <p className="error">{ble.error}</p>}
          {ble.supported ? (
            ble.scanning ? (
              <button onClick={ble.stop}>Stop scan</button>
            ) : (
              <button onClick={ble.start}>Start scan</button>
            )
          ) : (
            <p className="muted small">
              BLE scanning is unavailable here. Use the Android app, or Chrome with{" "}
              <code>chrome://flags/#enable-experimental-web-platform-features</code> enabled.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
