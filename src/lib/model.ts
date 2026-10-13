// Turns a raw WebUntis pull into the shapes the UI, the stats and the PDF work with.
// Times are minutes since midnight, dates ISO strings (YYYY-MM-DD).

import { fromUntisDate } from "./untis/fetch";
import type { RawAbsenceTime, RawSnapshot } from "./untis/types";

export type Unit = { name: string; start: number; end: number };
export type Lesson = { date: string; start: number; end: number; subject: string; subjectLong: string; cancelled: boolean };
/** A lesson-sized slice of an absence. `late` slices never count against attendance. */
export type Part = { absenceId: number; date: string; start: number; end: number; late: boolean; excused: boolean; minutes: number };
export type Absence = {
  id: number;
  date: string;
  start: number;
  end: number;
  excused: boolean;
  /** Status text from WebUntis, e.g. "entschuldigt". */
  status: string | null;
  /** Reason WebUntis has on file, e.g. "Krankheit" (not the user's own reason). */
  untisReason: string;
  /** Whole absence is lateness. */
  late: boolean;
  /** Minutes of lateness inside this absence (also set for mixed absences). */
  lateMinutes: number;
  /** Lesson numbers of the time grid this absence touches, e.g. ["3", "4"]. */
  units: string[];
};
export type Semester = { name: string; start: string; end: string };
export type Snapshot = {
  fetchedAt: string;
  name: string;
  klasse: string;
  schoolyear: { name: string; start: string; end: string };
  semesters: Semester[];
  units: Unit[];
  lessons: Lesson[];
  parts: Part[];
  absences: Absence[];
};

export const toMinutes = (hhmm: number) => Math.floor(hhmm / 100) * 60 + (hhmm % 100);

export function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Semester 1 ends before the Semesterferien, semester 2 starts after them. */
export function semesters(raw: Pick<RawSnapshot, "schoolyear" | "holidays">): Semester[] {
  const start = fromUntisDate(raw.schoolyear.startDate);
  const end = fromUntisDate(raw.schoolyear.endDate);
  const brk = raw.holidays
    .map((h) => ({ name: `${h.name} ${h.longName}`, start: fromUntisDate(h.startDate), end: fromUntisDate(h.endDate) }))
    .find((h) => /semester/i.test(h.name) && h.start > start && h.end < end);
  let breakStart: string;
  let breakEnd: string;
  if (brk) {
    breakStart = brk.start;
    breakEnd = brk.end;
  } else {
    // Vienna: the first full week (Mon to Sun) of February.
    const year = Number(end.slice(0, 4));
    let monday = `${year}-02-01`;
    while (new Date(monday + "T12:00:00Z").getUTCDay() !== 1) monday = addDays(monday, 1);
    breakStart = monday;
    breakEnd = addDays(monday, 6);
  }
  return [
    { name: "1. Semester", start, end: addDays(breakStart, -1) },
    { name: "2. Semester", start: addDays(breakEnd, 1), end },
  ];
}

function timeUnits(raw: RawSnapshot): Unit[] {
  // The grid is the same every weekday at Spengergasse; take the day with the most units.
  const day = [...raw.timegrid].sort((a, b) => b.timeUnits.length - a.timeUnits.length)[0];
  return (day?.timeUnits ?? []).map((u) => ({ name: u.name, start: toMinutes(u.startTime), end: toMinutes(u.endTime) }));
}

function lessons(raw: RawSnapshot): Lesson[] {
  const seen = new Set<string>();
  const out: Lesson[] = [];
  for (const l of raw.lessons) {
    const su = l.su?.[0];
    if (!su) continue; // excursions, events: no subject, not part of the stats
    const lesson = {
      date: fromUntisDate(l.date),
      start: toMinutes(l.startTime),
      end: toMinutes(l.endTime),
      subject: su.name,
      subjectLong: su.longname || su.name,
      cancelled: l.code === "cancelled",
    };
    const key = `${lesson.date}|${lesson.start}|${lesson.end}|${lesson.subject}|${lesson.cancelled}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lesson);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
}

function toPart(t: RawAbsenceTime, late: boolean): Part {
  const start = toMinutes(t.startTime);
  const end = toMinutes(t.endTime);
  return {
    absenceId: t.absenceId,
    date: fromUntisDate(t.date),
    start,
    end,
    late,
    excused: !!t.excused,
    minutes: t.missedMins ?? end - start,
  };
}

/** Absences split per day (WebUntis can return one absence spanning several days). */
function absenceDays(raw: RawSnapshot, units: Unit[]) {
  const first = units[0]?.start ?? 0;
  const last = units.at(-1)?.end ?? 24 * 60;
  const out: { id: number; date: string; start: number; end: number; src: RawSnapshot["absences"][number] }[] = [];
  for (const a of raw.absences) {
    const from = fromUntisDate(a.startDate);
    const to = fromUntisDate(a.endDate);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const weekday = new Date(d + "T12:00:00Z").getUTCDay();
      if (from !== to && (weekday === 0 || weekday === 6)) continue;
      out.push({
        id: a.id,
        date: d,
        start: d === from ? toMinutes(a.startTime) : first,
        end: d === to ? toMinutes(a.endTime) : last,
        src: a,
      });
    }
  }
  return out;
}

/** Without the per-lesson endpoint: an absence inside one unit that starts at its start and ends early is lateness. */
function guessParts(days: ReturnType<typeof absenceDays>, units: Unit[]): Part[] {
  const parts: Part[] = [];
  for (const a of days) {
    for (const u of units) {
      const o = overlap(a.start, a.end, u.start, u.end);
      if (!o) continue;
      const late = a.src.reason === "Verspätung" || (a.start <= u.start && a.end < u.end && a.end > u.start && units.every((x) => x === u || !overlap(a.start, a.end, x.start, x.end)));
      parts.push({ absenceId: a.id, date: a.date, start: Math.max(a.start, u.start), end: Math.min(a.end, u.end), late, excused: a.src.isExcused, minutes: o });
    }
  }
  return parts;
}

export function buildSnapshot(raw: RawSnapshot): Snapshot {
  const units = timeUnits(raw);
  const allLessons = lessons(raw);
  const days = absenceDays(raw, units);
  const parts =
    raw.absenceTimes && raw.latenessTimes
      ? [...raw.absenceTimes.map((t) => toPart(t, false)), ...raw.latenessTimes.map((t) => toPart(t, true))]
      : guessParts(days, units);

  // Every timetable entry that took place, including subject-less ones like a Lehrausgang:
  // they decide which lesson numbers an absence is listed with.
  const slots = raw.lessons
    .filter((l) => l.code !== "cancelled")
    .map((l) => ({ date: fromUntisDate(l.date), start: toMinutes(l.startTime), end: toMinutes(l.endTime) }));
  const absences: Absence[] = days.map((a) => {
    const own = parts.filter((p) => p.absenceId === a.id && p.date === a.date);
    const lateMinutes = own.filter((p) => p.late).reduce((s, p) => s + p.minutes, 0);
    const late = own.length > 0 ? own.every((p) => p.late) : a.src.reason === "Verspätung";
    const dayLessons = slots.filter((l) => l.date === a.date);
    const touched = units.filter(
      (u) =>
        overlap(a.start, a.end, u.start, u.end) > 0 &&
        (dayLessons.length === 0 || dayLessons.some((l) => overlap(l.start, l.end, u.start, u.end) > 0)),
    );
    // Show only the time that overlaps actual lessons (school may start later than the absence entry).
    const start = touched.length ? Math.max(a.start, touched[0].start) : a.start;
    const end = touched.length ? Math.min(a.end, touched.at(-1)!.end) : a.end;
    return {
      id: a.id,
      date: a.date,
      start,
      end,
      excused: a.src.isExcused,
      status: a.src.excuseStatus || a.src.excuse?.excuseStatus || null,
      untisReason: a.src.reason ?? "",
      late,
      lateMinutes,
      units: touched.map((u) => u.name),
    };
  });
  absences.sort((x, y) => y.date.localeCompare(x.date) || x.start - y.start);

  const klasse =
    raw.lessons.flatMap((l) => l.kl ?? []).find((k) => k.id === raw.klasseId)?.name ??
    raw.absenceTimes?.[0]?.klasseName ??
    "";
  const name = raw.displayName || raw.absences[0]?.studentName || "";

  return {
    fetchedAt: raw.fetchedAt,
    name,
    klasse,
    schoolyear: {
      name: raw.schoolyear.name,
      start: fromUntisDate(raw.schoolyear.startDate),
      end: fromUntisDate(raw.schoolyear.endDate),
    },
    semesters: semesters(raw),
    units,
    lessons: allLessons,
    parts,
    absences,
  };
}

export type Day = { date: string; absences: Absence[] };

/** Absences grouped per day, newest day first. */
export function groupDays(absences: Absence[]): Day[] {
  const map = new Map<string, Absence[]>();
  for (const a of absences) map.set(a.date, [...(map.get(a.date) ?? []), a]);
  return [...map]
    .map(([date, list]) => ({ date, absences: list.sort((x, y) => x.start - y.start) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
