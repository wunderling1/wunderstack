import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The monorepo keeps a single root `.env` (see .env.example; the agent scripts read `../../.env`).
// Next only auto-loads `.env` from the app directory, so load the root file here — before the dev
// server / route handlers parse `process.env` in @wunderstack/shared. In deployment there is no
// file (platform env vars are already set), so this is a no-op there.
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}
// Distinct pg_stat_activity label. Does not replace the globalThis pool singleton in
// @wunderstack/db — transpilePackages stays; postgres remains in serverExternalPackages
// only so Next does not bundle its native/dynamic bits.
process.env.DB_APPLICATION_NAME ??= "wunderstack-runtime";

// Static, universal security headers (security-audit finding #6). These are path-independent and
// benefit every response (including static assets), so they live here. The Content-Security-Policy
// and X-Frame-Options are set per request in `proxy.ts` instead, because a strict `script-src` needs
// a fresh per-request nonce and framing policy differs for the embeddable /widget route.
const commonSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: commonSecurityHeaders }];
  },
  // Workspace packages ship raw TypeScript; let Next transpile them.
  transpilePackages: [
    "@wunderstack/shared",
    "@wunderstack/agents",
    "@wunderstack/analytics",
    "@wunderstack/tenant",
    "@wunderstack/rag",
    "@wunderstack/ai",
    "@wunderstack/db",
  ],
  // Node-only libraries the agent pulls in. Keep them external so Next does not try to bundle
  // their dynamic requires / native bits into the server build (they run in the Node runtime).
  serverExternalPackages: [
    // Prebuilt browser bundle served verbatim by /embed.js; never bundle its source into the server.
    "@wunderstack/embed",
    "postgres",
    "@mastra/core",
    "@mastra/langfuse",
    "@mastra/observability",
    "@mastra/otel-exporter",
    "@grpc/grpc-js",
  ],
  // Dev bundler, declared on purpose. Turbopack is the Next 16 default and needs no resolution
  // config here: our workspace packages import relatively WITHOUT file extensions, so there is
  // nothing to remap. That is deliberate — Turbopack cannot remap `.js` -> `.ts`
  // (vercel/next.js#82945; 16.3.4 exposes only resolveAlias / resolveExtensions), which is exactly
  // what broke `next dev` while the packages still carried NodeNext-style `.js` specifiers.
  // Do not reintroduce those suffixes, and do not add `--webpack` to a dev script:
  // `scripts/check-bundler.sh` fails the build if you do.
  turbopack: {},
  // Build-only. The `.js` -> `.ts` extensionAlias that used to live here is gone: the workspace
  // packages no longer ship `.js` specifiers, so both bundlers resolve them unaided.
  webpack: (config) => {
    // Mastra's OpenTelemetry exporter accesses `import.meta` in a way webpack can't statically
    // analyze. It runs fine in the Node runtime; silence just this known-benign warning.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /@mastra[\\/]otel-exporter/, message: /import\.meta/ },
    ];
    return config;
  },
};

export default nextConfig;
