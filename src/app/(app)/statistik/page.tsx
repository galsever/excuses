import Link from "next/link";
import { deleteGroup, saveGroup } from "@/app/actions";
import { SubjectCard } from "@/components/subject-card";
import { loadGroups, loadSnapshot } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { groupStats, subjectStats, totalStats } from "@/lib/stats";
import { todayIso, viennaNow } from "@/lib/untis/fetch";

export const metadata = { title: "Statistik · Fehlstunden" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function StatsPage({ searchParams }: PageProps<"/statistik">) {
  await requireSession();
  const snap = loadSnapshot();
  if (!snap) return <p className="py-16 text-center text-sm text-muted">Noch keine Daten.</p>;

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const today = todayIso();
  const [s1, s2] = snap.semesters;
  const current = today >= s2.start ? "s2" : "s1";
  const r = one(params.r) ?? current;
  const ranges = {
    s1: { from: s1.start, to: s1.end, label: s1.name },
    s2: { from: s2.start, to: s2.end, label: s2.name },
    jahr: { from: snap.schoolyear.start, to: snap.schoolyear.end, label: "Schuljahr" },
  } as const;
  const customFrom = one(params.from);
  const customTo = one(params.to);
  const custom = r === "eigene" && customFrom && customTo && ISO.test(customFrom) && ISO.test(customTo);
  const range = custom
    ? { from: customFrom!, to: customTo!, label: "Eigener Zeitraum" }
    : ranges[(r in ranges ? r : current) as keyof typeof ranges];
  const active = custom ? "eigene" : r in ranges ? r : current;

  const groups = loadGroups();
  const stats = groupStats(subjectStats(snap.lessons, snap.parts, snap.units, range, viennaNow()), groups);
  const total = totalStats(stats);
  const subjects = [...new Set(snap.lessons.map((l) => l.subject).filter(Boolean))].sort();

  const chip = (key: string, label: string) => (
    <Link
      key={key}
      href={`/statistik?r=${key}`}
      className={`rounded-full border px-3 py-1 text-sm ${
        active === key ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-muted hover:text-foreground"
      }`}
    >
      {label}
      {key === current && " (aktuell)"}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {chip("s1", s1.name)}
        {chip("s2", s2.name)}
        {chip("jahr", "Schuljahr")}
      </div>
      <form action="/statistik" className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="r" value="eigene" />
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Von</span>
          <input type="date" name="from" defaultValue={custom ? customFrom : range.from} required className="rounded-lg border border-border bg-card px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Bis</span>
          <input type="date" name="to" defaultValue={custom ? customTo : range.to} required className="rounded-lg border border-border bg-card px-2 py-1" />
        </label>
        <button className={`rounded-lg border px-3 py-1.5 ${active === "eigene" ? "border-accent text-accent" : "border-border bg-card"}`}>
          Anzeigen
        </button>
      </form>
      <p className="text-xs text-muted">
        {range.label}: {formatDate(range.from)} bis {formatDate(range.to)}. Gezählt werden gehaltene Stunden bis heute;
        Verspätungen zählen nicht als Fehlstunde.
      </p>

      {stats.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">In diesem Zeitraum wurden noch keine Stunden gehalten.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <SubjectCard s={total} large />
          </div>
          {stats.map((s) => (
            <SubjectCard key={s.subject} s={s} />
          ))}
        </div>
      )}

      <details className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
        <summary className="cursor-pointer font-semibold">Fächer gruppieren</summary>
        {groups.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {groups.map((g) => (
              <li key={g.name} className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-medium">{g.name}</span> <span className="text-muted">{g.subjects.join(" + ")}</span>
                </span>
                <form action={deleteGroup}>
                  <input type="hidden" name="name" value={g.name} />
                  <button className="text-xs text-muted hover:text-bad">Auflösen</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={saveGroup} className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {subjects.map((s) => (
              <label key={s} className="cursor-pointer">
                <input type="checkbox" name="subject" value={s} className="peer sr-only" />
                <span className="inline-block rounded-full border border-border px-3 py-1 text-muted peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-foreground">
                  {s}
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <input name="name" required maxLength={40} placeholder="Name, z.B. BWM" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1" />
            <button className="rounded-lg border border-accent px-3 py-1.5 text-accent">Gruppieren</button>
          </div>
        </form>
      </details>
    </div>
  );
}
