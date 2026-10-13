// German formatting helpers shared by the UI and the PDF.

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** "2026-10-06" -> "06.10.2026" */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** "2026-10-06" -> "Di, 06.10.2026" (or the long weekday). */
export function formatDay(iso: string, long = false) {
  const wd = new Date(iso + "T12:00:00Z").getUTCDay();
  return `${(long ? WEEKDAYS_LONG : WEEKDAYS)[wd]}, ${formatDate(iso)}`;
}

/** 595 -> "09:55" */
export function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export const formatRange = (start: number, end: number) => `${formatTime(start)} bis ${formatTime(end)}`;

/** ["3","4","5","7"] -> "3. bis 5., 7. Stunde"; ["2"] -> "2. Stunde" */
export function formatUnits(units: string[]) {
  if (!units.length) return "";
  const nums = units.map(Number);
  if (nums.some(Number.isNaN)) return `${units.join(", ")} Stunde`;
  const runs: [number, number][] = [];
  for (const n of nums) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}.` : `${a}. bis ${b}.`)).join(", ") + " Stunde";
}

export const formatPercent = (p: number | null) => (p == null ? "keine Daten" : `${Math.round(p)} %`);

/** Lesson count with the right noun: 1 Stunde, 3 Stunden. */
export const hours = (n: number) => `${n} ${n === 1 ? "Stunde" : "Stunden"}`;
