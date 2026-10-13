"use client";

import { useEffect, useRef, useState } from "react";
import { saveReason } from "@/app/actions";
import type { DayView } from "./day-list";

const STATUS = {
  excused: { label: "entschuldigt", cls: "bg-good/15 text-good" },
  partial: { label: "teilweise entschuldigt", cls: "bg-warn/15 text-warn" },
  open: { label: "offen", cls: "bg-bad/15 text-bad" },
} as const;

type Props = {
  day: DayView;
  reason: string;
  onReason: (reason: string) => void;
  selected: boolean;
  onSelect: (on: boolean) => void;
};

export function DayCard({ day, reason, onReason, selected, onSelect }: Props) {
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const status = STATUS[day.status];

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function change(value: string) {
    onReason(value);
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await saveReason(day.date, value);
        setSaved("saved");
      } catch {
        setSaved("error");
      }
    }, 600);
  }

  const canSelect = reason.trim().length > 0;

  return (
    <article className={`rounded-2xl border bg-card p-4 shadow-sm ${selected ? "border-accent" : "border-border"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{day.label}</h2>
          {day.exportedAt && (
            <p className="text-xs text-muted">Im PDF seit {new Date(day.exportedAt).toLocaleDateString("de-AT")}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>{status.label}</span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {day.entries.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-mono tabular-nums">{e.time}</span>
            {e.units && <span className="text-muted">{e.units}</span>}
            {e.late ? (
              <span className="rounded-md bg-warn/15 px-1.5 py-0.5 text-xs text-warn">Verspätung · {e.lateMinutes} Min.</span>
            ) : (
              e.lateMinutes > 0 && (
                <span className="rounded-md bg-warn/15 px-1.5 py-0.5 text-xs text-warn">davon {e.lateMinutes} Min. Verspätung</span>
              )
            )}
            {e.untisReason && e.untisReason !== "Verspätung" && (
              <span className="text-xs text-muted">WebUntis: {e.untisReason}</span>
            )}
            {day.status === "partial" && (
              <span className={`text-xs ${e.excused ? "text-good" : "text-bad"}`}>{e.excused ? "entschuldigt" : "offen"}</span>
            )}
          </li>
        ))}
      </ul>

      <textarea
        value={reason}
        onChange={(ev) => change(ev.target.value)}
        rows={2}
        placeholder="Grund, z. B. Krankheit oder Arzttermin"
        className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className={`flex items-center gap-2 text-sm ${canSelect ? "" : "text-muted"}`}>
          <input
            type="checkbox"
            checked={selected}
            disabled={!canSelect}
            onChange={(ev) => onSelect(ev.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Für PDF auswählen
        </label>
        <span className="text-xs text-muted" aria-live="polite">
          {saved === "saving" ? "Speichere..." : saved === "saved" ? "Gespeichert" : saved === "error" ? "Nicht gespeichert" : ""}
        </span>
      </div>
    </article>
  );
}
