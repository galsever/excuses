import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { buildLetter, pdfResponse } from "@/lib/letter";

export async function POST(request: Request) {
  if (!(await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value))) {
    return new Response("Nicht angemeldet", { status: 401 });
  }
  const dates = (new URL(request.url).searchParams.get("dates") ?? "").split(",");
  const out = await buildLetter(dates);
  if (out.error !== null) return new Response(out.error, { status: 400 });
  return pdfResponse(out.pdf, out.file);
}
