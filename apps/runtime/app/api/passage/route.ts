import { fetchPassage } from "@wunderstack/agents";
import { resolveFundScope } from "@/lib/fund-scope";
import { readBodyBounded } from "@/lib/http";
import { checkRateLimit, clientKey } from "@/lib/rate-limit";
import { passageRequestSchema, passageResponseSchema } from "./contract";

/**
 * POST /api/passage — expand a citation to its full parent passage ("toon volledige passage").
 * A thin controller: validate (Zod) → authorize fund scope → delegate to the agent seam → return.
 * Fund scoping enforces corpus isolation (never fetch a passage from another fund's CAO).
 */

export const runtime = "nodejs";

const RATE_LIMIT = { windowMs: 60_000, max: 60 };

export async function POST(request: Request): Promise<Response> {
  const limit = checkRateLimit(clientKey(request), RATE_LIMIT);
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const body = await readBodyBounded(request);
  if (!body.ok) {
    return Response.json({ error: body.error }, { status: body.status });
  }

  let json: unknown;
  try {
    json = JSON.parse(body.raw);
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = passageRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const scope = resolveFundScope(parsed.data.fund);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status });
  }

  try {
    const passage = await fetchPassage({ chunkId: parsed.data.chunkId, fund: scope.fund });
    if (!passage) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json(passageResponseSchema.parse(passage));
  } catch (error) {
    console.error("[api/passage] failed to fetch passage:", error);
    return Response.json({ error: "passage_failed" }, { status: 502 });
  }
}
