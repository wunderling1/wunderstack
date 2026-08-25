import { Readable } from "node:stream";

import {
  FUND_KEY_RE,
  FundNotFoundError,
  FundSchemaMissingError,
  openFundDump,
  PgDumpFailedError,
  PgDumpMissingError,
} from "@wunderstack/db";
import { auth } from "@/auth";
import { decideAccess } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * Stream a pg_dump of fund_<key>. POST (not GET) so a dump is an explicit admin action.
 * Audit (bytes + sha256) is recorded after a successful dump — never the SQL body.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ fundKey: string }> },
): Promise<Response> {
  const session = await auth();
  if (!decideAccess(session, "admin").allow) {
    return new Response("forbidden", { status: 403 });
  }

  const { fundKey: raw } = await context.params;
  const fundKey = raw.toLowerCase();
  if (!FUND_KEY_RE.test(fundKey)) {
    return new Response("Ongeldige fondssleutel.", { status: 400 });
  }

  try {
    const dump = await openFundDump(fundKey);
    void dump.completed.catch((error: unknown) => {
      console.error("[fund dump]", error instanceof Error ? error.name : "unknown");
    });
    const body = Readable.toWeb(dump.stream) as ReadableStream<Uint8Array>;
    return new Response(body, {
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dump.schemaName}.sql"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PgDumpMissingError) {
      return new Response(
        "pg_dump ontbreekt op deze host. Zonder dump mag het fonds niet gedeactiveerd worden.",
        { status: 503 },
      );
    }
    if (error instanceof FundNotFoundError) {
      return new Response("Fonds niet gevonden.", { status: 404 });
    }
    if (error instanceof FundSchemaMissingError) {
      return new Response("Fondsschema ontbreekt; dump geweigerd.", { status: 409 });
    }
    if (error instanceof PgDumpFailedError) {
      return new Response("pg_dump is mislukt. Zie de serverlog.", { status: 500 });
    }
    console.error("[fund dump]", error instanceof Error ? error.name : "unknown");
    return new Response("Dump mislukt. Zie de serverlog.", { status: 500 });
  }
}
