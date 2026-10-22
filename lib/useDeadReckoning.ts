"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAP_H, MAP_W, STEP_M, startPosition } from "@/lib/mapData";

const STEP_THRESHOLD = 1.0; // m/s² above the gravity baseline
const MIN_STEP_MS = 300;

// Compass heading (clockwise from north) of the way the phone is pointing:
// its top edge when held flat, its back when held upright.
function headingFrom(alpha: number, beta: number, gamma: number) {
  const r = Math.PI / 180;
  const [cA, sA, cB, sB, cG, sG] = [
    Math.cos(alpha * r), Math.sin(alpha * r),
    Math.cos(beta * r), Math.sin(beta * r),
    Math.cos(gamma * r), Math.sin(gamma * r),
  ];
  const top = { e: -sA * cB, n: cA * cB };
  const back = { e: -(cA * sG + sA * sB * cG), n: -(sA * sG - cA * sB * cG) };
  const v = Math.hypot(top.e, top.n) >= Math.hypot(back.e, back.n) ? top : back;
  return ((Math.atan2(v.e, v.n) * 180) / Math.PI + 360) % 360;
}

type OrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

export function useDeadReckoning() {
  const [pos, setPos] = useState(startPosition);
  const [heading, setHeading] = useState(0); // relative to map-up
  const [steps, setSteps] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useRef<(() => void) | null>(null);
  const reference = useRef<number | null>(null); // compass heading that counts as map-up
  const smooth = useRef({ s: 0, c: 0, ready: false });
  const relHeading = useRef(0);

  const stop = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setTracking(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      // iOS needs an explicit permission; Android WebView does not.
      const D = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
      if (typeof D.requestPermission === "function" && (await D.requestPermission()) !== "granted") {
        setError("Motion sensor permission was denied.");
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    reference.current = null;
    smooth.current = { s: 0, c: 0, ready: false };

    const onOrientation = (ev: Event) => {
      const e = ev as OrientationEvent;
      let compass: number | null = null;
      if (typeof e.webkitCompassHeading === "number") compass = e.webkitCompassHeading;
      else if (e.alpha !== null && e.beta !== null && e.gamma !== null) {
        compass = headingFrom(e.alpha, e.beta, e.gamma);
      }
      if (compass === null) return;

      const rad = (compass * Math.PI) / 180;
      const m = smooth.current;
      const k = m.ready ? 0.15 : 1;
      m.s = m.s * (1 - k) + Math.sin(rad) * k;
      m.c = m.c * (1 - k) + Math.cos(rad) * k;
      m.ready = true;
      const smoothed = ((Math.atan2(m.s, m.c) * 180) / Math.PI + 360) % 360;

      // The first reading is "facing the top of the map".
      if (reference.current === null) reference.current = smoothed;
      relHeading.current = (smoothed - reference.current + 360) % 360;
      setHeading(relHeading.current);
    };

    let base = 9.81;
    let low = 9.81;
    let armed = true;
    let lastStep = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null || a.y === null || a.z === null) return;
      const mag = Math.hypot(a.x, a.y, a.z);
      low += 0.3 * (mag - low);
      base += 0.02 * (mag - base);
      const d = low - base;
      const now = performance.now();
      if (armed && d > STEP_THRESHOLD && now - lastStep > MIN_STEP_MS) {
        armed = false;
        lastStep = now;
        if (reference.current === null) return;
        const rad = (relHeading.current * Math.PI) / 180;
        setSteps((n) => n + 1);
        setPos((p) => ({
          x: Math.min(MAP_W, Math.max(0, p.x + STEP_M * Math.sin(rad))),
          y: Math.min(MAP_H, Math.max(0, p.y - STEP_M * Math.cos(rad))),
        }));
      } else if (d < STEP_THRESHOLD * 0.3) {
        armed = true;
      }
    };

    const orientationEvent = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(orientationEvent, onOrientation);
    window.addEventListener("devicemotion", onMotion);
    cleanup.current = () => {
      window.removeEventListener(orientationEvent, onOrientation);
      window.removeEventListener("devicemotion", onMotion);
    };
    setTracking(true);
  }, []);

  const reset = useCallback(() => {
    setPos(startPosition());
    setSteps(0);
    setHeading(0);
    reference.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  return { pos, heading, steps, tracking, error, start, stop, reset };
}
