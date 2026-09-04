import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The marketing site reads its embed config (EMBED_SCRIPT_BASE / EMBED_PUBLIC_KEY) from the
// monorepo-root .env in local dev; in deployment these come from the platform environment. Loading
// here makes them available to the server components that render the live CAO demo.
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const commonSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: commonSecurityHeaders }];
  },
  // Marketing is a content site: it depends only on the design system + shared types. It must NEVER
  // pull the agent/model runtime into its bundle (enforced by depcruise no-marketing-to-agents).
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
