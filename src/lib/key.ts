// The instance's master key: 32 random bytes in a file, created on first start. Everything secret is
// derived from it (credential encryption, session signing, setup code), so no secret has to live in env.
// Default path is $DATA_DIR/secret.key; KEY_FILE moves it off the data volume (e.g. a mounted secret).

import { hkdfSync, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

let master: Buffer | null = null;

export function dataDir() {
  return process.env.DATA_DIR ?? join(process.cwd(), "data");
}

function masterKey(): Buffer {
  if (master) return master;
  const file = process.env.KEY_FILE ?? join(dataDir(), "secret.key");
  try {
    master = Buffer.from(readFileSync(/*turbopackIgnore: true*/ file, "utf8").trim(), "base64");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
    // wx: never overwrite a key another process just wrote.
    writeFileSync(/*turbopackIgnore: true*/ file, randomBytes(32).toString("base64") + "\n", { mode: 0o600, flag: "wx" });
    master = Buffer.from(readFileSync(/*turbopackIgnore: true*/ file, "utf8").trim(), "base64");
  }
  if (master.length !== 32) throw new Error(`${file} ist kein gültiger Schlüssel (32 Bytes Base64 erwartet)`);
  return master;
}

/** A 32-byte key for one purpose, derived from the master key. */
export function subKey(purpose: "credentials" | "session" | "setup"): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(), Buffer.alloc(0), `excuses/${purpose}`, 32));
}
