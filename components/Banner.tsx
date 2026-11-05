"use client";

import Link from "next/link";
import { fmtShort, fmtTime } from "@/lib/dates";
import { demoNow, resetSandbox, setClock, type ClockMode, type Sandbox } from "@/lib/client/store";

export default function Banner({ s, compact }: { s: Sandbox; compact?: boolean }) {
  const now = demoNow(s);
  return (
    <div className="banner" role="region" aria-label="Prototype notice">
      <span>Take-home prototype · fictional center and data</span>
      <span className="row" style={{ gap: 6 }}>
        <label htmlFor="clock" className="sr-only">
          Demo time
        </label>
        <select
          id="clock"
          value={s.clock.mode}
          onChange={(e) => setClock(e.target.value as ClockMode)}
          title="Try the desk at drop-off or pickup"
        >
          <option value="dropoff">Drop-off</option>
          <option value="pickup">Pickup</option>
          <option value="real">Real time</option>
        </select>
        <span aria-live="polite">
          {fmtShort(now.date)}, {fmtTime(now.minutes)}
        </span>
        {!compact && (
          <>
            <span aria-hidden="true">·</span>
            <Link href="/">About</Link>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Start the demo over? Your questions and edits in this browser will be cleared.")) resetSandbox();
              }}
              style={{ background: "none", border: 0, color: "#cfc6ff", textDecoration: "underline", padding: 0, fontSize: 12 }}
            >
              Reset demo
            </button>
          </>
        )}
      </span>
    </div>
  );
}
