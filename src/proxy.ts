import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// Optimistic check only; every page and action verifies the session again (src/lib/session.ts).
// /api/mcp checks its own bearer token or signed link (src/lib/mcp.ts).
export async function proxy(request: NextRequest) {
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!login|setup|api/mcp|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
