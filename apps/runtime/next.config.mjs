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
  // Our workspace packages ship raw TypeScript with NodeNext-style `.js` import specifiers (required
  // for tsx/node ESM + tsc). The bundler must map those `.js` requests to the real `.ts` source.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
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
