// Pulls WebUntis with the stored credentials. One sync at a time, never retries a failed login:
// Schools show a captcha / lock the account after repeated bad logins.

import { credentialHash, loadCredentials, untisConfig } from "./credentials";
import { getMeta, saveSnapshot, setMeta } from "./db";
import { UntisError } from "./untis/client";
import { fetchSnapshot } from "./untis/fetch";

export const STALE_AFTER_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

export type SyncStatus = { lastSync: string | null; lastError: string | null; blocked: boolean; stale: boolean };

export function syncStatus(): SyncStatus {
  const lastSync = getMeta("last_sync");
  const creds = loadCredentials();
  // Not set up yet counts as blocked: there is nothing to log in with.
  const blocked = !creds || getMeta("auth_blocked") === credentialHash(creds);
  return {
    lastSync,
    lastError: getMeta("last_error"),
    blocked,
    stale: !lastSync || Date.now() - Date.parse(lastSync) > STALE_AFTER_MS,
  };
}

let running: Promise<SyncStatus> | null = null;

export function sync(force = false): Promise<SyncStatus> {
  if (running) return running;
  const status = syncStatus();
  if (status.blocked) return Promise.resolve(status);
  if (!force && !status.stale) return Promise.resolve(status);
  const lastAttempt = getMeta("last_attempt");
  if (lastAttempt && Date.now() - Date.parse(lastAttempt) < MIN_GAP_MS) return Promise.resolve(status);

  running = (async () => {
    setMeta("last_attempt", new Date().toISOString());
    const creds = loadCredentials()!; // not blocked, so set up
    try {
      const raw = await fetchSnapshot(untisConfig(creds), creds.user, creds.password);
      saveSnapshot(raw);
      setMeta("last_sync", raw.fetchedAt);
      setMeta("last_error", null);
    } catch (e) {
      if (e instanceof UntisError && e.badCredentials) {
        setMeta("auth_blocked", credentialHash(creds));
        setMeta("last_error", "WebUntis lehnt die gespeicherten Zugangsdaten ab.");
      } else {
        setMeta("last_error", e instanceof Error ? e.message : String(e));
      }
    }
    return syncStatus();
  })().finally(() => {
    running = null;
  });
  return running;
}
