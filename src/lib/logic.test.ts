import { describe, expect, it } from "vitest";
import { formatUnits } from "./format";
import { buildSnapshot, groupDays, semesters } from "./model";
import { percentTone, subjectStats, totalStats } from "./stats";
import { chunks } from "./untis/fetch";
import type { RawAbsence, RawAbsenceTime, RawLesson, RawSnapshot } from "./untis/types";

const grid = [
  { name: "1", startTime: 800, endTime: 850 },
  { name: "2", startTime: 850, endTime: 940 },
  { name: "3", startTime: 955, endTime: 1045 },
  { name: "4", startTime: 1045, endTime: 1135 },
];

let id = 1;
const lesson = (date: number, start: number, end: number, su: string, code?: string): RawLesson => ({
  id: id++,
  date,
  startTime: start,
  endTime: end,
  kl: [{ id: 7, name: "5XHIF" }],
  su: [{ id: 1, name: su, longname: su + " lang" }],
  code,
});
const absence = (aid: number, date: number, start: number, end: number, excused = false, reason = ""): RawAbsence => ({
  id: aid,
  startDate: date,
  endDate: date,
  startTime: start,
  endTime: end,
  isExcused: excused,
  excuseStatus: excused ? "entschuldigt" : null,
  reason,
});
const slice = (aid: number, date: number, start: number, end: number, excused = false): RawAbsenceTime => ({
  absenceId: aid,
  date,
  startTime: start,
  endTime: end,
  excused,
  missedMins: (Math.floor(end / 100) * 60 + (end % 100)) - (Math.floor(start / 100) * 60 + (start % 100)),
});

function raw(over: Partial<RawSnapshot> = {}): RawSnapshot {
  return {
    fetchedAt: "2026-10-06T08:00:00Z",
    personId: 1,
    klasseId: 7,
    displayName: "Test Person",
    schoolyear: { id: 1, name: "2026/2027", startDate: 20260907, endDate: 20270704 },
    holidays: [{ id: 1, name: "Ferien4", longName: "Semesterferien", startDate: 20270201, endDate: 20270207 }],
    timegrid: [{ day: 2, timeUnits: grid }],
    lessons: [
      lesson(20260928, 800, 850, "AM"),
      lesson(20260928, 850, 940, "AM"),
      lesson(20260928, 955, 1045, "D"),
      lesson(20260928, 1045, 1135, "D", "cancelled"),
      lesson(20260929, 800, 940, "POS"), // double lesson
      lesson(20260929, 955, 1045, "D"),
    ],
    absences: [absence(10, 20260928, 800, 940, true, "Krankheit"), absence(11, 20260929, 955, 1007, false, "Verspätung")],
    absenceTimes: [slice(10, 20260928, 800, 850, true), slice(10, 20260928, 850, 940, true)],
    latenessTimes: [slice(11, 20260929, 955, 1007)],
    ...over,
  };
}

const now = { date: "2026-10-06", minutes: 12 * 60 };
const all = { from: "2026-09-07", to: "2027-07-04" };

describe("semesters", () => {
  it("splits at the Semesterferien", () => {
    expect(semesters(raw())).toEqual([
      { name: "1. Semester", start: "2026-09-07", end: "2027-01-31" },
      { name: "2. Semester", start: "2027-02-08", end: "2027-07-04" },
    ]);
  });
  it("falls back to the first full week of February", () => {
    const [s1, s2] = semesters({ ...raw(), holidays: [] });
    expect(s1.end).toBe("2027-01-31"); // 1 Feb 2027 is a Monday
    expect(s2.start).toBe("2027-02-08");
  });
});

describe("buildSnapshot", () => {
  const snap = buildSnapshot(raw());
  it("reads name and class", () => {
    expect(snap.name).toBe("Test Person");
    expect(snap.klasse).toBe("5XHIF");
  });
  it("marks lateness and lesson numbers", () => {
    const [late, sick] = snap.absences; // newest first
    expect(late).toMatchObject({ date: "2026-09-29", late: true, lateMinutes: 12, units: ["3"] });
    expect(sick).toMatchObject({ date: "2026-09-28", late: false, excused: true, units: ["1", "2"], untisReason: "Krankheit" });
  });
  it("splits multi-day absences per weekday", () => {
    const s = buildSnapshot(
      raw({ absences: [{ ...absence(20, 20261002, 955, 1135), endDate: 20261005 }], absenceTimes: [], latenessTimes: [] }),
    );
    expect(s.absences.map((a) => [a.date, a.start, a.end])).toEqual([
      ["2026-10-05", 480, 695],
      ["2026-10-02", 595, 695],
    ]);
  });
  it("groups days newest first", () => {
    expect(groupDays(snap.absences).map((d) => d.date)).toEqual(["2026-09-29", "2026-09-28"]);
  });
  it("guesses lateness without the per-lesson endpoint", () => {
    const s = buildSnapshot(raw({ absenceTimes: null, latenessTimes: null, absences: [absence(30, 20260928, 800, 812)] }));
    expect(s.absences[0].late).toBe(true);
    expect(s.parts.every((p) => p.late)).toBe(true);
  });
});

describe("subjectStats", () => {
  const snap = buildSnapshot(raw());
  const stats = subjectStats(snap.lessons, snap.parts, snap.units, all, now);
  const by = Object.fromEntries(stats.map((s) => [s.subject, s]));
  it("counts excused absences per subject, skips cancelled lessons", () => {
    expect(by.AM).toMatchObject({ held: 2, excused: 2, unexcused: 0, percent: 0 });
    expect(by.D).toMatchObject({ held: 2, excused: 0, unexcused: 0, percent: 100 });
  });
  it("counts a double lesson as two units and ignores lateness", () => {
    expect(by.POS).toMatchObject({ held: 2, present: 2 });
  });
  it("totals", () => {
    expect(totalStats(stats)).toMatchObject({ held: 6, excused: 2, unexcused: 0 });
  });
  it("ignores lessons that have not happened yet", () => {
    const early = subjectStats(snap.lessons, snap.parts, snap.units, all, { date: "2026-09-28", minutes: 9 * 60 });
    expect(early.find((s) => s.subject === "AM")?.held).toBe(1);
  });
  it("respects the range", () => {
    expect(subjectStats(snap.lessons, snap.parts, snap.units, { from: "2026-09-29", to: "2026-09-29" }, now).map((s) => s.subject).sort()).toEqual(["D", "POS"]);
  });
});

describe("helpers", () => {
  it("formats lesson numbers", () => {
    expect(formatUnits(["2"])).toBe("2. Stunde");
    expect(formatUnits(["1", "2", "3", "5"])).toBe("1. bis 3., 5. Stunde");
    expect(formatUnits([])).toBe("");
  });
  it("colors percentages", () => {
    expect([71, 70, 50, 49.9, null].map(percentTone)).toEqual(["good", "warn", "warn", "bad", "none"]);
  });
  it("chunks date ranges", () => {
    expect(chunks("2026-09-07", "2026-10-06", 28)).toEqual([
      ["2026-09-07", "2026-10-04"],
      ["2026-10-05", "2026-10-06"],
    ]);
  });
});
