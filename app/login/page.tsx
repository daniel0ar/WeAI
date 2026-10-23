"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getUser, login } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (getUser()) router.replace("/");
  }, [router]);

  return (
    <main className="center">
      <div className="card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/weai-logo-white.png" alt="WeAI" className="brand-logo" />
        <p className="muted">GPS location and nearby BLE devices</p>
        <button
          onClick={() => {
            login("started");
            router.replace("/");
          }}
        >
          Start
        </button>
      </div>
    </main>
  );
}
