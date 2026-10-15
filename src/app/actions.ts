"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS, verifySessionToken } from "@/lib/auth";
import { loadCredentials, parseServer, same, saveCredentials, setupCode, untisConfig, type Credentials } from "@/lib/credentials";
import { saveReason as dbSaveReason, loadGroups, saveGroups, setMeta } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { sync, type SyncStatus } from "@/lib/sync";
import { UntisError, UntisSession } from "@/lib/untis/client";

// Simple brake against guessing: after 5 wrong logins, wait a minute.
let failures = 0;
let lockedUntil = 0;

function failed() {
  if (++failures >= 5) {
    failures = 0;
    lockedUntil = Date.now() + 60_000;
  }
}

async function startSession() {
  failures = 0;
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export type LoginState = { error: string | null };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (Date.now() < lockedUntil) return { error: "Zu viele Versuche. Bitte in einer Minute nochmal." };
  const creds = loadCredentials();
  if (!creds) redirect("/setup");
  const user = String(form.get("user") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!(same(user.toLowerCase(), creds.user.toLowerCase()) && same(password, creds.password))) {
    failed();
    return { error: "Benutzername oder Passwort falsch." };
  }
  await startSession();
  redirect("/");
}

// After WebUntis rejected a login here, wait before the next try: schools lock accounts after a few.
let untisCooldownUntil = 0;

export async function setup(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (Date.now() < lockedUntil) return { error: "Zu viele Versuche. Bitte in einer Minute nochmal." };
  const old = loadCredentials();
  const loggedIn = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  // First setup needs the code from the server log; changing a stored login needs a session.
  if (old && !loggedIn) redirect("/login");
  if (!old && !same(String(form.get("code") ?? "").trim().toUpperCase(), setupCode())) {
    failed();
    return { error: "Setup-Code falsch." };
  }

  const parsed = parseServer(String(form.get("server") ?? ""));
  const next: Credentials = {
    server: parsed.server,
    school: String(form.get("school") ?? "").trim() || parsed.school || "",
    user: String(form.get("user") ?? "").trim(),
    password: String(form.get("password") ?? "") || old?.password || "",
    place: String(form.get("place") ?? "").trim(),
  };
  if (!next.server || !next.school || !next.user || !next.password) return { error: "Bitte alle Felder ausfüllen." };

  const loginChanged =
    !old || old.server !== next.server || old.school !== next.school || old.user !== next.user || old.password !== next.password;
  if (loginChanged) {
    if (Date.now() < untisCooldownUntil) return { error: "WebUntis hat gerade abgelehnt. Bitte in einer Minute nochmal." };
    try {
      await (await UntisSession.login(untisConfig(next), next.user, next.password)).logout();
    } catch (e) {
      if (e instanceof UntisError && e.badCredentials) {
        untisCooldownUntil = Date.now() + 60_000;
        return { error: "WebUntis lehnt Benutzername oder Passwort ab." };
      }
      return { error: `WebUntis nicht erreichbar: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  saveCredentials(next);
  if (loginChanged) {
    setMeta("auth_blocked", null);
    setMeta("last_error", null);
    setMeta("last_sync", null);
    setMeta("last_attempt", null);
  }
  await startSession();
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function saveReason(date: string, reason: string) {
  await requireSession();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ungültiges Datum");
  dbSaveReason(date, reason.slice(0, 2000));
}

export async function syncNow(force: boolean): Promise<SyncStatus> {
  await requireSession();
  const status = await sync(force);
  revalidatePath("/", "layout");
  return status;
}

/** Creates or replaces a subject group; its subjects leave any other group. */
export async function saveGroup(form: FormData) {
  await requireSession();
  const name = String(form.get("name") ?? "").trim().slice(0, 40);
  const subjects = [...new Set(form.getAll("subject").map(String))];
  if (!name || subjects.length < 2) return;
  const rest = loadGroups()
    .filter((g) => g.name !== name)
    .map((g) => ({ ...g, subjects: g.subjects.filter((s) => !subjects.includes(s)) }))
    .filter((g) => g.subjects.length >= 2);
  saveGroups([...rest, { name, subjects }]);
  revalidatePath("/statistik");
}

export async function deleteGroup(form: FormData) {
  await requireSession();
  const name = String(form.get("name") ?? "");
  saveGroups(loadGroups().filter((g) => g.name !== name));
  revalidatePath("/statistik");
}
