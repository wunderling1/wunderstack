import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

/**
 * GET /embed.js — serves the built embed web-component bundle (Fase 4). The stable snippet is a single
 * `<script src="…/embed.js" data-key data-agent>` tag; this route ships the bundle from the built
 * @wunderstack/embed package. A classic cross-origin `<script src>` needs no CORS, so third-party
 * sites can load it directly.
 */
export const runtime = "nodejs";

let cached: string | null = null;

/** Locate dist/embed.js. Next mangles createRequire in the server bundle, so also try cwd-relative
 * paths (process.cwd() is the runtime app dir under `next start`). */
function candidatePaths(): string[] {
  const paths: string[] = [];
  try {
    paths.push(createRequire(import.meta.url).resolve("@wunderstack/embed/embed.js"));
  } catch {
    /* Next stripped createRequire; fall back to filesystem paths below. */
  }
  paths.push(resolve(process.cwd(), "node_modules/@wunderstack/embed/dist/embed.js"));
  paths.push(resolve(process.cwd(), "../../packages/embed/dist/embed.js"));
  return paths;
}

async function loadBundle(): Promise<string | null> {
  for (const path of candidatePaths()) {
    try {
      return await readFile(path, "utf8");
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export async function GET(): Promise<Response> {
  if (cached === null) {
    cached = await loadBundle();
  }
  if (cached === null) {
    return new Response("// embed bundle not built. Run: pnpm --filter @wunderstack/embed build\n", {
      status: 503,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }
  return new Response(cached, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
