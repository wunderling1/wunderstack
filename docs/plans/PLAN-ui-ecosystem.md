# PLAN — UI-ecosysteem Wunderstack

**Repo-locatie:** `docs/plans/PLAN-ui-ecosystem.md`
**Status:** concept ter goedkeuring · **Datum:** 2026-07-20 · **Herzien:** 2026-07-22 (verzoend met het
reeds uitgevoerde `PLAN-ui-foundation`; vijf ontgrendelende beslissingen verwerkt als D13–D17; evals-
restructuur uit dit plan getrokken; console gepromoveerd tot tenant-zero-demo)
**Gerelateerd:** `docs/plans/PLAN-ui-foundation.md` (uitgevoerd — het fundament onder dit plan),
`docs/decisions/DECISION-ui-foundation.md`, `PLAN-v3.md` (Fase 14–17),
`docs/plans/PLAN-gate-restructure.md`, `docs/eval/GATE-ARCHITECTURE.md`

---

## 0. Wat al staat (fundament uit `PLAN-ui-foundation`)

Dit plan bouwt bovenop een reeds geleverd en groen fundament. Herbouw niets hiervan; hernoem/verplaats
conform de fases.

| Geleverd | Locatie | Bestemming in dit plan |
|---|---|---|
| `@wunderstack/ui` — tokens (primitive/semantic/theme), primitives, chat-componenten | `packages/ui/src/{tokens,primitives,chat}` | Blijft `packages/ui`; laag 3 wordt hernoemd naar `trust-patterns` (D16) |
| Drie-lagen tokens + Tailwind v4 `@theme`, `[data-fund]`-seam | `packages/ui/src/tokens/*.css` | Blijft; `[data-fund]` blijft v1, migratie naar `GET /config` in fase 4 (D17) |
| Agent-catalogus-seam | `packages/agents/src/catalog.ts` (`listAgents`, `getAgent`, `agentDescriptorSchema`) | Groeit naar per-agent-identiteit + activatie-per-instance (D6) |
| Grensregels UI ⊄ agents | `.dependency-cruiser.cjs` (`no-ui-to-agents`), ESLint, `scripts/check-ui-boundaries.sh`, `.cursor/rules/ui-boundaries.mdc` | Uitbreiden — géén tweede tool (aanbeveling A) |
| Interne agent-testchat | `apps/console` | **Gepromoveerd tot tenant-zero-demo `apps/demo`** (D13); naam `console` vrijgegeven voor admin-beheer |
| Publieke CAO-demo + agent-API + hardening in één Next-app | `apps/demo` (huidig) | **Gestript tot `apps/runtime`** (API-only, fund-agnostisch) (D14) |

Twee sporen-aanpassingen t.o.v. het oorspronkelijke concept:
- **Aanbeveling A (grenstooling):** breid de bestaande dependency-cruiser + ESLint uit; introduceer géén
  `eslint-plugin-boundaries` als tweede mechanisme (v4-principe). Verwerkt in 0.2.
- **Aanbeveling B (evals):** de evals-restructuur (voorheen 0.3) is **uit dit plan getrokken** naar een eigen
  spoor onder `docs/plans/PLAN-gate-restructure.md`. Het is zwaar, gegated en orthogonaal aan UI; het mag de
  UI-voortgang niet blokkeren. Zie §7.

---

## 1. Doel en scope

Dit plan definieert de UI-laag en surface-architectuur bovenop de Wunderstack-fundering: marketingsite met
agent-catalogus, fonds-dashboard met admin-console, embed/API als productoppervlak, en tenant zero als
demo-omgeving. Uitgangspunt is dat de architectuur schaalbaar staat (meerdere agents per fonds, meerdere
fondsen) zonder nu te bouwen voor demand die niet bestaat (v4-principe).

**Buiten scope:** agent-kwaliteitswerk (under-refusal, Gate F/B2) loopt parallel en wordt door dit plan niet
geblokkeerd of verborgen. Het dashboard toont gate-status eerlijk: rode balken blijven rood. Ook de
evals-restructuur valt buiten scope (§7, aanbeveling B).

**Raakvlakken met PLAN-v3:** Fase 1 (observability-fixes) overlapt met production hardening (v3 Fase 14) en
levert het fundament voor pilot-metrics (v3 Fase 16). Kruisverwijzen bij uitvoering, niet dupliceren.

---

## 2. Doelarchitectuur

### 2.1 Surfaces en origins

| Origin | App | Rol |
|---|---|---|
| `wunderling.nl` | `apps/marketing` | Publiek: merk, agent-catalogus, demo-embed. Statisch/ISR, content als MDX in repo. |
| `dashboard.wunderling.nl` | `apps/dashboard` | Eén app, twee route groups: `(fund)` voor fondsen, `(admin)` voor Wunderling (incl. het beheer dat "console" heet). |
| `api.wunderling.nl` | `apps/runtime` (OOMT-instance) | Productoppervlak voor embed. Wijst v1 naar de OOMT-instance (D3). |
| — (per instance) | `apps/runtime` | De Wunderstack-runtime: agent-API, corpus-lifecycle, G4-guards, instrumentatie, health-endpoint. **API-only Next-app, geen UI** (D14). |
| (tenant zero) | `apps/demo` | Publieke demo-UI (gepromoveerde ex-`apps/console`): publiek chatten met een agent tegen de tenant-zero-runtime (D13). |

Rationale aparte origins: cookie-/sessie-isolatie (pad-scoping is geen security-boundary), onafhankelijk
deploy-ritme marketing vs. release-gated product, en procurement-argument ("uw data-omgeving deelt geen
origin met onze publieke website"). Subdomeinen kosten €0; de rekening wordt bepaald door draaiende apps.

### 2.2 Instance-model

```
instance = Wunderstack@release-tag + fondsconfig (env) + fondscorpus + fonds-goldensets
```

```
            wunderstack monorepo (main)
                      │  gates per agent (Turbo, D7/D8)
                      ▼
              release tag vX.Y  ──→ manifest: per agent gate-run + input-hashes
                      │
      ┌───────────────┼──────────────────┐
      ▼               ▼                  ▼
OOMT-instance    tenant zero (demo)   staging (main)
runtime@vX.Y     runtime@vX.Y
TENANT=oomt      TENANT=demo, dummy corpus, open + rate-limited
      ▲               ▲
      │ embed/API     │ apps/demo (publieke demo-UI) + demo-embed op wunderling.nl
      │ read-only (packages/analytics)
      ▼
dashboard.wunderling.nl
```

Agents zijn modules binnen `packages/agents`, geactiveerd per instance via config — géén aparte services
(D6). Identiteit per agent (eigen golden sets, gates, `agent_id`, dashboard-status), infrastructuur per fonds.

### 2.3 Monorepo-doelstructuur

```
apps/
  runtime            → API-only Next-app; deployt naar elke fondsinstance + tenant zero (D14)
  demo               → tenant-zero publieke demo-UI (ex-console, D13)
  dashboard          → dashboard.wunderling.nl, route groups (fund) en (admin) incl. console-beheer
  marketing          → wunderling.nl
packages/
  ui                 → tokens, primitives, trust-patterns (laag 3, D16)
  embed              → framework-agnostisch web component, Artikel 50-melding ingebouwd
  analytics          → event-log-schema + KPI-queries (dashboard consumeert)
  agents/            → agent-modules (bevat reeds catalog.ts); per-agent identiteit + activatie-per-instance
  tenant             → tenant-context uit env (TENANT=…), tenant↔fund-mapping (D15)
  db / config        → bestaand; presets gedeeld
```

Evals leven onder een eigen spoor (§7), niet in dit plan.

**Grensregels (CI-afgedwongen):** apps importeren uit packages, nooit andersom; packages importeren nooit uit
apps en onderling uitsluitend via gedeclareerde workspace-dependencies; `ui` kent geen `agents`-concepten
(reeds afgedwongen: `no-ui-to-agents`). De architectuurscheiding komt van deze regels bínnen één monorepo —
niet van repo-grenzen (D11). **Handhaving: breid de bestaande dependency-cruiser + ESLint uit; geen tweede
tool** (aanbeveling A). Eén repo blijft ook één Cursor-project; agent-scoping via geneste `.cursor/rules` en
`AGENTS.md` per map.

### 2.4 Design system — drie lagen

1. **Tokens** — CSS custom properties (kleur, typografie, spacing, radius). *Geleverd.* Voorbereid op
   per-fonds theming via de `[data-fund]`-seam; runtime-injectie komt pas in fase 4 (D17).
2. **Primitives** — Button, Card, Table, Dialog, Badge, Input. Radix-basis, shadcn-stijl copy-in. *Deels
   geleverd* (Button, Card, Field/Input, Chip/Badge, IconButton, Avatar, Icon); Table + Dialog resteren.
3. **Trust-patterns** — CitationBlock, AnswerCard, AgentStatusBadge, KPITile; later ConfidenceIndicator,
   AuditTrail. Gedeeld door embed, dashboard en demo — de visuele vertaling van de grounding-architectuur.
   *Herkomst uit geleverde chat-componenten* (D16): `source-block` + `citation-badge` → **CitationBlock**,
   `message-bubble` → **AnswerCard**, `refusal-notice` blijft trust-pattern. `chat-composer`/`chat-thread`
   verhuizen naar app-lokaal (geen gedeeld trust-pattern). AgentStatusBadge + KPITile zijn nieuw.

Sober default-thema; geen persona-elementen. Marketing gebruikt tokens + expressieve laag (wunder-lexicon).

### 2.5 Eval-compositie

Verplaatst naar een eigen spoor — zie §7 en `docs/plans/PLAN-gate-restructure.md`.

---

## 3. Beslislog

Ongewijzigde entries D1–D12 blijven zoals in het oorspronkelijke concept (weggelaten hier voor de leesbaarheid;
canoniek in de git-historie van dit bestand). Nieuwe/aangescherpte entries:

| ID | Beslissing | Status | Herzieningscriterium |
|---|---|---|---|
| D1 | Productapp op `dashboard.wunderling.nl` | default | Meer dan dashboarding onder zelfde origin → `app.` |
| D2 | Console same-origin, rolgebaseerd binnen dashboard-app | default | Fonds-2-procurement eist split, of >1 admingebruiker |
| D3 | `api.wunderling.nl` → OOMT-instance; endpoint als embed-config | default | Fonds 2: gateway vs. per-fonds-subdomein |
| D4 | Dashboard-data via read-only DB-rol (`packages/analytics`) | default | Fonds 2: insights-endpoint per instance |
| D5 | Demo op eigen tenant-zero-instance, gepind op laatste release-tag | default | — |
| D6 | Agent = module in gedeelde runtime, geen aparte service | default | Contractuele isolatie / extreme scaling-asymmetrie / multi-dev agent-ownership |
| D7 | Gate-groen geldig zolang gedeclareerde inputs ongewijzigd; nightly full matrix | default | Judge-drift materieel binnen 24u |
| D8 | Eval-compositie: invariants + profiles + instance-config | verplaatst | Zie §7 |
| D9 | Demo: dummy corpus ("CAO Fictief"), open, rate-limited, geen gating | **besloten** (JW, 2026-07-20) | — |
| D10 | Sequencing: data-fundament eerst; marketing + tenant zero laatst | default | Concreet demomoment → fase 5 naar voren |
| D11 | Eén monorepo, één Cursor-project; scheiding via CI-importgrenzen | default | Apart team met eigen rechten, of open-sourcen |
| D12 | Beheer gesplitst: gedragsconfig = config-as-code via gates/release-tag; presentatie-/ontsluitingsconfig = data, admin-only in de console | default | Delegatie naar fondsen (RBAC); nood-uitschakelaar als aparte ops-tooling |
| **D13** | **`apps/console` wordt gepromoveerd tot de tenant-zero-demo (`apps/demo`); de naam "console" is voortaan het admin-beheer binnen `apps/dashboard (admin)`** | **besloten (JW, 2026-07-22)** | Demo-embed op marketing vervangt de losse demo-app volledig |
| **D14** | **`apps/runtime` is een API-only Next-app (UI eruit gestript), geen losse service** | **besloten (JW, 2026-07-22)** | Runtime-eisen die een Next-app niet aankan |
| **D15** | **tenant = instance/deployment-identiteit; fund = de klant; in de praktijk 1-op-1 (één tenant per fonds), tenant-zero = het demo-fonds. Eén tabel; `fund` blijft domeinwoord, `tenant_id` de technische sleutel** | **besloten (JW, 2026-07-22)** | Meerdere fondsen op één instance |
| **D16** | **`packages/ui` laag 3 heet `trust-patterns`; chat-composer/-thread verhuizen naar app-lokaal; `ui` bevat alleen wat ≥3 consumers delen** | **besloten (JW, 2026-07-22)** | — |
| **D17** | **`[data-fund]` blijft het theming-mechanisme voor v1; migratie naar `GET /config`-injectie gepland in fase 4, niet eerder** | **besloten (JW, 2026-07-22)** | Embed vereist runtime-theming eerder dan fase 4 |

---

## 4. Fases

Sequentieel; fase n+1 start pas na akkoord op de DoD van fase n.

### Fase 0 — Repo-vangrails & runtime-carve-out

**Doel:** de Wunderstack-runtime als expliciete, fund-agnostische API-only deployable; de monorepo-indeling
afgedwongen door CI. Alles verloopt als verhuizing bínnen één repo (D11): elk tussenstadium blijft werkend en
deploybaar.

**Vangnet:** al het fase 0-werk landt op `main`; de OOMT-instance staat gepind op zijn release-tag en wordt
pas geraakt bij het bewust zetten van een nieuwe tag — na groene gates.

**0.1 — Inventarisatie (foto vóór de verhuizing)**
- Audit van de huidige apps → `docs/audit/AUDIT-app-inventory.md`; elk onderdeel geclassificeerd als
  *runtime* (naar `apps/runtime`), *demo-UI* (naar de gepromoveerde `apps/demo`), *te behouden UI* (naar
  `apps/dashboard`-skelet) of *wegwerp-experiment*, met file-path-evidence. Twee bekende feiten als startpunt:
  `apps/demo` (huidig) koppelt agent-API (`app/api/{chat,passage,feedback,webhook}`) + hardening (`proxy.ts`,
  rate-limit, `resolveFundScope`) aan demo-UI; `apps/console` is de simpelere agent-testchat.

**0.2 — Vangrails vóórdat er iets verhuist**
- Importgrenzen conform §2.3 **door de bestaande dependency-cruiser + ESLint uit te breiden** (geen tweede
  tool, aanbeveling A); pnpm's strikte workspace-dependencies als tweede slot. Voeg de nieuwe apps
  (`runtime`, `demo`, `dashboard`, `marketing`) en packages (`embed`, `analytics`, `tenant`) toe aan de
  regelset zodra ze bestaan.
- Geneste `.cursor/rules` + `AGENTS.md` per app en per package; het bestaande `.cursor/rules/ui-boundaries.mdc`
  wordt hierin opgenomen/verplaatst.
- Verhuisprotocol in de agent-rules: verplaatsen (`git mv` + import-fixes) en refactoren nooit in dezelfde PR;
  één soort verandering per PR; elke PR groen op de gates.

**0.3 — Runtime-carve-out & console-promotie (strippen, niet herbouwen)**
- **`apps/demo` (huidig) → `apps/runtime`**: strip de UI (`app/(demo)`, `app/widget`, `components/chat`); behoud
  API-routes + hardening + de `@wunderstack/agents`-seam. Tenant-identiteit uitsluitend uit env
  (`TENANT=oomt`); geen hardcoded fondsreferenties (grep-evidence). De demo-UI die je behoudt verhuist naar de
  gepromoveerde `apps/demo` (volgende stap), niet naar runtime.
- **`apps/console` → `apps/demo`** (git mv, ná de eerste rename om naamcollisie te vermijden): dit is de
  publieke tenant-zero-demo-UI (D13). Verrijk waar nodig met de behouden chat-features uit de oude demo
  (passage-fetch, feedback, markdown, starters) — als app-lokale componenten of via `packages/ui/trust-patterns`.
  De `console`-naam is hierna vrij voor het admin-beheer in `apps/dashboard`.
- `packages/tenant`: tenant-context uit env + de tenant↔fund-mapping (D15) als één bron van waarheid, vóór er
  schema's op leunen.

**Prerequisite (stond al open):** branch protection actief; evidence in `docs/eval/evidence/`.

DoD:
- [ ] `docs/audit/AUDIT-app-inventory.md` bestaat; elk onderdeel geclassificeerd met file-path-evidence
- [ ] Importgrenzen actief in CI: een opzettelijke verboden import (package → app) laat CI aantoonbaar falen
      (CI-run als evidence); dependency-cruiser uitgebreid, géén tweede tool toegevoegd
- [ ] Geneste `.cursor/rules` + `AGENTS.md` per app en per package, incl. verhuisprotocol; `ui-boundaries` opgenomen
- [ ] `apps/runtime` deployt naar OOMT-instance, functioneel ongewijzigd (deploy-log + smoke test), geen UI meer
- [ ] Geen hardcoded fondsreferenties in `apps/runtime` (grep-output)
- [ ] `apps/demo` (ex-console) draait als publieke chat tegen tenant zero; behouden features geïntegreerd
- [ ] `packages/tenant` levert tenant↔fund-mapping (D15); één tabel, `tenant_id` als sleutel
- [ ] Verhuis-PR's bevatten geen functionele wijzigingen (diff-review als evidence)

### Fase 1 — Event-log & observability-fundament

**Doel:** elke interactie landt met volledige dimensies in de fondsdatabase; Langfuse-gaten dicht. Vroeg
gesequenced zodat data accumuleert vóór het dashboard live gaat.

Werkzaamheden:
- `packages/analytics`: event-schema met `tenant_id` (D15-sleutel), `agent_id`, `session_id`, `user_id`
  (nullable — embed-gebruikers zijn pseudoniem), timestamp, answered/refused, citation-count,
  feedback-signaal, thema-metadata. Bestaande provenance-logging formaliseren, niet dupliceren.
- Runtime schrijft events bij elke interactie; zelfde `session_id` in Langfuse-traces (één identiteitsmodel).
- Langfuse-fixes: modelprijzen voor `mistral-small-2603` en `qwen3-embedding`; embedding-latency-instrumentatie
  om de echte HTTP-call; `user_id`, `session_id`, environment-tags, fund-metadata.
- Read-only Postgres-rol `analytics_reader` + RLS-beleid voor dashboard-toegang.
- AVG: querytekst is potentieel gevoelig. Default: queries loggen, retentie 90 dagen (als beleidskeuze
  vastleggen), geen user-identificatie in embed v1.

DoD:
- [ ] Events landen in OOMT-db met alle dimensies (rij-evidence)
- [ ] Langfuse-trace toont kosten ≠ 0, reële embedding-latency, alle tags (screenshot-evidence)
- [ ] `analytics_reader` kan lezen, niet schrijven; RLS getest (geweigerde query als evidence)
- [ ] Retentiebeleid gedocumenteerd (ADR of DECISION-file)

### Fase 2 — Design system v1 (afmaken)

**Doel:** `packages/ui` compleet als gedeelde bron voor dashboard, embed en marketing. *Deels geleverd door
`PLAN-ui-foundation`; hier afmaken en herordenen.*

Werkzaamheden:
- Tokens: geleverd (geen actie behalve de fase-4-migratiehaak bewaken, D17).
- Primitives: aanvullen met **Table** en **Dialog** (Button, Card, Field, Chip/Badge, IconButton, Avatar, Icon
  bestaan al).
- Laag 3 herordenen naar `packages/ui/src/trust-patterns/` (D16): `source-block` + `citation-badge` →
  **CitationBlock**; `message-bubble` → **AnswerCard**; `refusal-notice` blijft; nieuw: **AgentStatusBadge**,
  **KPITile**. Verplaats `chat-composer`/`chat-thread` naar app-lokaal in `apps/demo`.
- Lichtgewicht preview-route (geen zware Storybook-setup voor solo-gebruik).

DoD:
- [ ] Tokens + primitives (incl. Table, Dialog) + vier trust-patterns in `packages/ui`, preview-route werkt
- [ ] `chat-composer`/`chat-thread` zijn app-lokaal; `ui` bevat alleen gedeelde patronen (D16)
- [ ] Geen persona-elementen (check tegen paritaire framing)
- [ ] CitationBlock rendert bron + verificatiestatus vanuit het bestaande citation-datamodel

### Fase 3 — Dashboard (fund + admin)

**Doel:** één app, twee gezichten: fonds ziet eigen agents en KPI's; Wunderling ziet alles plus
release-/gate-diepte. De "console" (admin-beheer) leeft hier, in de `(admin)`-groep.

Werkzaamheden:
- `apps/dashboard` uitbouwen (skelet + behouden proto-UI uit fase 0): route groups `(fund)` en `(admin)`;
  Auth.js met rollen; fondssessies via RLS-rol, admin via adminrol. Refactoren mag nu wél.
- Fund-view: KPI's (aantal vragen, beantwoordingsgraad-met-geverifieerde-citaties, top-thema's,
  **onbeantwoorde vragen** als corpus-roadmap-signaal), query-log, read-only corpuspaneel. Geen
  latency/tokens/modelscores.
- KPI-noot: "beantwoord met geverifieerde citaties" is de v1-maat; dashboard-copy claimt niet meer dan de
  metriek meet.
- Admin-view: agent-overview per instance (release-tag, gate-status laatste run, goldenset-versie,
  corpusversie, kosten, Langfuse-deeplink); detailview toont release-manifest incl. profielversie,
  invariantversie en threshold-afwijkingen met ADR-links. Presentatie-/ontsluitingsbeheer (embed, keys,
  theming) landt in fase 4 in dezelfde `(admin)`-groep (D12).
- Deploy op `dashboard.wunderling.nl`.

DoD:
- [ ] Fund-rol ziet uitsluitend eigen tenant-data; admin-routes/-data aantoonbaar geweigerd (test-evidence)
- [ ] Alle fund-KPI's gevoed uit `packages/analytics` (geen Langfuse-proxy)
- [ ] Admin-detailview toont manifest-velden incl. afwijkingen → ADR
- [ ] DNS + TLS live op `dashboard.wunderling.nl`

### Fase 4 — Embed & API-oppervlak (incl. theming-migratie)

**Doel:** de agent ontsloten als embeddable component tegen een gehard publiek API-oppervlak; hier migreert het
theming-mechanisme van `[data-fund]` naar runtime-injectie (D17).

Werkzaamheden:
- `packages/embed`: framework-agnostisch web component; endpoint + publieke tenant-key als configuratie;
  citaties native via trust-patterns; **Artikel 50-transparantiemelding standaard aan**.
- **Stabiel snippet-principe:** de embed-snippet is minimaal en onveranderlijk (script-src, tenant-key,
  agent-id). Al het veranderlijke haalt het embed op via een publiek `GET /config`-endpoint op de fondsinstance.
- **Tenant-theming (D17-migratie):** een tenant-theme is een gecureerde subset van de tokens uit fase 2
  (primary, accent, radius, logo), per fonds. Leeft in `tenant_config` op de fondsinstance; `GET /config`
  serveert het; het embed injecteert het als CSS custom properties. **Dit vervangt de `[data-fund]`-seam als
  productmechanisme; de seam blijft bestaan als default-thema-fallback.**
- **Console-beheer (admin-only, D12) in `apps/dashboard (admin)`:** distributiepaneel per tenant met
  gegenereerd snippet + copy-knop, tenant-key (tonen/roteren), CORS-allowlist; theming-formulier op de
  gecureerde token-subset.
- **Tweede DB-rol:** naast `analytics_reader` (D4) een `tenant_config_writer` met schrijfrecht op uitsluitend
  de `tenant_config`-tabellen.
- API-hardening op runtime: publieke tenant-key per fonds, CORS-allowlist per key, rate limiting per key en per
  IP (bouwt voort op de reeds bestaande rate-limit/slot/CSP-hardening uit de oude demo, nu in `apps/runtime`).
- `api.wunderling.nl` → OOMT-instance (D3).

DoD:
- [ ] Embed werkt cross-origin vanaf een testpagina buiten de eigen origins
- [ ] Snippet bevat uitsluitend script-src/key/agent-id; kleur-/tekstwijziging via console live zónder nieuwe snippet
- [ ] `GET /config` serveert theme + teksten per tenant; embed injecteert als CSS custom properties
- [ ] Console-distributiepaneel: snippet-copy, key-rotatie, CORS-bewerking werken (admin-only; fund-rol geweigerd)
- [ ] Theming-form schrijft naar `tenant_config` via `tenant_config_writer`; rol kan niet buiten die tabellen schrijven
- [ ] Rate limit aantoonbaar (429-evidence); CORS-allowlist blokkeert niet-gelist domein
- [ ] Artikel 50-melding zichtbaar zonder configuratie
- [ ] Embed-config gedocumenteerd (snippet dat een fonds letterlijk plakt)

### Fase 5 — Tenant zero & marketing-skeleton

**Doel:** publieke demo als exact productiepad, plus de catalogus als contentlaag. Geen deadline (D10).

Werkzaamheden:
- Dummy corpus "CAO Fictief": realistisch gestructureerd; kleine demo-goldenset; volledige ingestion + gates
  zoals elk corpus.
- Tenant-zero-instance: `TENANT=demo`, gepind op laatste release-tag, open toegang, rate limits per IP + globale
  daily cap. `apps/demo` (de gepromoveerde ex-console, D13) is de publieke demo-UI hiertegen.
- `apps/marketing`: home, catalogusoverzicht, detailpagina per agent. **Alleen de CAO-agent krijgt een live
  demo** (het embed uit fase 4, of `apps/demo`, gericht op tenant zero); overige agents scripted walkthrough.

DoD:
- [ ] Demo op `wunderling.nl` praat met tenant zero (embed zonder fork, of `apps/demo` gepind op release-tag)
- [ ] Tenant zero draait op release-tag (niet staging); daily cap actief
- [ ] Catalogus online; per agent een contentpagina
- [ ] "CAO Fictief" passeert dezelfde ingestion-pipeline en gates als een echt corpus

---

## 5. Niet-doelen / v4-parkeerplaats

- Multi-fonds API-gateway en per-fonds-subdomeinen (D3-herziening bij fonds 2)
- Cross-fonds-aggregatie in de admin-view (console leest v1 de OOMT-instance direct)
- Corpusbeheer-schrijfpad voor fondsen — v1 is read-only corpuspaneel
- White-label theming buiten de gecureerde token-subset (D17)
- Live demo's voor niet-bestaande agents
- AI Kompas op de marketingsite (uitgesteld)
- Accounts/identiteit voor embed-eindgebruikers
- Evals-restructuur (eigen spoor, §7)

## 6. Aannames te verifiëren in Fase 0

1. (aanname) Chat-/agent-API-routes bestaan al in bruikbare vorm — **bevestigd**: `apps/demo/app/api/*`.
2. (aanname) Provenance-/interactielogging dekt het event-schema deels.
3. (aanname) Staging-flow (main → staging-instance) functioneert zoals in het instance-diagram.

## 7. Uitgetrokken spoor — evals-compositie (aanbeveling B)

De herstructurering van `packages/agents/src/evals/` naar gedeelde `framework/` + `invariants/` +
`profiles/rag-qa/` + per-agent `eval.config.ts` (voorheen 0.3, D8) is **uit dit plan getrokken**. Reden: het is
zwaar, gegated (700-evals-regel: `src/evals/` niet aanraken buiten expliciete opdracht; `eval-lock` /
`eval-model-coupling` tests) en orthogonaal aan de UI-architectuur. Het hoort thuis onder
`docs/plans/PLAN-gate-restructure.md` en `docs/eval/GATE-ARCHITECTURE.md`, en mag de UI-voortgang niet
blokkeren. Turbo-task-inputs per agent (voor selectieve gate-triggering, D7) verhuizen mee naar dat spoor.
