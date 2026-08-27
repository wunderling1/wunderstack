import { createRequire } from "node:module";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { getInstanceByPublicKey } from "@wunderstack/db";

/**
 * GET /embed/frame — guest document for the iframe. Loads the hashed React panel in
 * `data-mode="inline"` so there is no nested floating launcher. Same-origin with `/api/chat`.
 *
 * Framing is gated by CSP `frame-ancestors` from the tenant `corsAllowlist` (public key in query).
 * Empty allowlist (tenant-zero / local) allows any ancestor so demos keep working.
 */
export const runtime = "nodejs";

interface PanelManifest {
  panel: string;
}

let manifestCache: PanelManifest | null = null;

function manifestPaths(): string[] {
  const paths: string[] = [];
  try {
    paths.push(createRequire(import.meta.url).resolve("@wunderstack/embed/manifest.json"));
  } catch {
    /* fall through */
  }
  paths.push(resolve(process.cwd(), "node_modules/@wunderstack/embed/dist/manifest.json"));
  paths.push(resolve(process.cwd(), "../../packages/embed/dist/manifest.json"));
  return paths;
}

async function loadManifest(): Promise<PanelManifest | null> {
  if (manifestCache !== null) return manifestCache;
  for (const path of manifestPaths()) {
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as PanelManifest;
      if (typeof raw.panel === "string" && raw.panel.length > 0) {
        manifestCache = raw;
        return raw;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function frameAncestorsForKey(key: string | null): Promise<string> {
  if (!key) {
    return "*";
  }
  try {
    const instance = await getInstanceByPublicKey(key);
    const list = instance?.corsAllowlist ?? [];
    if (list.length === 0) {
      return "*";
    }
    return list.join(" ");
  } catch {
    return "'none'";
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const agent = url.searchParams.get("agent") ?? "cao";
  const origin = url.origin;

  const manifest = await loadManifest();
  if (manifest === null) {
    return new Response("embed panel not built. Run: pnpm --filter @wunderstack/embed build", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const panelSrc = `${origin}/embed/panel/${manifest.panel}`;
  const frameAncestors = await frameAncestorsForKey(key);

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Wunderstack</title>
  <style>
    html, body { margin: 0; height: 100%; background: #fff; }
    [data-wunderstack-embed-slot] { height: 100%; width: 100%; }
  </style>
</head>
<body>
  <div data-wunderstack-embed-slot></div>
  <script
    src="${escapeAttr(panelSrc)}"
    data-wunderstack-embed
    data-mode="inline"
    data-endpoint="${escapeAttr(origin)}"
    ${key ? `data-key="${escapeAttr(key)}"` : ""}
    data-agent="${escapeAttr(agent)}"
  ></script>
</body>
</html>
`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Framing allowlist — replaces cross-origin CORS for the guest document.
      "content-security-policy": `frame-ancestors ${frameAncestors}`,
      // Do not set X-Frame-Options here; CSP frame-ancestors is the modern control.
    },
  });
}
