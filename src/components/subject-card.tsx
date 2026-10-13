import { formatPercent, hours } from "@/lib/format";
import { percentTone, type SubjectStats } from "@/lib/stats";

const TONE = { good: "text-good", warn: "text-warn", bad: "text-bad", none: "text-muted" } as const;

export function SubjectCard({ s, large = false }: { s: SubjectStats; large?: boolean }) {
  const pct = (n: number) => (s.held ? (n / s.held) * 100 : 0);
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{s.subject}</h2>
          <p className="truncate text-xs text-muted">{s.subjectLong}</p>
        </div>
        <span className={`shrink-0 font-semibold tabular-nums ${large ? "text-4xl" : "text-3xl"} ${TONE[percentTone(s.percent)]}`}>
          {formatPercent(s.percent)}
        </span>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-border" role="img" aria-label="Anteil anwesend, entschuldigt, unentschuldigt">
        <div className="bg-good" style={{ width: `${pct(s.present)}%` }} />
        <div className="bg-excused" style={{ width: `${pct(s.excused)}%` }} />
        <div className="bg-bad" style={{ width: `${pct(s.unexcused)}%` }} />
      </div>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <div>
          <dt className="inline">Gehalten </dt>
          <dd className="inline font-medium text-foreground">{hours(s.held)}</dd>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-excused" />
          <dt className="inline">Entschuldigt </dt>
          <dd className="inline font-medium text-foreground">{s.excused}</dd>
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-bad" />
          <dt className="inline">Unentschuldigt </dt>
          <dd className="inline font-medium text-foreground">{s.unexcused}</dd>
        </div>
      </dl>
    </article>
  );
}
