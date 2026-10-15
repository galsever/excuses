// MCP server (streamable HTTP, stateless) for the owner's assistant: absences with reasons, attendance
// stats, saving reasons and the Entschuldigung PDF. Auth: bearer EXCUSES_MCP_TOKEN; the PDF comes from a
// short-lived signed link so a model can download it with curl.

import "server-only";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadGroups, loadNotes, loadSnapshot, markAsked, saveReason } from "./db";
import { formatTime, formatUnits } from "./format";
import { checkLetter, ISO } from "./letter";
import { addDays, groupDays, type Absence, type Snapshot } from "./model";
import { groupStats, subjectStats, totalStats } from "./stats";
import { sync, syncStatus } from "./sync";
import { todayIso, viennaNow } from "./untis/fetch";

const PDF_LINK_MS = 15 * 60 * 1000;
/** new_open_days only looks this far back, so old unexplained days are not asked about again and again. */
const NEW_DAYS_BACK = 14;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

export function mcpToken() {
  const t = process.env.EXCUSES_MCP_TOKEN;
  return t && t.length >= 32 ? t : null;
}

const digest = (s: string) => createHash("sha256").update(s).digest();

export function bearerOk(request: Request) {
  const token = mcpToken();
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return !!token && timingSafeEqual(digest(got), digest(token));
}

const sign = (dates: string, exp: number) => createHmac("sha256", mcpToken() ?? "").update(`pdf|${dates}|${exp}`).digest("base64url");

export function pdfLinkOk(dates: string, exp: number, sig: string) {
  if (!mcpToken() || !(exp > Date.now())) return false;
  return timingSafeEqual(digest(sig), digest(sign(dates, exp)));
}

/** Public origin of this request (behind Traefik, or the in-cluster service name). */
export function originOf(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

/** Syncs when the data is older than 30 min (never forces, never retries a rejected login). */
async function fresh(): Promise<Snapshot | null> {
  await sync(false).catch(() => undefined);
  return loadSnapshot();
}

function syncInfo() {
  const s = syncStatus();
  return { last_sync: s.lastSync, error: s.lastError, login_blocked: s.blocked };
}

function absenceOut(a: Absence, snap: Snapshot) {
  const subjects = [
    ...new Set(
      snap.lessons
        .filter((l) => l.date === a.date && !l.cancelled && Math.min(l.end, a.end) > Math.max(l.start, a.start))
        .map((l) => l.subject),
    ),
  ];
  return {
    time: `${formatTime(a.start)}-${formatTime(a.end)}`,
    lessons: formatUnits(a.units),
    subjects,
    late: a.late,
    late_minutes: a.lateMinutes || undefined,
    webuntis: a.excused ? "entschuldigt" : (a.status ?? "offen"),
    webuntis_reason: a.untisReason || undefined,
  };
}

function days(snap: Snapshot) {
  const notes = loadNotes();
  return groupDays(snap.absences).map((d) => {
    const n = notes.get(d.date);
    const wd = WEEKDAYS[new Date(d.date + "T12:00:00Z").getUTCDay()];
    return {
      date: d.date,
      weekday: wd,
      absences: d.absences.map((a) => absenceOut(a, snap)),
      excused: d.absences.every((a) => a.excused),
      only_late: d.absences.every((a) => a.late),
      reason: n?.reason.trim() || null,
      exported_at: n?.exportedAt ?? null,
      asked_at: n?.askedAt ?? null,
    };
  });
}

const isOpen = (d: ReturnType<typeof days>[number]) => !d.excused && !d.reason && !d.exported_at;

function range(snap: Snapshot, which: string | undefined, from?: string, to?: string) {
  if (from && to) return { from, to, label: `${from} bis ${to}` };
  const [s1, s2] = snap.semesters;
  const today = todayIso();
  if (which === "s1") return { from: s1.start, to: s1.end, label: s1.name };
  if (which === "s2") return { from: s2.start, to: s2.end, label: s2.name };
  if (which === "year") return { from: snap.schoolyear.start, to: snap.schoolyear.end, label: "Schuljahr" };
  return today >= s2.start ? { from: s2.start, to: s2.end, label: s2.name } : { from: s1.start, to: s1.end, label: s1.name };
}

const pct = (p: number | null) => (p == null ? null : Math.round(p * 10) / 10);

export function createMcpServer(origin: string) {
  const server = new McpServer(
    { name: "excuses", title: "Fehlstunden (excuses)", version: "1" },
    {
      instructions:
        "The owner's school absences from WebUntis with their own reason per day, attendance per subject, and the Entschuldigung PDF they sign and send to the teacher. " +
        "Dates are YYYY-MM-DD (Europe/Vienna). A day needs a reason before it can go into a PDF. Lateness (only_late) never counts against attendance.",
    },
  );
  const read = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    "absence_days",
    {
      description:
        "Absence days (newest first) with times, lesson numbers, missed subjects, lateness, WebUntis status, the owner's own reason, exported_at (already in a PDF). Default range: the current school year. open_only: only days without a reason that are neither excused nor exported.",
      inputSchema: { from: z.string().regex(ISO).optional(), to: z.string().regex(ISO).optional(), open_only: z.boolean().optional() },
      annotations: read,
    },
    async ({ from, to, open_only }) => {
      const snap = await fresh();
      if (!snap) return fail("Noch keine Daten (noch nie synchronisiert).");
      const list = days(snap).filter((d) => (!from || d.date >= from) && (!to || d.date <= to) && (!open_only || isOpen(d)));
      return json({ sync: syncInfo(), days: list });
    },
  );

  server.registerTool(
    "new_open_days",
    {
      description: `Absence days of the last ${NEW_DAYS_BACK} days that still need a reason and were not returned by this tool before; it marks them as asked. For the morning check: ask the owner for a reason for each (suggest one from their calendar if an event explains it), then save the answer with set_reason.`,
      inputSchema: {},
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async () => {
      const snap = await fresh();
      if (!snap) return fail("Noch keine Daten (noch nie synchronisiert).");
      const since = addDays(todayIso(), -NEW_DAYS_BACK);
      const list = days(snap).filter((d) => d.date >= since && isOpen(d) && !d.asked_at);
      if (list.length) markAsked(list.map((d) => d.date));
      return json({ sync: syncInfo(), days: list });
    },
  );

  server.registerTool(
    "set_reason",
    {
      description: "Save the owner's own reason for one absence day (what goes into the Entschuldigung PDF), e.g. \"Arzttermin\" or \"Krank (Fieber)\". An empty reason clears it. Only on the owner's word.",
      inputSchema: { date: z.string().regex(ISO), reason: z.string().max(2000) },
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ date, reason }) => {
      const snap = loadSnapshot();
      if (!snap?.absences.some((a) => a.date === date)) return fail(`Am ${date} gibt es keine Abwesenheit.`);
      saveReason(date, reason.trim());
      return json({ date, reason: reason.trim() || null });
    },
  );

  server.registerTool(
    "attendance",
    {
      description:
        "Attendance per subject in lessons (held, present, excused, unexcused, present percent; below 50 % is critical, 50 to 70 % a warning) plus the total. range: semester (current, default), s1, s2, year; or from+to.",
      inputSchema: {
        range: z.enum(["semester", "s1", "s2", "year"]).optional(),
        from: z.string().regex(ISO).optional(),
        to: z.string().regex(ISO).optional(),
      },
      annotations: read,
    },
    async (a) => {
      const snap = await fresh();
      if (!snap) return fail("Noch keine Daten (noch nie synchronisiert).");
      const r = range(snap, a.range, a.from, a.to);
      const stats = groupStats(subjectStats(snap.lessons, snap.parts, snap.units, r, viennaNow()), loadGroups());
      const row = (s: (typeof stats)[number]) => ({
        subject: s.subject,
        name: s.subjectLong,
        held: s.held,
        present: s.present,
        excused: s.excused,
        unexcused: s.unexcused,
        present_percent: pct(s.percent),
      });
      return json({ sync: syncInfo(), range: r, total: row(totalStats(stats)), subjects: stats.map(row) });
    },
  );

  server.registerTool(
    "excuse_pdf",
    {
      description: `Make the Entschuldigung PDF for some absence days (each needs a reason). Returns a download link valid ${PDF_LINK_MS / 60000} min; download it with curl -o <file>. Downloading marks the days as exported.`,
      inputSchema: { dates: z.array(z.string().regex(ISO)).min(1).max(60) },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ dates }) => {
      const c = checkLetter(dates);
      if (c.error !== null) return fail(c.error);
      const list = c.days.map((d) => d.date).join(",");
      const exp = Date.now() + PDF_LINK_MS;
      const url = `${origin}/api/mcp/pdf?dates=${list}&exp=${exp}&sig=${sign(list, exp)}`;
      return json({ url, days: c.days.map((d) => ({ date: d.date, reason: d.reason })) });
    },
  );

  server.registerTool(
    "refresh",
    {
      description: "Pull WebUntis now (at most once a minute). Normally not needed: the other tools refresh data older than 30 min themselves.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => json((await sync(true), syncInfo())),
  );

  return server;
}
