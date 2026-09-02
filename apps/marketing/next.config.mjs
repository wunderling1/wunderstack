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
  // Build-only. `next dev` runs on Turbopack (Next 16 default), which applies TypeScript's own
  // `.js` -> `.ts` specifier resolution and ignores this hook. `next build --webpack` still needs it:
  // our workspace packages ship raw TypeScript with NodeNext-style `.js` import specifiers.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
