# apps/runtime

**Wat dit is:** de Wunderstack-runtime — een **API-only** Next-app (D14). Dit is het productoppervlak
dat naar elke fondsinstance én naar tenant zero deployt (D14, track B: geen gedeelde runtime).

## Regels
- **Geen UI.** Alleen `app/api/*` (route handlers), `lib/*` (perimeter/agent-seam), `proxy.ts` en een
  minimale health-page. Voeg hier geen pagina's, componenten of styling toe — die horen in `apps/playground`.
- **Fonds-agnostisch.** Geen hardcoded fondsreferenties. Tenant-/fonds-identiteit komt uit
  `@wunderstack/tenant` (leest `TENANT` uit env, D15). Keyed requests: fund + `agent_key` uit
  `control.agent_instances` (`lib/instance-scope.ts`); client-`fund` / `data-agent` valideren,
  nooit overrulen. Unkeyed demo: `lib/fund-scope.ts` (`CAO_FUNDS`). D15-muur in `lib/embed-auth.ts`
  (`instanceBelongsToProcess`). Geen `SET LOCAL ROLE`.
- **Unconfigured-open blijft open, zonder stille agentkeuze.** Nul actieve instances + geen key →
  auth levert `config: null` (D1). De agent komt dan alleen uit `RUNTIME_UNCONFIGURED_AGENT`
  (`.env.example` zet `cao` voor lokale/dev). Ontbreekt die var → `400 no_agent_instance`, geen
  CAO-antwoord. `pickUnkeyedInstance` (0/1/2+) niet wijzigen.
- **Agent-logica achter de seam.** Praat met agents uitsluitend via `@wunderstack/agents`; geen retrieval-
  of modellogica in route-handlers (dunne controllers: Zod-validatie → delegeren → streamen).
- **Geen directe fondsschema-toegang.** `no-apps-to-fund-schema` verbiedt imports uit
  `packages/db/src/schema/fund/`. Corpus via `packages/rag`, event-log via `@wunderstack/analytics`,
  rollenspelsessies via `@wunderstack/agents` (`roleplay/session-store.ts`).
- **Streamen loopt via `lib/ndjson-stream.ts`.** Hartslag, beurtbudget en de garantie dat een
  verbonden client nooit een gesloten stream zonder terminaal event krijgt, staan daar één keer.
  Een nieuw streamend oppervlak levert zijn eigen event-union en terminal/final-regels aan
  (`chat-stream.ts`, `roleplay-stream.ts`) en schrijft die logica niet opnieuw.
- Draait lokaal op `:3000`. De playground en de rollenspel-UI proxyen hierheen (`RUNTIME_URL`).

## Oppervlakken
- `/api/chat` — grounded CAO-antwoord, NDJSON met `citations` als terminaal event.
- `/api/roleplay/{start,turn,review}` — rollenspel (`DECISION-roleplay-agent.md`). `start` en
  `review` zijn JSON, `turn` is NDJSON met `turn` als terminaal event. Rollenspel gebruikt
  `lib/roleplay-scope.ts` in plaats van `lib/instance-scope.ts`: het is geen grounded instance en
  heeft dus geen `AGENT_PROFILES`-entry om naartoe op te lossen. Een start met `origin: "webhook"`
  snapshot het bezorgdoel op de sessie; na de beoordeling POSTet de outbox de resultaat-envelop
  (HMAC, SSRF-guard, retry) naar die URL. Een LTI 1.1-launch zet `origin: "lti11"` server-side
  vanuit het token; de client mag dat niet claimen.
- `/api/lti11/launch` en `/api/lti11/launch/gesprek/<slug>` — LTI 1.1 Basic Launch (OAuth 1.0a).
  LMS form-POST, nonce-claim + release-on-failure, token-redirect naar `ROLEPLAY_PUBLIC_URL`.
  Geen leerlingaccounts (R3). Basic Outcomes deelt de Fase 7-outbox (`target.kind = "lti11"`).
  Zie `docs/lti11-token-sessie.md`.
- `/api/webhook` — inkomend, bijwerkingsvrij. Types `ping | cao.updated | roleplay.result`. Uitgaande
  bezorging is géén deze route: dat is de outbox in `lib/roleplay-delivery.ts`.
