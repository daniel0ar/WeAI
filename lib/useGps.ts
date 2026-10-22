"use client";

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { useCallback, useEffect, useRef, useState } from "react";

type Permission = PermissionState | "unknown";
type Coords = Pick<GeolocationCoordinates, "latitude" | "longitude" | "accuracy">;

export function useGps() {
  const [position, setPosition] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Permission>("unknown");
  const watchId = useRef<string | null>(null);

  const stopWatch = useCallback(() => {
    if (watchId.current !== null) Geolocation.clearWatch({ id: watchId.current });
    watchId.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!Capacitor.isNativePlatform() && !window.isSecureContext) {
      setError("Geolocation needs HTTPS (or localhost). This page is served over an insecure connection.");
      return;
    }
    stopWatch();
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await Geolocation.requestPermissions();
        if (perm.location === "denied") {
          setPermission("denied");
          return;
        }
        setPermission("granted");
      }
      watchId.current = await Geolocation.watchPosition(
        { enableHighAccuracy: true, maximumAge: 5000 },
        (p, err) => {
          if (err) return setError(err.message || "Unable to get location.");
          if (p) {
            setError(null);
            setPosition(p.coords);
          }
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to get location.");
    }
  }, [stopWatch]);

  useEffect(() => {
    let status: PermissionStatus | undefined;
    const onChange = () => {
      if (!status) return;
      setPermission(status.state);
      if (status.state === "granted") start();
    };
    if (Capacitor.isNativePlatform()) {
      Geolocation.checkPermissions()
        .then((p) => {
          setPermission(p.location === "granted" ? "granted" : p.location === "denied" ? "denied" : "prompt");
          if (p.location === "granted") start();
        })
        .catch(() => {});
    } else {
      navigator.permissions
        ?.query({ name: "geolocation" })
        .then((s) => {
          status = s;
          s.addEventListener("change", onChange);
          onChange();
        })
        .catch(() => {});
    }
    return () => {
      status?.removeEventListener("change", onChange);
      stopWatch();
    };
  }, [start, stopWatch]);

  return { position, error, permission, start };
}
