# DECISION — Embed & public API surface (Fase 4)

Status: accepted · Scope: `packages/embed`, `apps/runtime` (`/config`, `/embed.js`, hardening),
`apps/dashboard` (admin console), `packages/db` (`control.agent_instances`).

## Context

Fase 4 exposes the CAO-agent as an embeddable widget on a fund's own site, behind a hardened public
API, and migrates theming from the compile-time `[data-fund]` seam to runtime injection (D17).

## Decisions

1. **Embed = iframe guest + React panel in Shadow DOM.** The fund pastes a ~3 KB vanilla loader
   (`/embed.js`). On open, an iframe loads `/embed/frame`, which mounts React inside a shadow root
   and reuses `@wunderstack/ui` (`AnswerCard`, `CitationBlock`, `RefusalNotice`). React never runs on
   the fund host page — full document isolation is the procurement argument. Cost: the panel bundle
   stays large (~600 KB raw / ~145 KB gzip) but only downloads after click, on the runtime origin,
   with a content-hashed immutable URL. The chat shell (composer/thread) is embed-local (D16). The
   embed never imports a server package or `@wunderstack/shared`; contract shapes are mirrored in
   `src/types.ts`.

2. **Stable snippet + `GET /config`.** The snippet carries only `script-src`, `data-key`,
   `data-agent`. Everything variable (theme, texts, Article 50) is fetched at boot from `GET /config`
   *inside the iframe*, so a fund never re-pastes a snippet after a colour/text change.

3. **Runtime theming replaces `[data-fund]` as the product mechanism.** A tenant theme is the curated
   token subset (primary, radius, logo) + NL copy, stored on `control.agent_instances`, served by `GET /config`,
   injected by the embed as CSS custom properties on the shadow host. The `[data-fund]` seam stays in
   `@wunderstack/ui` as the default-theme fallback — not removed.

4. **Public tenant-key + frame-ancestors / CORS, per tenant.** The key is a public identifier, not a
   secret: it may sit in the snippet. Host-page framing is gated by CSP `frame-ancestors` on
   `/embed/frame` from the tenant CORS allowlist. Same-origin chat from the iframe still requires a
   valid key; browser cross-origin callers (if any) still use the CORS allowlist + rate limiting.
   Rotating the key invalidates old snippets. An unconfigured tenant (no agent-instance row) stays
   open + rate-limited — the tenant-zero demo and local dev.

5. **Rate limiting per IP and per key.** The existing per-IP fixed-window limit stays; a per-tenant
   ceiling is added so one fund's whole embed audience is bounded independently of any single IP.

6. **Second DB role (writer for agent instances).** The console writes theming / rotates keys through a
   dedicated writer connection (`getWriterDb`, `TENANT_CONFIG_WRITER_DATABASE_URL` — env name is a
   deploy alias), falling back to `DATABASE_URL` locally. In deployment it is a DB user granted write
   on `control.agent_instances` only. Same Scalingo caveat as the analytics reader (D4): the role is
   provisioned via the platform, not `CREATE ROLE` in a migration.

7. **Console is admin-only (D12).** Distribution (snippet + copy, key show/rotate, CORS editor)
   lives on `/admin/funds/[fundKey]/agents/[agentKey]/distribution`; every server action
   re-checks admin access. Fund-role users are denied by the `(admin)` layout.

## Not in this phase (infra / follow-ups)

- `api.wunderling.nl` DNS/TLS → OOMT instance (D3) is ops, not code.
- Serving `/embed.js` from a CDN (v1 serves it from the runtime).
- Embed `passage`/`feedback` cross-origin surface (v1 embed does chat + citations only).
- The agent-instances writer DB user is provisioned on Scalingo; the app only wires the connection
  (`TENANT_CONFIG_WRITER_DATABASE_URL`).
