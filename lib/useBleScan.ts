"use client";

import { Capacitor } from "@capacitor/core";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { useCallback, useEffect, useRef, useState } from "react";

// Web Bluetooth's requestLEScan is experimental and missing from @types/web-bluetooth.
interface LEScan {
  active: boolean;
  stop(): void;
}
type BluetoothWithScan = Bluetooth & {
  requestLEScan(options: { acceptAllAdvertisements: boolean; keepRepeatedDevices?: boolean }): Promise<LEScan>;
};
type AdvertisementEvent = Event & { device: BluetoothDevice };

const isNative = () => Capacitor.isNativePlatform();

export function useBleScan() {
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  const scan = useRef<LEScan | null>(null);
  const listener = useRef<((e: Event) => void) | null>(null);

  useEffect(() => {
    setSupported(isNative() || ("bluetooth" in navigator && "requestLEScan" in navigator.bluetooth));
  }, []);

  const stop = useCallback(() => {
    if (isNative()) {
      BleClient.stopLEScan().catch(() => {});
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
    seen.current.clear();
    setCount(0);
    const add = (id: string) => {
      if (!seen.current.has(id)) {
        seen.current.add(id);
        setCount(seen.current.size);
      }
    };
    try {
      if (isNative()) {
        await BleClient.initialize({ androidNeverForLocation: true });
        await BleClient.requestLEScan({ allowDuplicates: false }, (r) => add(r.device.deviceId));
      } else {
        const onAdvert = (e: Event) => add((e as AdvertisementEvent).device.id);
        navigator.bluetooth.addEventListener("advertisementreceived", onAdvert);
        listener.current = onAdvert;
        scan.current = await (navigator.bluetooth as BluetoothWithScan).requestLEScan({
          acceptAllAdvertisements: true,
          keepRepeatedDevices: false,
        });
      }
      setScanning(true);
    } catch (e) {
      stop();
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { supported, scanning, count, error, start, stop };
}
