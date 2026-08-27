import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { readFile } from "node:fs/promises";

/**
 * GET /embed/panel/[file] — content-hashed React panel IIFE. Loaded only inside `/embed/frame`
 * (never on the fund host page). Immutable cache.
 */
export const runtime = "nodejs";

const PANEL_NAME = /^embed-panel(?:\.[a-f0-9]+)?\.js$/;

function distCandidates(file: string): string[] {
  const paths: string[] = [];
  try {
    const require = createRequire(import.meta.url);
    // Resolve via the package root, then join the requested file under dist/.
    const pkgJson = require.resolve("@wunderstack/embed/manifest.json");
    paths.push(resolve(pkgJson, "..", file));
  } catch {
    /* fall through */
  }
  paths.push(resolve(process.cwd(), "node_modules/@wunderstack/embed/dist", file));
  paths.push(resolve(process.cwd(), "../../packages/embed/dist", file));
  return paths;
}

async function loadPanel(file: string): Promise<string | null> {
  for (const path of distCandidates(file)) {
    try {
      return await readFile(path, "utf8");
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file: raw } = await context.params;
  const file = basename(raw);
  if (!PANEL_NAME.test(file)) {
    return new Response("// unknown panel asset\n", {
      status: 404,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }

  const body = await loadPanel(file);
  if (body === null) {
    return new Response("// embed panel not built. Run: pnpm --filter @wunderstack/embed build\n", {
      status: 503,
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
  }

  const immutable = file.includes(".") && file !== "embed-panel.js";
  return new Response(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300",
    },
  });
}
