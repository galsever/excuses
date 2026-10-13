"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncNow } from "@/app/actions";
import type { SyncStatus } from "@/lib/sync";

function ago(iso: string | null) {
  if (!iso) return "noch nie";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  return new Date(iso).toLocaleDateString("de-AT");
}

export function SyncBar({ status: initial }: { status: SyncStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [pending, start] = useTransition();
  const [, tick] = useState(0);
  const autoStarted = useRef(false);

  const run = (force: boolean) =>
    start(async () => {
      setStatus(await syncNow(force));
      router.refresh();
    });

  // Pull fresh data when the stored snapshot is older than 30 minutes.
  useEffect(() => {
    if (!autoStarted.current && initial.stale && !initial.blocked) {
      autoStarted.current = true;
      run(false);
    }
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-end pb-2 text-right">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">{pending ? "Lade aus WebUntis..." : `Stand ${ago(status.lastSync)}`}</span>
        <button
          onClick={() => run(true)}
          disabled={pending || status.blocked}
          title="Aus WebUntis aktualisieren"
          aria-label="Aus WebUntis aktualisieren"
          className="rounded-lg border border-border bg-card p-1.5 text-muted hover:text-foreground disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
      {status.lastError && !pending && <p className="mt-1 max-w-xs text-xs text-bad">{status.lastError}</p>}
    </div>
  );
}
