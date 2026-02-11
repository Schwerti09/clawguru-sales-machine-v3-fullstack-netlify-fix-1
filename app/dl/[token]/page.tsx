"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function RedeemPage({ params }: { params: { token: string } }) {
  const [state, setState] = useState<"loading"|"ok"|"error">("loading");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/redeem?token=${encodeURIComponent(params.token)}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMsg(data?.error || "Redeem failed.");
        return;
      }
      setState("ok");
    })();
  }, [params.token]);

  return (
    <div className="card">
      <div className="badge">Secure delivery</div>
      <h1>{state === "ok" ? "Access activated ✓" : state === "error" ? "Link problem" : "Activating…"}</h1>
      <p style={{ color: "var(--muted)" }}>
        {state === "ok"
          ? "You can now open the dashboard and downloads on this device."
          : state === "error"
          ? msg
          : "Verifying token and activating access…"}
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <Link className="btn primary" href="/downloads">Go to downloads</Link>
        <Link className="btn" href="/dashboard">Dashboard</Link>
        <Link className="btn" href="/pricing">Pricing</Link>
      </div>
    </div>
  );
}
