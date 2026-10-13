import { buildLetter, pdfResponse } from "@/lib/letter";
import { pdfLinkOk } from "@/lib/mcp";

export const dynamic = "force-dynamic";

/** Download behind the signed link from the MCP tool excuse_pdf. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const dates = p.get("dates") ?? "";
  if (!pdfLinkOk(dates, Number(p.get("exp")), p.get("sig") ?? "")) return new Response("Link ungültig oder abgelaufen", { status: 403 });
  const out = await buildLetter(dates.split(","));
  if (out.error !== null) return new Response(out.error, { status: 400 });
  return pdfResponse(out.pdf, out.file);
}
