// App login: the WebUntis username + password are checked against the stored (encrypted) login, never
// sent to WebUntis, so typos here cannot lock the school account. The session is a signed JWT cookie.

import { jwtVerify, SignJWT } from "jose";
import { subKey } from "./key";

export const SESSION_COOKIE = "excuses_session";
export const SESSION_DAYS = 30;

function secret() {
  return new Uint8Array(subKey("session"));
}

export async function createSessionToken() {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  try {
    await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
