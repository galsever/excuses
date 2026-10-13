// The "Entschuldigung" PDF for a set of days, shared by the export button and the MCP download link.

import { loadCredentials } from "./credentials";
import { loadNotes, loadSnapshot, markExported } from "./db";
import { groupDays } from "./model";
import { renderLetter } from "./pdf";
import { todayIso } from "./untis/fetch";

export const ISO = /^\d{4}-\d{2}-\d{2}$/;

type Checked = { error: string } | { error: null; name: string; klasse: string; days: { date: string; reason: string; absences: ReturnType<typeof groupDays>[number]["absences"] }[] };

/** Checks that every date has absences and a reason, without rendering anything. */
export function checkLetter(dates: string[]): Checked {
  const snap = loadSnapshot();
  const wanted = dates.filter((d) => ISO.test(d));
  if (!snap || !wanted.length) return { error: "Keine Tage ausgewählt" };
  const notes = loadNotes();
  const days = groupDays(snap.absences)
    .filter((d) => wanted.includes(d.date))
    .map((d) => ({ date: d.date, reason: notes.get(d.date)?.reason.trim() ?? "", absences: d.absences }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return { error: "Keine Abwesenheiten an diesen Tagen" };
  const missing = days.filter((d) => !d.reason);
  if (missing.length) return { error: `Für jeden Tag braucht es einen Grund (fehlt: ${missing.map((d) => d.date).join(", ")})` };
  return { error: null, name: snap.name, klasse: snap.klasse, days };
}

/** Renders the letter and marks its days as exported. */
export async function buildLetter(dates: string[]): Promise<{ error: string } | { error: null; pdf: Uint8Array; file: string }> {
  const c = checkLetter(dates);
  if (c.error !== null) return c;
  const today = todayIso();
  const pdf = await renderLetter({ name: c.name, klasse: c.klasse, place: loadCredentials()?.place ?? "", date: today, days: c.days });
  markExported(c.days.map((d) => d.date));
  return { error: null, pdf: new Uint8Array(pdf), file: `Entschuldigung_${c.name.replace(/\s+/g, "_")}_${today}.pdf` };
}

export function pdfResponse(pdf: Uint8Array, file: string) {
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
