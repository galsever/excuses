// SQLite storage: the last raw WebUntis pull, the user's own reasons per day, and a small key/value table.
// The raw pull is stored (not the derived model) so model fixes apply without a new sync.

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./key";
import { buildSnapshot, type Snapshot } from "./model";
import type { RawSnapshot } from "./untis/types";

let db: Database.Database | null = null;

function getDb() {
  if (db) return db;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  db = new Database(join(dir, "excuses.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), raw TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS day_notes (
      date TEXT PRIMARY KEY,
      reason TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      exported_at TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  // asked_at: when the assistant (MCP new_open_days) last asked the owner for this day's reason.
  const cols = db.prepare("PRAGMA table_info(day_notes)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "asked_at")) db.exec("ALTER TABLE day_notes ADD COLUMN asked_at TEXT");
  return db;
}

let cached: { updatedAt: string; snapshot: Snapshot } | null = null;

export function loadSnapshot(): Snapshot | null {
  const row = getDb().prepare("SELECT raw, updated_at FROM snapshot WHERE id = 1").get() as
    | { raw: string; updated_at: string }
    | undefined;
  if (!row) return null;
  if (cached?.updatedAt !== row.updated_at) {
    cached = { updatedAt: row.updated_at, snapshot: buildSnapshot(JSON.parse(row.raw) as RawSnapshot) };
  }
  return cached.snapshot;
}

export function saveSnapshot(raw: RawSnapshot) {
  getDb()
    .prepare("INSERT INTO snapshot (id, raw, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET raw = excluded.raw, updated_at = excluded.updated_at")
    .run(JSON.stringify(raw), new Date().toISOString());
}

export type DayNote = { date: string; reason: string; updatedAt: string; exportedAt: string | null; askedAt: string | null };

export function loadNotes(): Map<string, DayNote> {
  const rows = getDb().prepare("SELECT date, reason, updated_at, exported_at, asked_at FROM day_notes").all() as {
    date: string;
    reason: string;
    updated_at: string;
    exported_at: string | null;
    asked_at: string | null;
  }[];
  return new Map(
    rows.map((r) => [r.date, { date: r.date, reason: r.reason, updatedAt: r.updated_at, exportedAt: r.exported_at, askedAt: r.asked_at }]),
  );
}

export function saveReason(date: string, reason: string) {
  getDb()
    .prepare(
      "INSERT INTO day_notes (date, reason, updated_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET reason = excluded.reason, updated_at = excluded.updated_at",
    )
    .run(date, reason, new Date().toISOString());
}

export function markExported(dates: string[]) {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(
    "INSERT INTO day_notes (date, reason, updated_at, exported_at) VALUES (?, '', ?, ?) ON CONFLICT(date) DO UPDATE SET exported_at = excluded.exported_at",
  );
  getDb().transaction(() => dates.forEach((d) => stmt.run(d, now, now)))();
}

export function markAsked(dates: string[]) {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(
    "INSERT INTO day_notes (date, reason, updated_at, asked_at) VALUES (?, '', ?, ?) ON CONFLICT(date) DO UPDATE SET asked_at = excluded.asked_at",
  );
  getDb().transaction(() => dates.forEach((d) => stmt.run(d, now, now)))();
}

export function getMeta(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(key: string, value: string | null) {
  if (value == null) getDb().prepare("DELETE FROM meta WHERE key = ?").run(key);
  else getDb().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
