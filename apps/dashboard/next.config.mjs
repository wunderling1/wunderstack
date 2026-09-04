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
  // Client Router Cache. A KPI window is 7 or 30 days wide, so 30s of staleness cannot move a
  // number on screen — while `dynamic: 0` made every tab toggle and every back-navigation a full
  // server render. The "bijgewerkt om" stamp on each KPI surface is what keeps that honest.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 30,
    },
    // `@wunderstack/ui` is a barrel behind `transpilePackages`, so Next's built-in lucide-react
    // optimization never reaches the icons it re-exports. Naming both keeps a route's compile graph
    // to what the page actually imports.
    optimizePackageImports: ["@wunderstack/ui", "lucide-react"],
  },
  transpilePackages: [
    "@wunderstack/shared",
    "@wunderstack/db",
    "@wunderstack/analytics",
    "@wunderstack/ui",
  ],
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
