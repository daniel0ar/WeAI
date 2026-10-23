"use client";

import { Capacitor } from "@capacitor/core";
import { BleClient, ScanMode } from "@capacitor-community/bluetooth-le";
import { useCallback, useEffect, useRef, useState } from "react";
import { APPLE_COMPANY_ID, isOurs, parseIBeacon } from "./ibeacon";

// Web Bluetooth's requestLEScan is experimental and missing from @types/web-bluetooth.
interface LEScan {
  active: boolean;
  stop(): void;
}
type BluetoothWithScan = Bluetooth & {
  requestLEScan(options: { acceptAllAdvertisements: boolean; keepRepeatedDevices?: boolean }): Promise<LEScan>;
};
type AdvertisementEvent = Event & { manufacturerData: Map<number, DataView>; rssi?: number };

const RSSI_SMOOTHING = 0.3; // EMA weight of the newest sample
const PUBLISH_MS = 5000;
// Kept for two missed update windows, so one quiet window doesn't make a beacon blink out.
const STALE_MS = 15000;

export interface DetectedBeacon {
  uuid: string;
  major: number;
  minor: number;
  rssi: number; // smoothed, dBm
}

interface Tracked {
  uuid: string;
  major: number;
  minor: number;
  rssiAt1m: number;
  rssi: number;
  seenAt: number;
}

const isNative = () => Capacitor.isNativePlatform();

export interface RawSample {
  uuid: string;
  major: number;
  minor: number;
  rssi: number; // unsmoothed, dBm
}

// onSample sees every advertisement before smoothing (used by calibration).
export function useBleScan(onSample?: (s: RawSample) => void) {
  const sampleCb = useRef(onSample);
  useEffect(() => {
    sampleCb.current = onSample;
  });
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [beacons, setBeacons] = useState<DetectedBeacon[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tracked = useRef(new Map<string, Tracked>());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scan = useRef<LEScan | null>(null);
  const listener = useRef<((e: Event) => void) | null>(null);

  useEffect(() => {
    setSupported(isNative() || ("bluetooth" in navigator && "requestLEScan" in navigator.bluetooth));
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (isNative()) {
      BleClient.stopLEScan().catch(() => {});
      BleClient.stopEnabledNotifications().catch(() => {});
    } else {
      scan.current?.stop();
      scan.current = null;
      if (listener.current) {
        navigator.bluetooth.removeEventListener("advertisementreceived", listener.current);
        listener.current = null;
      }
    }
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    tracked.current.clear();
    setBeacons([]);
    const onFrame = (data: DataView | undefined, rssi: number | undefined) => {
      const frame = data && rssi !== undefined ? parseIBeacon(data) : null;
      if (!frame || rssi === undefined || !isOurs(frame)) return;
      sampleCb.current?.({ uuid: frame.uuid, major: frame.major, minor: frame.minor, rssi });
      const key = `${frame.uuid}:${frame.major}:${frame.minor}`;
      const prev = tracked.current.get(key);
      tracked.current.set(key, {
        ...frame,
        rssi: prev ? prev.rssi + RSSI_SMOOTHING * (rssi - prev.rssi) : rssi,
        seenAt: Date.now(),
      });
    };
    timer.current = setInterval(() => {
      const now = Date.now();
      const list: DetectedBeacon[] = [];
      for (const [key, t] of tracked.current) {
        if (now - t.seenAt > STALE_MS) tracked.current.delete(key);
        else list.push({ uuid: t.uuid, major: t.major, minor: t.minor, rssi: t.rssi });
      }
      // Fixed order so entries don't swap places as their RSSI fluctuates.
      setBeacons(list.sort((a, b) => a.uuid.localeCompare(b.uuid) || a.major - b.major || a.minor - b.minor));
    }, PUBLISH_MS);
    try {
      if (isNative()) {
        await BleClient.initialize({ androidNeverForLocation: false });
        // A scan started with the adapter off fails silently, so check first and offer to turn it on.
        if (!(await BleClient.isEnabled())) {
          await BleClient.requestEnable().catch(() => {});
          if (!(await BleClient.isEnabled())) throw new Error("Bluetooth is off. Turn it on to scan.");
        }
        // Android drops all scan results while Location is off.
        if (!(await BleClient.isLocationEnabled())) throw new Error("Location is off. Turn it on to detect beacons.");
        await BleClient.startEnabledNotifications((on) => {
          if (on) return;
          stop();
          setError("Bluetooth was turned off.");
        });
        // Duplicates are needed: every repeated advertisement carries a fresh RSSI sample, and
        // low latency gives the most of them (Android's default, balanced, samples sparsely).
        await BleClient.requestLEScan({ allowDuplicates: true, scanMode: ScanMode.SCAN_MODE_LOW_LATENCY }, (r) => onFrame(r.manufacturerData?.[APPLE_COMPANY_ID], r.rssi));
      } else {
        const onAdvert = (e: Event) => {
          const a = e as AdvertisementEvent;
          onFrame(a.manufacturerData.get(APPLE_COMPANY_ID), a.rssi);
        };
        navigator.bluetooth.addEventListener("advertisementreceived", onAdvert);
        listener.current = onAdvert;
        scan.current = await (navigator.bluetooth as BluetoothWithScan).requestLEScan({
          acceptAllAdvertisements: true,
          keepRepeatedDevices: true,
        });
      }
      setScanning(true);
    } catch (e) {
      stop();
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { supported, scanning, beacons, error, start, stop };
}
