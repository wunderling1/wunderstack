# AUDIT — App-inventory (foto vóór de verhuizing)

**Datum:** 2026-07-22 · **Hoort bij:** `docs/plans/PLAN-ui-ecosystem.md` Fase 0.1
**Doel:** elk onderdeel van de bestaande apps classificeren vóór de carve-out, met file-path-evidence.

Classificatie: **runtime** (→ `apps/runtime`, API-only) · **demo-UI** (→ `apps/playground`,
tenant-zero demo) · **behouden** (parkeert richting `apps/dashboard`, later) · **wegwerp**.

## `apps/demo` (huidig) → splitst in `apps/runtime` + `apps/playground`

| Pad | Classificatie | Bestemming |
|---|---|---|
| `app/api/chat/{route,contract}.ts` | runtime | `apps/runtime` (API-oppervlak) |
| `app/api/passage/{route,contract}.ts` | runtime | `apps/runtime` |
| `app/api/feedback/{route,contract}.ts` | runtime | `apps/runtime` |
| `app/api/webhook/{route,contract}.ts` | runtime | `apps/runtime` |
| `lib/agent.ts` | runtime | `apps/runtime` (agent-seam bootstrap) |
| `lib/fund-scope.ts` | runtime | `apps/runtime` (server-side fund-autorisatie); dev-default via `@wunderstack/tenant` i.p.v. hardcoded `"demo"` |
| `lib/http.ts` | runtime | `apps/runtime` (bounded body) |
| `lib/rate-limit.ts` | runtime | `apps/runtime` (perimeter) |
| `lib/webhook-auth.ts` | runtime | `apps/runtime` |
| `proxy.ts` | runtime | `apps/runtime` (nonce-CSP + auth-seam); kopie ook naar playground voor /widget-framing |
| `app/(demo)/page.tsx` | demo-UI | `apps/playground` (hoofdpagina) |
| `app/widget/page.tsx` | demo-UI | `apps/playground` |
| `public/widget/{widget.js,example.html}` | demo-UI | `apps/playground` (embeddable launcher; wordt in fase 4 `packages/embed`) |
| `components/chat/*` | demo-UI | `apps/playground` |
| `components/ui/button.tsx` | demo-UI | `apps/playground` (re-export van `@wunderstack/ui`) |
| `lib/utils.ts` (`cn`) | demo-UI | `apps/playground` |
| `lib/fund-theme.ts` | demo-UI | `apps/playground` |
| `app/globals.css`, `app/layout.tsx` | demo-UI | `apps/playground` (playground heeft al equivalente versie) |

## `apps/console` (huidig) → wordt `apps/playground` (git mv-basis)

| Pad | Classificatie | Bestemming |
|---|---|---|
| `app/layout.tsx`, `app/globals.css`, `postcss.config.mjs`, `tsconfig.json` | demo-UI | blijft (playground-shell) |
| `next.config.mjs` | demo-UI | blijft; krijgt `rewrites()` → runtime-API |
| `proxy.ts` (CONSOLE_SECRET-gate) | wegwerp | vervangen door demo's publieke nonce-CSP-proxy (tenant zero = open, D9) |
| `components/console-chat.tsx` | wegwerp | vervangen door de rijkere demo-chat |
| `app/(console)/demo/{actions,page}.tsx` | wegwerp | agent-picker uitgesteld tot >1 agent (v4-principe) |
| `app/page.tsx` (redirect) | wegwerp | demo-pagina wordt de root |
| `app/api/chat/{route,contract}.ts` | deels | `route.ts` weg (proxy naar runtime); `contract.ts` blijft als client-schema |

## Besluiten die uit deze audit volgen

- **Geen logica-duplicatie:** `apps/playground` (UI) proxyt `/api/*` naar `apps/runtime` via Next
  `rewrites()` (`RUNTIME_URL`, default `http://localhost:3000`). Dit spoort met de doelarchitectuur
  (demo-UI → runtime-API) en houdt de agent-/hardening-logica op één plek (D14).
- **Agent-picker uitgesteld:** met één agent (CAO) is een picker ruis; de catalogus-seam
  (`packages/agents/src/catalog.ts`) blijft bestaan voor dashboard/marketing (fase 3/5).
- **Ontbrekend, expliciet gelabeld:** er is nog geen `apps/dashboard`, `apps/marketing`,
  `packages/embed`, `packages/analytics`. Deze komen in latere fases; "behouden" UI parkeert daar.
