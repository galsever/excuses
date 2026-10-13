// One full pull of everything the app needs: login, fetch the school year, logout.

import { UntisError, UntisSession, type UntisConfig } from "./client";
import type {
  RawAbsence,
  RawAbsenceTime,
  RawHoliday,
  RawLesson,
  RawSchoolyear,
  RawSnapshot,
  RawTimegridDay,
} from "./types";

export const toUntisDate = (iso: string) => Number(iso.replaceAll("-", ""));
export const fromUntisDate = (n: number) => {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};

/** Today in Vienna as YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(now);
}

/** Current date and minutes since midnight in Vienna. */
export function viennaNow(now = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("de-AT", { timeZone: "Europe/Vienna", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(now)
    .split(":")
    .map(Number);
  return { date: todayIso(now), minutes: h * 60 + m };
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** [from, to] split into chunks of at most `days` days. */
export function chunks(from: string, to: string, days: number): [string, string][] {
  const out: [string, string][] = [];
  for (let start = from; start <= to; start = addDays(start, days)) {
    const end = addDays(start, days - 1);
    out.push([start, end < to ? end : to]);
  }
  return out;
}

export async function fetchSnapshot(cfg: UntisConfig, user: string, password: string): Promise<RawSnapshot> {
  const s = await UntisSession.login(cfg, user, password);
  try {
    const schoolyear = await s.rpc<RawSchoolyear>("getCurrentSchoolyear");
    const holidays = await s.rpc<RawHoliday[]>("getHolidays");
    const timegrid = await s.rpc<RawTimegridDay[]>("getTimegridUnits");

    const from = fromUntisDate(schoolyear.startDate);
    const yearEnd = fromUntisDate(schoolyear.endDate);
    const today = todayIso();
    const to = today < yearEnd ? today : yearEnd;

    // Timetable in 4-week chunks, one after another (Spengergasse resets bursts of requests).
    const lessons: RawLesson[] = [];
    for (const [a, b] of chunks(from, to, 28)) {
      const part = await s.rpc<RawLesson[]>("getTimetable", {
        options: {
          element: { id: s.personId, type: s.personType || 5 },
          startDate: toUntisDate(a),
          endDate: toUntisDate(b),
          showInfo: true,
          showSubstText: true,
          showLsText: true,
          klasseFields: ["id", "name", "longname"],
          subjectFields: ["id", "name", "longname"],
        },
      });
      lessons.push(...part);
    }

    const range = `startDate=${toUntisDate(from)}&endDate=${toUntisDate(to)}&studentId=${s.personId}&excuseStatusId=-1`;
    const absRes = await s.rest<{ data: { absences: RawAbsence[] } }>(`/api/classreg/absences/students?${range}`);
    const absences = absRes.data?.absences ?? [];

    // Per-lesson view: once without lateness (real absences), once lateness only.
    // Optional: not every school lets students call it, the app falls back to its own overlap logic.
    let absenceTimes: RawAbsenceTime[] | null = null;
    let latenessTimes: RawAbsenceTime[] | null = null;
    try {
      const at = `/api/classreg/absencetimes/student?${range}`;
      absenceTimes =
        (await s.rest<{ data: { absenceTimes: RawAbsenceTime[] } }>(`${at}&excludeAbsences=false&excludeLateness=true`))
          .data?.absenceTimes ?? null;
      latenessTimes =
        (await s.rest<{ data: { absenceTimes: RawAbsenceTime[] } }>(`${at}&excludeAbsences=true&excludeLateness=false`))
          .data?.absenceTimes ?? null;
    } catch (e) {
      if (!(e instanceof UntisError)) throw e;
    }

    let displayName: string | null = null;
    try {
      const bearer = await s.token();
      const app = await s.rest<{ user?: { person?: { displayName?: string }; name?: string } }>(
        "/api/rest/view/v1/app/data",
        bearer,
      );
      displayName = app.user?.person?.displayName ?? null;
    } catch (e) {
      if (!(e instanceof UntisError)) throw e;
    }

    return {
      fetchedAt: new Date().toISOString(),
      personId: s.personId,
      klasseId: s.klasseId,
      displayName,
      schoolyear,
      holidays,
      timegrid,
      lessons,
      absences,
      absenceTimes,
      latenessTimes,
    };
  } finally {
    await s.logout();
  }
}
