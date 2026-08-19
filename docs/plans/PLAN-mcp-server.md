# PLAN — MCP-server (Copilot-ontsluiting van de CAO-agent) · v3

**Status:** concept, herzien na code-review 2026-07-29
**Doelbestand:** `docs/plans/PLAN-mcp-server.md`
**Vervangt:** PLAN-mcp-connector.md (v1). Naam gewijzigd: "connector" botst met
`packages/connectors`, dat in de rules gereserveerd is voor de airlock naar niet-EU-bronnen.
Hier reikt niets naar buiten — de host komt naar binnen. Dus: MCP-*server*.
**Eigenaar:** Jordy

**Herkomst:** review op basis van de werkelijke codebase. v3 incorporeert alle v2-correcties
plus vier bevindingen uit SDK-/spec-verificatie (stateless Streamable HTTP, latency-kosten,
M9 tekstblok, M10 isError-foutcontract).

---

## 0. Samenvatting en vastgelegde beslissingen

Doel: het bestaande CAO-antwoord ontsluiten als tool binnen Microsoft 365 Copilot, zonder de
grounding-, citatie- en weigergaranties te verliezen.

Kernontwerp:

- **Answer-as-a-tool.** `createCaoAgent().answer()` geeft `answer`, `citations[]`, `found`,
  `traceId` en `followUpQuestions` terug, met `verifyAndBuild()`, `hasUngroundedHardFact()` en
  citatie-repair al binnen de aanroep. De MCP-laag is een dunne controller. Precedent:
  `packages/agents/src/smoke.ts`.
- **Route in `apps/runtime`, geen eigen workspace.** Zie M4.
- **Eén tool** (`ask_cao`). Splitsen op output-contract, niet op corpus.
- **Auth op fondsniveau** met een echt gedeeld secret (HMAC, gemodelleerd op webhook-auth).
- **Soevereiniteitspositie:** de vraagtekst passeert Microsofts verwerking; het antwoord wordt
  volledig binnen de EU-stack gevormd (geen niet-EU-model in het inferentiepad, conform
  `000-core.mdc`). Claim per-laag: *sovereign intelligence layer, client naar keuze van het
  fonds*. Explicitie beslissing, eerste vraag die een fonds stelt — daarom in sectie 0.

### Beslissingen

| # | Beslissing | Vastgelegd |
|---|---|---|
| M1 | Relay-fidelity | Instructie in tool-beschrijving; afwijking wordt gemeten (fase 6). Bij structureel verlies van `[n]`-markers: productbelofte bijstellen, niet de meting. |
| M2 | Timeout-strategie | Synchroon mits p95 < hostlimiet. Stateless Streamable HTTP in een Next route handler is een verificatie (SDK v2 `createMcpHandler`), geen fasegate — Fase 2 bewijst beide. Signaal: turn budget 45s (`apps/runtime/lib/chat-stream.ts:10`). |
| M3 | Niet-gevonden | `NOT_FOUND_MESSAGE` (geëxporteerde constante in `packages/agents/src/cao/prompt.ts`) in `answer`, `citations: []`. Doorgeven, niet herbouwen. |
| M4 | Plaats van de server | `apps/runtime/app/api/mcp/`. Geen `apps/mcp`-workspace. Redenen: (1) Scalingo routeert publieke HTTP alleen naar `web`; (2) `200-architecture.mdc`: alle externe toegang via `apps/runtime`; (3) perimeter-hergebruik. |
| M5 | Secret | Echt gedeeld secret, HMAC naar webhook-patroon (`WEBHOOK_SIGNING_SECRET`). Dual-secret (current + previous) is nieuwe functionaliteit. |
| M6 | Corpus-scope | `ask_cao` dekt uitsluitend het CAO-corpus. Een tweede corpus (arbocatalogus) krijgt een eigen tool (`ask_arbo`); fund en agent worden server-side uit de instance-key opgelost — geen agent-parameter, geen interne router. Zie `docs/decisions/DECISION-second-agent-arbo.md`. |
| M7 | Dependency | `@modelcontextprotocol/server` v2 (package split; was historically `@modelcontextprotocol/sdk`). **Niet** `@mastra/mcp`, **niet** `mcp-handler`/`@vercel/mcp-adapter`. Mastra pint transitief `@modelcontextprotocol/sdk` v1.x; pnpm isoleert dat. |
| M8 | Bewijsmap | `docs/audit/mcp/` — de map die daadwerkelijk in gebruik is. |
| M9 | Tool-resultaatvorm | `content[0].text` bevat antwoord **plus** gerenderde bronnenlijst; `structuredContent` bevat dezelfde info machine-leesbaar onder `outputSchema`. Zonder bronnen in het tekstblok verwijzen `[n]`-markers naar niets zodra Copilot relayeert. |
| M10 | Foutcontract | Upstream-fouten → resultaat met `isError: true` en tekst die instrueert niet zelf te antwoorden. Protocol-level errors alleen voor auth/protocol. Of Copilot dit respecteert = meting in fase 6. |

---

## 1. Instapvoorwaarden

- [x] ~~E2 — under-refusal~~ **Vervallen als blokkade.** De 0.333 was historisch
      (corrupt-baseline-incident). Huidige baseline/report: `underRefusalRate: 0`.
      **Vervangen door E2':** bij start fase 3 zijn G2 en de nightly G3 over de fund-sets groen.
- [ ] **E1 — Signaal.** Minstens één fonds vraagt om Copilot-ontsluiting of bevestigt
      organisatiebreed M365 Copilot-gebruik. Bewijs: notitie in `docs/sales/` (map aanmaken
      bij eerste notitie).
- [ ] **E3 — Branch protection-gaten.** Basis staat (`docs/audit/branch-protection-check.md`).
      Open: `required_pull_request_reviews` en merge queue.

Fase 1 mag vooruitlopen op E1.

---

## 2. Fasering

### Fase 1 — Voorbereidend werk dat los waarde heeft

**1a — `channel` als dimensie**

Toevoegen aan `CaoTraceInput` (`packages/agents/src/observability/trace.ts`) en het
event-schema (`packages/analytics/src/event.ts`), met `playground` en `embed` meteen getagd.

- [ ] `channel` in trace- en event-schema; bestaande oppervlakken getagd

**1b — Pipeline-latency, eenmalig**

Script dat `createCaoAgent().answer()` over de fund-sets draait (etd 26 + demo 13).
Wall-clock per case; p50/p95/max naar `docs/audit/mcp/latency-pipeline.md`. Uitgesplitst op
`category` en aanwezigheid van `history`. Draait niet in CI.

- [ ] p50/p95/max vastgelegd
- [ ] Traagste categorie apart benoemd

### Fase 2 — Route, stub-tool en hostlimiet

`apps/runtime/app/api/mcp/` met SDK v2 `createMcpHandler`. Eerst een stub-tool die N seconden
slaapt: bewijst stateless Streamable HTTP én meet de hostlimiet. Bewijs:
`docs/audit/mcp/hostlimit-copilot.md`. Origin-/Host-header-validatie voor DNS-rebinding.

**Stopcriterium:** werkt de route handler niet, of ligt de hostlimiet onder de p95 uit 1b →
stop, herontwerp-notitie.

- [ ] Stateless Streamable HTTP werkend in Next route handler
- [ ] Hostlimiet empirisch vastgesteld

### Fase 3 — `ask_cao`

Tool-beschrijving als versioned constant (inclusief instructie tot letterlijke weergave).
Handler: Zod → `resolveFundScope` → `agent.answer()` → serialiseren volgens M9.
`corpus_versions: string[]` afgeleid uit citaties (distinct `version`-waarden; leeg bij weigering).

- [ ] Route dunne controller; geen pipeline-logica in de handler
- [ ] Niet-gevonden-pad getest (≥3 out-of-corpus)
- [ ] Foutpaden volgens M10 (`isError: true`)
- [ ] `corpus_versions` in output
- [ ] Renderlogica unit-getest in `lib/`
- [ ] Geen wijziging in dependency-cruiser / eslint nodig

### Fase 4 — Secret, rate limiting, observability

`lib/mcp-auth.ts` naar webhook-HMAC-patroon; dual-secret; env var via
`optional(z.string().min(1))`. Rate limit `mcp:${fund}` gelaagd op per-IP.
`channel: "mcp"` via infrastructuur uit fase 1a. Analytics: gesynthetiseerde `sessionId`
(UUID per call).

- [ ] 401 zonder/met onjuist secret — testcase
- [ ] Rotatie zonder downtime (twee geldige waarden) — testcase
- [ ] Rate limit per fonds; nette fout bij overschrijding
- [ ] Traceerbaar in Langfuse met `channel` + fund — screenshot in `docs/audit/mcp/`
- [ ] Secret in Scalingo env vars, niet in de repo

### Fase 5 — Host-smoketest (Claude / ChatGPT)

Staging met IP-ratelimit actief; wegwerpcorpus, geen productiedata.

- [ ] Tool herkend en aangeroepen op natuurlijke Nederlandse vraag (beide hosts)
- [ ] Antwoord inclusief `[n]`-markers en gerenderde bronnenlijst
- [ ] Weigerzin letterlijk bij out-of-corpus
- [ ] Bevindingen gelogd (geen Copilot-voorspelling)

### Fase 6 — Copilot Studio-acceptatie

Golden set via Copilot-route. Extra metingen uit M9/M10: bronnenlijst-integriteit en
`isError`-gedrag. Bewijs: `docs/audit/mcp/copilot-baseline.md`.

**Stopcriterium:** structureel verlies van citaties of weigerzin → productbelofte bijstellen,
niet de meting.

- [ ] Golden set via Copilot; resultaten vastgelegd
- [ ] Relay-fidelity gemeten (M1)
- [ ] Weigerzin-integriteit gemeten
- [ ] Bronnenlijst-integriteit gemeten (M9)
- [ ] `isError`-gedrag gemeten (M10)
- [ ] Beslissing vastgelegd: belofte + voorbehoud

### Fase 7 — Gates: kanaal als dimensie

Geen eigen gate-laag. Kanaal als dimensie over G1–G4. Soft budget-gate op latency blijft
backlog (`cao.eval.ts:33`), niet in dit plan.

- [ ] `docs/eval/GATE-ARCHITECTURE.md` bijgewerkt
- [ ] Drempels gedocumenteerd

### Fase 8 — Fondsdocumentatie

- [ ] `docs/integrations/copilot-studio-setup.md`
- [ ] `docs/security/mcp-server.md` (security-officer-vragen)
- [ ] DPIA-input: soevereiniteitsclaim per-laag (sectie 0 citeren); juridische toetsing vereist
- [ ] Restrisico uit fase 6 expliciet vermeld

---

## 3. Buiten scope

Entra/OAuth per gebruiker · meerdere tools · directory-publicatie · multi-tenancy.

---

## 4. Aannames

- *(aanname)* Hostlimiet Copilot Studio ligt boven p95 van de pipeline → fase 1b + 2 verifiëren.
- *(aanname)* Copilot geeft tool-output grotendeels ongewijzigd door bij expliciete instructie →
  fase 6.
- *(aanname)* Fondsen hebben licenties/rechten voor custom MCP in Copilot Studio → intake.
- *(feit)* Copilot Studio ondersteunt Streamable HTTP; SSE niet meer sinds augustus 2025.
- *(feit)* Claude verbindt vanuit Anthropic's cloud; endpoint moet publiek bereikbaar zijn.
- *(feit)* MCP-spec: `content` is model-gericht; `structuredContent` is machine-gericht;
  tool-fouten horen in het resultaat met `isError: true`.

---

## 5. Opruimacties (los)

- `docs/STATUS.md:162` actualiseren (stale under-refusal 0.333).
- Verwijzingen naar `PLAN-mcp-connector.md` nalopen (grep).
