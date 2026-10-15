// Attendance per subject, counted in time-grid units (Stunden). Lateness never counts as absent.

import type { Lesson, Part, Unit } from "./model";

export type SubjectStats = {
  subject: string;
  subjectLong: string;
  held: number;
  excused: number;
  unexcused: number;
  present: number;
  /** Present share in percent (0..100), null when no lesson was held. */
  percent: number | null;
};

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Units a lesson covers (a double lesson covers two). Falls back to one unit for odd times. */
function lessonUnits(l: Lesson, units: Unit[]) {
  const covered = units.filter((u) => overlap(l.start, l.end, u.start, u.end) >= (u.end - u.start) / 2);
  return covered.length ? covered.map((u) => [Math.max(l.start, u.start), Math.min(l.end, u.end)] as const) : [[l.start, l.end] as const];
}

export function subjectStats(
  lessons: Lesson[],
  parts: Part[],
  units: Unit[],
  range: { from: string; to: string },
  now: { date: string; minutes: number },
): SubjectStats[] {
  const absent = parts.filter((p) => !p.late);
  const bySubject = new Map<string, SubjectStats>();
  for (const l of lessons) {
    if (l.cancelled || l.date < range.from || l.date > range.to) continue;
    if (l.date > now.date || (l.date === now.date && l.end > now.minutes)) continue; // not held yet
    const s =
      bySubject.get(l.subject) ??
      bySubject
        .set(l.subject, { subject: l.subject, subjectLong: l.subjectLong, held: 0, excused: 0, unexcused: 0, present: 0, percent: null })
        .get(l.subject)!;
    for (const [start, end] of lessonUnits(l, units)) {
      s.held++;
      // Absent when at least half of the unit is covered by a (non-late) absence slice.
      const hit = absent.filter((p) => p.date === l.date && overlap(p.start, p.end, start, end) > 0);
      const missed = hit.reduce((sum, p) => sum + overlap(p.start, p.end, start, end), 0);
      if (missed * 2 >= end - start) {
        if (hit.every((p) => p.excused)) s.excused++;
        else s.unexcused++;
      }
    }
  }
  const out = [...bySubject.values()];
  for (const s of out) {
    s.present = s.held - s.excused - s.unexcused;
    s.percent = s.held ? (s.present / s.held) * 100 : null;
  }
  return out.sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101) || a.subject.localeCompare(b.subject));
}

export function totalStats(stats: SubjectStats[]): SubjectStats {
  const t = stats.reduce(
    (acc, s) => ({ held: acc.held + s.held, excused: acc.excused + s.excused, unexcused: acc.unexcused + s.unexcused }),
    { held: 0, excused: 0, unexcused: 0 },
  );
  const present = t.held - t.excused - t.unexcused;
  return { subject: "Gesamt", subjectLong: "Alle Fächer", ...t, present, percent: t.held ? (present / t.held) * 100 : null };
}

/** Green above 70 %, yellow from 50 %, red below 50 %. */
export function percentTone(percent: number | null): "good" | "warn" | "bad" | "none" {
  if (percent == null) return "none";
  if (percent > 70) return "good";
  if (percent >= 50) return "warn";
  return "bad";
}

/** Subjects the owner counts as one, e.g. BWM = BWM1 + BWM2. A subject belongs to at most one group. */
export type SubjectGroup = { name: string; subjects: string[] };

/** Merges the stats of grouped subjects into one row per group, named after the group. */
export function groupStats(stats: SubjectStats[], groups: SubjectGroup[]): SubjectStats[] {
  const groupOf = new Map(groups.flatMap((g) => g.subjects.map((s) => [s, g] as const)));
  const merged = new Map<string, SubjectStats>();
  const out: SubjectStats[] = [];
  for (const s of stats) {
    const g = groupOf.get(s.subject);
    if (!g) {
      out.push(s);
      continue;
    }
    const m = merged.get(g.name);
    if (!m) {
      const row = { ...s, subject: g.name, subjectLong: g.subjects.filter((x) => stats.some((y) => y.subject === x)).join(" + ") };
      merged.set(g.name, row);
      out.push(row);
    } else {
      m.held += s.held;
      m.excused += s.excused;
      m.unexcused += s.unexcused;
    }
  }
  for (const s of merged.values()) {
    s.present = s.held - s.excused - s.unexcused;
    s.percent = s.held ? (s.present / s.held) * 100 : null;
  }
  return out.sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101) || a.subject.localeCompare(b.subject));
}
