// Minimal WebUntis client: JSON-RPC for login/master data, the web UI's REST endpoints for absences.
// Server-only. Schools lock accounts after failed logins, so nothing here retries a login.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

export type UntisConfig = { server: string; school: string; dumpDir?: string };

export class UntisError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
  /** Wrong username/password: never retry automatically. */
  get badCredentials() {
    return this.code === -8504;
  }
}

export class UntisSession {
  private cookies = new Map<string, string>();
  private rpcId = 0;
  personId = 0;
  personType = 0;
  klasseId = 0;

  private constructor(private cfg: UntisConfig) {
    this.cookies.set("schoolname", "_" + Buffer.from(cfg.school).toString("base64"));
  }

  static async login(cfg: UntisConfig, user: string, password: string): Promise<UntisSession> {
    const s = new UntisSession(cfg);
    const result = await s.rpc<{ sessionId: string; personId: number; personType: number; klasseId: number }>(
      "authenticate",
      { user, password, client: "excuses" },
    );
    s.cookies.set("JSESSIONID", result.sessionId);
    s.personId = result.personId;
    s.personType = result.personType;
    s.klasseId = result.klasseId;
    return s;
  }

  private get base() {
    return `https://${this.cfg.server}/WebUntis`;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      "User-Agent": USER_AGENT,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json",
      Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...extra,
    };
  }

  private keepCookies(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  private dump(name: string, body: string) {
    if (!this.cfg.dumpDir) return;
    mkdirSync(this.cfg.dumpDir, { recursive: true });
    writeFileSync(join(this.cfg.dumpDir, name.replace(/[^\w.-]+/g, "_") + ".json"), body);
  }

  async rpc<T>(method: string, params: unknown = {}): Promise<T> {
    const res = await fetch(`${this.base}/jsonrpc.do?school=${encodeURIComponent(this.cfg.school)}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: String(++this.rpcId), method, params, jsonrpc: "2.0" }),
      redirect: "manual",
    });
    this.keepCookies(res);
    const text = await res.text();
    if (res.status !== 200) throw new UntisError(`${method}: HTTP ${res.status}`);
    let json: { result?: T; error?: { code: number; message: string } };
    try {
      json = JSON.parse(text);
    } catch {
      throw new UntisError(`${method}: keine JSON-Antwort (Sitzung abgelaufen?)`);
    }
    if (json.error) throw new UntisError(`${method}: ${json.error.message}`, json.error.code);
    // Never dump the authenticate result: it holds the session id.
    if (method !== "authenticate") this.dump(`rpc-${method}-${this.rpcId}`, text);
    return json.result as T;
  }

  /** GET on the web UI's REST API (cookie session, optional bearer). */
  async rest<T>(path: string, bearer?: { token: string; tenantId?: string }): Promise<T> {
    const extra: Record<string, string> = {};
    if (bearer) {
      extra.Authorization = `Bearer ${bearer.token}`;
      if (bearer.tenantId) extra["Tenant-Id"] = bearer.tenantId;
    }
    const res = await fetch(this.base + path, { headers: this.headers(extra), redirect: "manual" });
    this.keepCookies(res);
    const text = await res.text();
    if (res.status !== 200) throw new UntisError(`${path.split("?")[0]}: HTTP ${res.status}`);
    this.dump(`rest-${path.split("?")[0]}`, text);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new UntisError(`${path.split("?")[0]}: keine JSON-Antwort`);
    }
  }

  /** Short-lived JWT for /api/rest/view/v1/* (plain text response). */
  async token(): Promise<{ token: string; tenantId?: string }> {
    const res = await fetch(this.base + "/api/token/new", { headers: this.headers(), redirect: "manual" });
    this.keepCookies(res);
    if (res.status !== 200) throw new UntisError(`token/new: HTTP ${res.status}`);
    const token = (await res.text()).trim();
    let tenantId: string | undefined;
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      if (payload.tenant_id != null) tenantId = String(payload.tenant_id);
    } catch {
      /* tenant id is optional */
    }
    return { token, tenantId };
  }

  async logout() {
    try {
      await this.rpc("logout");
    } catch {
      /* session might already be gone */
    }
  }
}
