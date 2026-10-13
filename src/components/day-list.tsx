"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DayCard } from "./day-card";

export type EntryView = {
  id: number;
  time: string;
  units: string;
  late: boolean;
  lateMinutes: number;
  untisReason: string;
  excused: boolean;
};

export type DayView = {
  date: string;
  label: string;
  status: "excused" | "partial" | "open";
  reason: string;
  exportedAt: string | null;
  entries: EntryView[];
};

export function DayList({ days }: { days: DayView[] }) {
  const router = useRouter();
  const [reasons, setReasons] = useState(() => new Map(days.map((d) => [d.date, d.reason])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = days.filter((d) => d.status !== "excused" && !(reasons.get(d.date) ?? "").trim()).length;

  const toggle = (date: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(date);
      else next.delete(date);
      return next;
    });

  async function exportPdf() {
    setExporting(true);
    setError(null);
    try {
      const dates = [...selected].sort();
      const res = await fetch(`/api/export?dates=${dates.join(",")}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "Entschuldigung.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fehlgeschlagen");
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {open > 0 && (
        <p className="mb-4 text-sm text-muted">
          {open === 1 ? "1 Tag ist" : `${open} Tage sind`} noch offen und ohne Grund.
        </p>
      )}
      <div className="space-y-3">
        {days.map((d) => (
          <DayCard
            key={d.date}
            day={d}
            reason={reasons.get(d.date) ?? ""}
            onReason={(r) => {
              setReasons((prev) => new Map(prev).set(d.date, r));
              if (!r.trim()) toggle(d.date, false);
            }}
            selected={selected.has(d.date)}
            onSelect={(on) => toggle(d.date, on)}
          />
        ))}
      </div>
      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <span className="text-sm">
              {selected.size === 1 ? "1 Tag" : `${selected.size} Tage`} ausgewählt
              {error && <span className="ml-2 text-bad">{error}</span>}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground">
                Abwählen
              </button>
              <button
                onClick={exportPdf}
                disabled={exporting}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-60"
              >
                {exporting ? "Erstelle PDF..." : "PDF erstellen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
