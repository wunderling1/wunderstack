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
