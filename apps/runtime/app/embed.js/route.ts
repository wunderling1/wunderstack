import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

/**
 * GET /embed.js — vanilla host-page iframe loader (~3 KB). React never runs on the fund page;
 * the chat loads in `/embed/frame` on first open (performance Finding 4).
 */
export const runtime = "nodejs";

let cached: string | null = null;

function candidatePaths(): string[] {
  const paths: string[] = [];
  try {
    paths.push(createRequire(import.meta.url).resolve("@wunderstack/embed/embed.js"));
  } catch {
    /* Next stripped createRequire; fall back below. */
  }
  paths.push(resolve(process.cwd(), "node_modules/@wunderstack/embed/dist/embed.js"));
  paths.push(resolve(process.cwd(), "../../packages/embed/dist/embed.js"));
  return paths;
}

async function loadLoader(): Promise<string | null> {
  for (const path of candidatePaths()) {
    try {
      return await readFile(path, "utf8");
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET(): Promise<Response> {
  if (cached === null) {
    cached = await loadLoader();
  }
  if (cached === null) {
    return new Response("// embed loader not built. Run: pnpm --filter @wunderstack/embed build\n", {
      status: 503,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }
  return new Response(cached, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      // Stable loader URL — short cache; the hashed panel is immutable.
      "cache-control": "public, max-age=300",
    },
  });
}
