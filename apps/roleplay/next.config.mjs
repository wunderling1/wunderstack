import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

// The roleplay app is UI-only. It owns no agent logic; every /api/* call is proxied to the
// Wunderstack runtime so the agent + hardening live in one place (same seam as apps/playground).
const RUNTIME_URL = process.env.RUNTIME_URL ?? "http://localhost:3000";

const commonSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: commonSecurityHeaders }];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${RUNTIME_URL}/api/:path*` }];
  },
  transpilePackages: ["@wunderstack/shared", "@wunderstack/ui"],
  // Dev bundler, declared on purpose. Turbopack is the Next 16 default and needs no resolution
  // config here: our workspace packages import relatively WITHOUT file extensions, so there is
  // nothing to remap. That is deliberate — Turbopack cannot remap `.js` -> `.ts`
  // (vercel/next.js#82945; 16.3.4 exposes only resolveAlias / resolveExtensions), which is exactly
  // what broke `next dev` while the packages still carried NodeNext-style `.js` specifiers.
  // Do not reintroduce those suffixes, and do not add `--webpack` to a dev script:
  // `scripts/check-bundler.sh` fails the build if you do.
  turbopack: {},
};

export default nextConfig;
