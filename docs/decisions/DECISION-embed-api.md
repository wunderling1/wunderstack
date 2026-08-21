# DECISION — Embed & public API surface (Fase 4)

Status: accepted · Scope: `packages/embed`, `apps/runtime` (`/config`, `/embed.js`, hardening),
`apps/dashboard` (admin console), `packages/db` (`control.agent_instances`).

## Context

Fase 4 exposes the CAO-agent as an embeddable widget on a fund's own site, behind a hardened public
API, and migrates theming from the compile-time `[data-fund]` seam to runtime injection (D17).

## Decisions

1. **Embed = React in Shadow DOM, reusing the trust-patterns.** The web component mounts React inside
   a shadow root and reuses `@wunderstack/ui` (`AnswerCard`, `CitationBlock`, `RefusalNotice`). This
   keeps citations native to the design system with no drift. Cost: React + Tailwind CSS ship in the
   bundle (~250 KB min). The chat shell (composer/thread) is embed-local (D16). The embed never
   imports a server package or `@wunderstack/shared`; contract shapes are mirrored in `src/types.ts`.

2. **Stable snippet + `GET /config`.** The snippet carries only `script-src`, `data-key`,
   `data-agent`. Everything variable (theme, texts, Article 50) is fetched at boot from `GET /config`,
   so a fund never re-pastes a snippet after a colour/text change.

3. **Runtime theming replaces `[data-fund]` as the product mechanism.** A tenant theme is the curated
   token subset (primary, radius, logo) + NL copy, stored on `control.agent_instances`, served by `GET /config`,
   injected by the embed as CSS custom properties on the shadow host. The `[data-fund]` seam stays in
   `@wunderstack/ui` as the default-theme fallback — not removed.

4. **Public tenant-key + CORS, per tenant.** The key is a public identifier, not a secret: it may sit
   in the snippet. Access is gated by the per-tenant CORS allowlist + rate limiting, not key secrecy.
   Rotating the key invalidates old snippets. Enforcement: a browser cross-origin request (Origin
   present) MUST carry a valid key and an allowlisted origin; a non-browser caller (no Origin: the
   fund's server-side proxy, curl) is trusted (a supplied key must still be valid). An unconfigured
   tenant (no agent-instance row) stays open + rate-limited — the tenant-zero demo and local dev.

5. **Rate limiting per IP and per key.** The existing per-IP fixed-window limit stays; a per-tenant
   ceiling is added so one fund's whole embed audience is bounded independently of any single IP.

6. **Second DB role (writer for agent instances).** The console writes theming / rotates keys through a
   dedicated writer connection (`getWriterDb`, `TENANT_CONFIG_WRITER_DATABASE_URL` — env name is a
   deploy alias), falling back to `DATABASE_URL` locally. In deployment it is a DB user granted write
   on `control.agent_instances` only. Same Scalingo caveat as the analytics reader (D4): the role is
   provisioned via the platform, not `CREATE ROLE` in a migration.

7. **Console is admin-only (D12).** The distribution panel (`/admin/embed`) — snippet + copy,
   key show/rotate, CORS editor, theming form — lives in the dashboard admin area; every server action
   re-checks admin access. Fund-role users are denied by the `(admin)` layout.

## Not in this phase (infra / follow-ups)

- `api.wunderling.nl` DNS/TLS → OOMT instance (D3) is ops, not code.
- Serving `/embed.js` from a CDN (v1 serves it from the runtime).
- Embed `passage`/`feedback` cross-origin surface (v1 embed does chat + citations only).
- The agent-instances writer DB user is provisioned on Scalingo; the app only wires the connection
  (`TENANT_CONFIG_WRITER_DATABASE_URL`).
