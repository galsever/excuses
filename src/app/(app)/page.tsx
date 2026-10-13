import { DayList, type DayView } from "@/components/day-list";
import { loadNotes, loadSnapshot } from "@/lib/db";
import { formatDay, formatRange, formatUnits } from "@/lib/format";
import { groupDays } from "@/lib/model";
import { requireSession } from "@/lib/session";

export default async function AbsencesPage() {
  await requireSession();
  const snap = loadSnapshot();
  if (!snap) {
    return <p className="py-16 text-center text-sm text-muted">Noch keine Daten. Sie werden gerade aus WebUntis geladen.</p>;
  }
  const notes = loadNotes();
  const days: DayView[] = groupDays(snap.absences).map((d) => {
    const note = notes.get(d.date);
    const excused = d.absences.filter((a) => a.excused).length;
    return {
      date: d.date,
      label: formatDay(d.date, true),
      status: excused === d.absences.length ? "excused" : excused ? "partial" : "open",
      reason: note?.reason ?? "",
      exportedAt: note?.exportedAt ?? null,
      entries: d.absences.map((a) => ({
        id: a.id,
        time: formatRange(a.start, a.end),
        units: formatUnits(a.units),
        late: a.late,
        lateMinutes: a.lateMinutes,
        untisReason: a.untisReason,
        excused: a.excused,
      })),
    };
  });
  if (!days.length) return <p className="py-16 text-center text-sm text-muted">Keine Abwesenheiten in diesem Schuljahr.</p>;
  return <DayList days={days} />;
}
