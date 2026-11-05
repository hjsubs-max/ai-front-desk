"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSandbox, type Sandbox } from "@/lib/client/store";
import { setView } from "@/lib/client/track";
import Banner from "../Banner";

const NAV = [
  { href: "/ops", label: "Inbox", key: "inbox" },
  { href: "/ops/asked", label: "What parents asked", key: "asked" },
  { href: "/ops/source", label: "Source of truth", key: "source" },
  { href: "/ops/usage", label: "Usage", key: "usage" },
];

export default function OpsShell({ active, children }: { active: string; children: (s: Sandbox) => React.ReactNode }) {
  const s = useSandbox();
  const [, setTick] = useState(0);
  useEffect(() => {
    setView("ops");
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!s) return <div aria-busy="true" />;
  const openCount = s.inbox.filter((i) => i.status === "open").length;
  return (
    <div>
      <Banner s={s} />
      <header className="ops-header">
        <div className="stack" style={{ gap: 2 }}>
          <span className="xs muted">{s.knowledge.center.name}</span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>Front desk control center</span>
        </div>
        <span className="small muted">Signed in as {s.knowledge.center.director}, Director</span>
      </header>
      <div className="ops-wrap">
        <nav className="ops-nav" aria-label="Control center">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} className={active === n.key ? "on" : ""} aria-current={active === n.key ? "page" : undefined}>
              {n.label}
              {n.key === "inbox" && openCount > 0 && <span className="count">{openCount}</span>}
            </Link>
          ))}
          <Link href="/parent" className="small" style={{ color: "var(--muted)" }}>
            Open the parent desk
          </Link>
          <Link href="/team" className="small" style={{ color: "var(--muted)" }}>
            brightwheel team view
          </Link>
        </nav>
        <main className="ops-main">{children(s)}</main>
      </div>
    </div>
  );
}
