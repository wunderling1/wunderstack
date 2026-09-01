import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The dashboard reads its DB + auth config from the monorepo-root .env in local dev. In deployment
// these come from the platform environment. Loading here (the same node process that serves requests)
// makes DATABASE_URL / AUTH_SECRET available to server components without a per-app .env copy.
const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}
// Distinct pg_stat_activity label. Does not replace the globalThis pool singleton in
// @wunderstack/db — transpilePackages stays; postgres is not externalized as a leak fix.
process.env.DB_APPLICATION_NAME ??= "wunderstack-dashboard";

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
  async redirects() {
    return [
      { source: "/gesprekken", destination: "/conversations", permanent: true },
      { source: "/gesprekken/:id", destination: "/conversations/:id", permanent: true },
      { source: "/signalen", destination: "/signals", permanent: true },
      { source: "/instellingen", destination: "/settings", permanent: true },
      {
        source: "/admin/funds/:fundKey/gesprekken",
        destination: "/admin/funds/:fundKey/conversations",
        permanent: true,
      },
      {
        source: "/admin/funds/:fundKey/gesprekken/:id",
        destination: "/admin/funds/:fundKey/conversations/:id",
        permanent: true,
      },
      {
        source: "/admin/funds/:fundKey/signalen",
        destination: "/admin/funds/:fundKey/signals",
        permanent: true,
      },
      {
        source: "/admin/funds/:fundKey/instellingen",
        destination: "/admin/funds/:fundKey/settings",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: commonSecurityHeaders }];
  },
  // Client Router Cache: dynamic stays 0 so KPI pages refetch on every navigation.
  // Config-tab <Link prefetch> uses the static window (30s) — see FundTabNav / AgentTabNav.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  transpilePackages: [
    "@wunderstack/shared",
    "@wunderstack/db",
    "@wunderstack/analytics",
    "@wunderstack/ui",
  ],
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
