import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerOk, createMcpServer, originOf } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// Stateless: a new server and transport per request, JSON answers instead of SSE.
async function handle(request: Request) {
  if (!bearerOk(request)) return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  const server = createMcpServer(originOf(request));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
