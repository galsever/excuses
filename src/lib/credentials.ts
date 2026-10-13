// The WebUntis login and school, entered once on /setup and stored AES-256-GCM encrypted in the meta
// table. The key comes from key.ts, so a copied database alone reveals nothing.

import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getMeta, setMeta } from "./db";
import { subKey } from "./key";
import type { UntisConfig } from "./untis/client";

export type Credentials = {
  /** WebUntis host, e.g. "schule.webuntis.com". */
  server: string;
  /** School name as in the WebUntis login URL (?school=...). */
  school: string;
  user: string;
  password: string;
  /** Town printed on the letter ("<place>, am ..."). */
  place: string;
};

const META_KEY = "credentials";

export function loadCredentials(): Credentials | null {
  const stored = getMeta(META_KEY);
  if (!stored) return null;
  try {
    const [iv, tag, data] = stored.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", subKey("credentials"), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8")) as Credentials;
  } catch {
    // Wrong or lost key file: treat as not set up, /setup asks again.
    return null;
  }
}

export function saveCredentials(c: Credentials) {
  const iv = randomBytes(12);
  const e = createCipheriv("aes-256-gcm", subKey("credentials"), iv);
  const data = Buffer.concat([e.update(JSON.stringify(c), "utf8"), e.final()]);
  setMeta(META_KEY, [iv, e.getAuthTag(), data].map((b) => b.toString("base64url")).join("."));
}

export function untisConfig(c: Credentials): UntisConfig {
  return { server: c.server, school: c.school };
}

/** Changes whenever the stored login changes, which lifts a login block. */
export function credentialHash(c: Credentials) {
  return createHash("sha256").update(`${c.server}\0${c.school}\0${c.user}\0${c.password}`).digest("hex").slice(0, 16);
}

/** One-time code for the first setup, printed to the server log so only the operator can claim the instance. */
export function setupCode() {
  return createHmac("sha256", subKey("setup")).update("setup").digest("hex").slice(0, 8).toUpperCase();
}

const digest = (s: string) => createHash("sha256").update(s).digest();
export const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/** Accepts a host or a pasted WebUntis URL; returns the host and the ?school= value if the URL had one. */
export function parseServer(input: string): { server: string; school: string | null } {
  const raw = input.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hashQuery = url.hash.includes("?") ? new URLSearchParams(url.hash.slice(url.hash.indexOf("?"))) : null;
    return { server: url.host.toLowerCase(), school: url.searchParams.get("school") ?? hashQuery?.get("school") ?? null };
  } catch {
    return { server: "", school: null };
  }
}
