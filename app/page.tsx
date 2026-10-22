"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getUser, logout } from "@/lib/auth";
import { useGps } from "@/lib/useGps";
import { useBleScan } from "@/lib/useBleScan";

export default function HomePage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const gps = useGps();
  const ble = useBleScan();

  useEffect(() => {
    if (!getUser()) router.replace("/login");
    else setStarted(true);
  }, [router]);

  if (!started) return null;

  return (
    <main className="center">
      <div className="card wide">
        <header className="row">
          <h1>RobotFind</h1>
          <button
            className="ghost"
            onClick={() => {
              ble.stop();
              logout();
              router.replace("/login");
            }}
          >
            Exit
          </button>
        </header>

        <section>
          <h2>GPS location</h2>
          {gps.error && <p className="error">{gps.error}</p>}
          {gps.position ? (
            <dl>
              <dt>Latitude</dt>
              <dd>{gps.position.latitude.toFixed(6)}</dd>
              <dt>Longitude</dt>
              <dd>{gps.position.longitude.toFixed(6)}</dd>
              <dt>Accuracy</dt>
              <dd>±{Math.round(gps.position.accuracy)} m</dd>
            </dl>
          ) : gps.permission === "denied" ? (
            <p className="muted small">
              Location is blocked for this site. Click the icon left of the address bar, allow Location, then reload.
            </p>
          ) : gps.permission === "granted" ? (
            <p className="muted">Waiting for location…</p>
          ) : (
            <button onClick={gps.start}>Enable location</button>
          )}
        </section>

        <section>
          <h2>Bluetooth LE devices</h2>
          <p className="count">{ble.count}</p>
          <p className="muted small">unique devices detected this scan</p>
          {ble.error && <p className="error">{ble.error}</p>}
          {ble.supported ? (
            ble.scanning ? (
              <button onClick={ble.stop}>Stop scan</button>
            ) : (
              <button onClick={ble.start}>Start scan</button>
            )
          ) : (
            <p className="muted small">
              BLE scanning is unavailable here. It needs Chrome/Edge over HTTPS with{" "}
              <code>chrome://flags/#enable-experimental-web-platform-features</code> enabled.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
