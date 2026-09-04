# Audit fase 0 — repo-niveau

| Veld | Waarde |
|---|---|
| Datum | 2026-09-04 |
| Verse clone | `origin/main` `63205ed953172170d2381490e8ff06da56c069d1` (2 september 2026, `fix(db): recognise outcome CHECK failures inside Drizzle's Failed query wrapper`) |
| Lokale worktree | branch `perf/dashboard-2026-09-01` @ `4bea381` + 400 ongecommitte paden (363 `M`, 33 `??`, 1 `D`, 2 `RM`, 1 `R`) |
| Omgeving | macOS darwin 25.6.0, Node v24.5.0, pnpm 11.9.0. Clone in `/tmp/wunderstack-fase0-2026-09-04`. `pnpm install` hergebruikte de lokale store (`reused 536, downloaded 0`) — geen koude cache. Geen esbuild-binary-omweg nodig; install was groen. |
| Meetlat | `docs/audit/RUBRIC-externe-review.md` — ontbrak bij aanvang, neergezet vóór de oordelen (assen A/B/F + §3). |
| DoD `git status` | **niet gehaald.** Porcelain toont de bestaande dirty tree plus dit bestand en de rubric. Niets opgeruimd (auditprompt). |
| Rangschikking | Vervangen 2026-09-04 door `docs/plans/PLAN-q4-gereedheid.md`. Dit bestand blijft de fase-0-audit. |

Uitgangsstaat (vóór deze audit): `git status --porcelain` was al niet leeg. `claude/` untracked. Lokale `main` staat op `12791fb` (1 september), zes commits achter `origin/main`. Aanname bevestigd: `origin/perf/dashboard-2026-09-01` is **niet** gemerged (`origin/main...origin/perf/dashboard-2026-09-01` = 6 / 6).

Commitvorm laatste 30: overwegend conventional (`fix(…)`, `feat(…)`, `docs(…)`, `chore(…)`, `perf(…)`, `refactor(…)`, `test(…)`, `build(…)`), plus merge-subjects zonder colon. Geen Nederlandse commit-subjects in de laatste 60.

---

## Deel 1 — De verse-clone-test

Clone van `https://github.com/wunderling1/wunderstack.git`, default branch `main`, HEAD `63205ed`. `claude/` zit **niet** in de clone.

**README gevolgd, niets anders.** `README.md` is 14 bytes:

```
# wunderstack
```

Geen install, geen Node-versie, geen `pnpm`, geen poorten, geen `.env`, geen `dev`. Afwijking: de tekst die er had moeten staan is minstens: Node ≥ 22.13, pnpm via `packageManager`, `pnpm install`, kopieer `.env.example` → `.env`, welke secrets verplicht zijn om iets te zien, en hoe runtime `:3000` / playground `:3001` / dashboard `:3002` / marketing `:3003` / roleplay `:3004` starten. Die tekst staat deels in `AGENTS.md` en app-`AGENTS.md`, niet in de README.

**Verse-clone-tijd tot draaiende dev-omgeving: niet bereikt.** Clone zelf 2,1 s (09:27:18–09:27:20 UTC). Inspectie README: onmiddellijk gestrand. Dat is de belangrijkste uitkomst van fase 0. De commando's hieronder zijn daarna wél gedraaid (auditprompt deel 1.4), in de verse clone, zonder `.env` en zonder API-keys in de shell.

Wall-clock clone-start tot laatste guard: **5 min 6 s** (09:27:18–09:32:24 UTC). Dat is “gates zonder app”, niet “dev-omgeving”.

### Commando’s

| Commando | Oordeel | Tijd | Reden |
|---|---|---|---|
| `pnpm install --frozen-lockfile` | groen | 10 s | Exit 0. Store-reuse; koude download niet gemeten. |
| `pnpm turbo run typecheck` | groen | 16 s | 19/19 tasks. |
| `pnpm turbo run lint` | groen | 8 s | 19/19 tasks. |
| `pnpm turbo run test` | groen* | 2 s | Alleen `@wunderstack/agents`. G2/G3 SKIPPED. Zie ruwe uitvoer. |
| `pnpm turbo run build` | rood | 0 s | Turbo kent geen task `build`. |
| `node_modules/.bin/depcruise apps packages scripts` | groen | 1 s | 757 modules, 2216 deps, geen violations. |
| `scripts/check-root.sh` | groen | <1 s | Alleen **getrackte** root-entries. |
| `scripts/check-ui-boundaries.sh` | groen | <1 s | |
| `scripts/check-motion.sh` | groen | <1 s | |

\*Groen onder D1: **nee, dit telt niet als “de test suite werkt”.** De eval skipte G2/G3 en printte PASSED.

Root heeft geen `dev` en geen `test`. `pnpm test` / `pnpm dev` zijn op een verse clone niet-uitvoerbaar.

### Ruwe uitvoer

**install (staart):**

```
Done in 9.6s using pnpm v11.9.0
INSTALL_EXIT=0
```

**typecheck (staart):**

```
 Tasks:    19 successful, 19 total
Cached:    0 cached, 19 total
  Time:    14.672s
TYPECHECK_EXIT=0
```

**lint (staart):**

```
 Tasks:    19 successful, 19 total
Cached:    0 cached, 19 total
  Time:    8.11s
LINT_EXIT=0
```

**test (volledig relevant deel):**

```
• Running test in 19 packages
@wunderstack/agents:test: $ tsx --env-file-if-exists=../../.env src/evals/cao.eval.ts
@wunderstack/agents:test: ../../.env not found. Continuing without it.
G1 · G1-contract — … [PASS] (alle contract-checks)
G1 · G1-roleplay-contract — … [PASS] (alle contract-checks)
G2 · G2-retrieval: SKIPPED (SCALEWAY_API_KEY not set).
G2 · G2-multi-turn: SKIPPED (SCALEWAY_API_KEY and MISTRAL_API_KEY required).
G2 · G2-answer: SKIPPED (SCALEWAY_API_KEY and MISTRAL_API_KEY required).
G2 · G2-roleplay-persona: SKIPPED (MISTRAL_API_KEY not set).
G2 · G2-roleplay-review: SKIPPED (MISTRAL_API_KEY not set).
G3 · G3-pipeline: SKIPPED (DATABASE_URL and SCALEWAY_API_KEY required).
G3 · G3-fund: SKIPPED (DATABASE_URL, SCALEWAY_API_KEY and MISTRAL_API_KEY required).
G3 · G3-isolation: SKIPPED (DATABASE_URL and SCALEWAY_API_KEY required).
Eval PASSED.
 Tasks:    1 successful, 1 total
  Time:    2.258s
TEST_EXIT=0
```

Unit tests (`turbo run test:unit`) zijn **niet** dit commando. Alleen `packages/agents` heeft een `test`-script; dat is de eval.

**build:**

```
• turbo 2.10.2
  x Missing tasks in project
  `->   x Could not find task `build` in project
BUILD_EXIT=1
```

(`package.json` heeft wél `"build": "pnpm --filter @wunderstack/embed build && …"`. Dat is een ander commando. D1: omweg telt niet.)

**depcruise:**

```
✔ no dependency violations found (757 modules, 2216 dependencies cruised)
DEPCRUISE_EXIT=0
```

**check-root / check-ui-boundaries / check-motion:**

```
check-root: ok — all tracked root entries are allowlisted.
CHECK_ROOT_EXIT=0
UI boundary checks passed.
CHECK_UI_EXIT=0
Motion checks passed.
CHECK_MOTION_EXIT=0
```

### Wat ontbreekt om iets te kúnnen draaien

`.env.example` bestaat (clone + worktree). Zonder ingevulde waarden:

| Nodig voor | Keys / dienst | In `.env.example`? |
|---|---|---|
| Postgres + ingest + dashboard-reads | `DATABASE_URL`, `PROVISIONER_DATABASE_URL` (geen fallback) | ja, leeg |
| LLM-antwoord | `MISTRAL_API_KEY` (Mistral) | ja, leeg |
| Embeddings / rerank / G2-retrieval | `SCALEWAY_API_KEY` (Scaleway) | ja, leeg |
| Dashboard-login | `AUTH_SECRET` | ja, leeg |
| Tracing | `LANGFUSE_PUBLIC_KEY` / `SECRET_KEY` | ja, leeg |
| MCP | `MCP_SIGNING_SECRET`, `MCP_BEARER_TOKEN` | ja; bearer heeft een ingevulde hex, geen placeholder |
| Playground/roleplay proxy | `RUNTIME_URL` (default localhost:3000) | becommentarieerd |
| Unconfigured chat | `RUNTIME_UNCONFIGURED_AGENT=cao` | ja |

Een reviewer zonder secrets krijgt: groene typecheck/lint, een eval die G1 draait en G2/G3 overslaat, geen Next-build via het gevraagde commando, geen draaiende app. D4: ontbrekend `.env.example` is het probleem niet; ontbrekende **starttekst** is het wel.

Open uit 1 september, opnieuw gecontroleerd op `origin/main`:

- B5 (`tenantThemeSchema.parse` op de leesroute) — **dicht.** `apps/dashboard/lib/settings-load.ts:45` parseert. Geen F0.
- B6 — open (`corpus.ts:33`).
- B7 — open (analytics `AGENTS.md` vs `signals.ts`).

---

## Deel 2 — Rootoppervlak en tooling

### Root, getrackt vs filesystem

Getrackte root (allowlist in `scripts/check-root.sh:19-38`) komt overeen met `git ls-files` op de clone: `.cursor`, `.dependency-cruiser.cjs`, `.env.example`, `.github`, `.gitignore`, `AGENTS.md`, `Procfile`, `README.md`, `apps`, `docs`, `eslint.config.mjs`, `package.json`, `packages`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `scripts`, `tsconfig.base.json`, `turbo.json`.

Filesystem-root extra (niet getrackt, dus `check-root` zwijgt): `claude/`, `code-reviews/`, `.env`, `tmp/`, `.turbo/`, `.pnpm-store/`, `.tmp/`. Allowlist wijkt niet af van wat er **getrackt** staat. De val is dat untracked rommel de guard niet ziet.

Vijf-seconden-test per getrackte root-entry: config en code-mappen zijn herkenbaar. `README.md` is dat niet. `Procfile` is herkenbaar voor wie Scalingo kent, niet voor een willekeurige senior. `AGENTS.md` is het echte instapdocument — en heet niet README.

### Scripts

Root (`package.json` op de clone): `build`, `start`, `typecheck`, `lint`, `depcruise`, `check-root`, `check-ui-boundaries`, `check-motion`, `check-grants`, `bake-off`, `promote-check`, `seed:oomt`, `db:*`. Geen `dev`, geen `test`, geen `check-bundler` (dat script bestaat alleen untracked in de lokale tree).

Per workspace: `typecheck` / `lint` bijna overal. `test:unit` op de meeste packages (tsx of `node --experimental-strip-types` in `@wunderstack/ui` en marketing). `test` alleen op `@wunderstack/agents` = eval. `@wunderstack/embed` en `@wunderstack/bake-off` hebben geen `test:unit`. `pnpm test` is nergens “dezelfde soort ding”: op root bestaat het niet; via turbo is het de live eval.

### tsconfig — package × flags

`tsconfig.base.json:13-14`: `strict: true`, `noUncheckedIndexedAccess: true`. `exactOptionalPropertyTypes` staat nergens. Geen package zet `strict` of `noUncheckedIndexedAccess` uit. Relatief t.o.v. de strengste **vlaggenset** is de set uniform. `exactOptionalPropertyTypes` ontbreekt overal — dat is geen uitzondering per package, het is de lat.

| Package | extends base | strict | noUncheckedIndexedAccess | exactOptionalPropertyTypes | Overige afwijking |
|---|---|---|---|---|---|
| `packages/ai` | ja | inherit | inherit | uit | `include: src` |
| `packages/agents` | ja | inherit | inherit | uit | `include: src` |
| `packages/analytics` | ja | inherit | inherit | uit | `include: src` |
| `packages/db` | ja | inherit | inherit | uit | + `drizzle.config.ts` |
| `packages/embed` | ja | inherit | inherit | uit | `allowImportingTsExtensions`, jsx |
| `packages/rag` | ja | inherit | inherit | uit | `include: src` |
| `packages/shared` | ja | inherit | inherit | uit | `include: src` |
| `packages/tenant` | ja | inherit | inherit | uit | `include: src` |
| `packages/ui` | ja | inherit | inherit | uit | `allowImportingTsExtensions`, jsx |
| `apps/runtime` | ja | inherit | inherit | uit | Next plugin, DOM libs |
| `apps/playground` | ja | inherit | inherit | uit | Next plugin, DOM libs |
| `apps/dashboard` | ja | inherit | inherit | uit | `declaration: false` |
| `apps/marketing` | ja | inherit | inherit | uit | `declaration: false`; **`exclude: **/*.test.ts`** |
| `apps/roleplay` | ja | inherit | inherit | uit | `declaration: false` |
| `scripts/ingest` | ja | inherit | inherit | uit | `include: *.ts` |
| `scripts/db` | ja | inherit | inherit | uit | `include: *.ts` |
| `scripts/eval` | ja | inherit | inherit | uit | `include: *.ts` |
| `scripts/promote` | ja | inherit | inherit | uit | `include: *.ts` |
| `scripts/bake-off` | ja | inherit | inherit | uit | `include: *.ts` |

Marketing is soepeler in **dekking**: tests zitten buiten `tsc`.

### Handhaving van grenzen

`.dependency-cruiser.cjs` is geen cycle-only: `no-ui-to-agents`, `no-roleplay-to-agents`, `no-playground-to-agents`, `no-dashboard-to-agents`, `no-marketing-to-agents`, `no-embed-to-agents`, `no-packages-to-consumers`, `no-apps-to-fund-schema`, `no-circular`. ESLint `no-restricted-imports` dekt dezelfde pijlen deels. CI op `origin/main` draait depcruise + check-root/ui/motion/grants + typecheck + lint + `test:unit` + eval. Geen `next build`.

**`rg -l "@mastra" apps/ packages/ | grep -v "packages/agents"`** (verse clone):

```
apps/runtime/next.config.mjs
```

Niet leeg. Hits binnen `packages/agents`: `create-agent.ts`, `roleplay/model-call.ts`, `observability/trace.ts`, `observability/langfuse.ts`, `package.json`. De runtime-hit is `serverExternalPackages` + webpack `ignoreWarnings` (`apps/runtime/next.config.mjs:51-55, 70-72`), geen `import from "@mastra"`. Letter van de test: de grens is een afspraak plus bundler-config. Geest: app-code importeert Mastra niet.

### Ontbrekende tooling

Aanwezig: ESLint, dependency-cruiser, turbo typecheck/lint/test/test:unit, check-root, check-ui-boundaries, check-motion, check-grants, eval-gates (G1–G3 in CI), promote-check.

Afwezig: knip, madge, coverage-runner (c8/nyc/istanbul niet in package-scripts), `pnpm outdated` als script, `turbo build`. Bij ~20 workspaces valt knip/coverage op als gat, niet als schandaal. Het ontbreken van `turbo build` én van een Next-build in CI valt wél op.

---

## Deel 3 — Gitshygiëne

1. **Ongecommit werk op `main`?** De checkout is `perf/dashboard-2026-09-01`. Lokale `main` is schoon qua unieke commits maar **achter** (`12791fb` vs `origin/main` `63205ed`, zes commits). De dirty tree (400 paden) hangt aan de huidige branch en zou bij `git switch main` meeverhuizen. Er is geen reviewbare schone tree.

2. **Branches.** Dozijnen lokale + origin-takken, veel van 21–30 augustus (roleplay, arbo, gate-tranche-2, refactor shared-agent-runtime). `origin/perf/dashboard-2026-09-01` last commit 2026-09-02 (`6167af0`); lokaal één commit voor (`4bea381`, 2026-09-03). Tegen `origin/main`: 6 / 6 — niet gemerged.

3. **Commitberichten.** Conventional-commits-achtig, scoped. Merges zonder prefix. Consistent genoeg voor een senior; geen chaos.

4. **Grootste vijf last-14d (bestanden):**
   - `03f6ebe` 2026-09-01 — 135 files, `feat(dashboard): fund console on classified turn outcomes` (6858 / 1395). Precedent B8, herhaald.
   - `69814df` 2026-08-21 — 101 files, corpus naar fondsschema’s.
   - `55a8c8c` 2026-09-01 — 61 files, English route segments (lokaal; op origin als `8193dc6`).
   - `7a31f53` 2026-08-25 — 59 files, admin console.
   - `1372668` / `0b30144` — 56 files.

5. **Wat er niet in hoort.** Geen `node_modules` in git. Grootste blobs: `docs/audit/mcp/latency-pipeline.md` **6 553 502 bytes**; drie CAO/arbo-PDF’s (0,6–1,5 MB, verklaarbaar als corpus). `.env.example:121` bevat een 64-hex `MCP_BEARER_TOKEN` (geen placeholder). Geen `BEGIN PRIVATE KEY` / `AKIA` in tracked files (zoektocht).

---

## Deel 4 — Documentatie en het redeneerspoor

### Inventaris

Laatste commitdatum = `git log -1 --format=%ci`, tenzij UNTRACKED.

**Root / AGENTS.md**

| Pad | Beweert te zijn | Laatste wijziging |
|---|---|---|
| `README.md` | Repo-titel | 2026-07-08 |
| `AGENTS.md` | Onboarding mensen + agents | 2026-09-01 |
| `apps/dashboard/AGENTS.md` | Dashboardregels | 2026-09-01 |
| `apps/marketing/AGENTS.md` | Marketing content-site | 2026-08-26 |
| `apps/playground/AGENTS.md` | Tenant-zero UI | 2026-08-21 |
| `apps/roleplay/AGENTS.md` | Leerling-UI | 2026-08-26 |
| `apps/runtime/AGENTS.md` | API-only runtime | 2026-08-26 |
| `packages/analytics/AGENTS.md` | Event-log + KPI’s | 2026-09-01 |
| `packages/db/AGENTS.md` | Drizzle-naad | 2026-08-26 |
| `packages/embed/AGENTS.md` | Embed-widget | 2026-08-18 |
| `packages/tenant/AGENTS.md` | Tenant↔fonds | 2026-08-21 |
| `packages/ui/AGENTS.md` | Design system | 2026-08-27 |
| `claude/verificatie-gate-h1.md` | H1-verificatie (PR-1–4) | UNTRACKED (mtime 2026-09-04) |

Geen `AGENTS.md` in `packages/agents`, `packages/ai`, `packages/rag`, `packages/shared`.

**docs/architecture**

| Pad | Beweert | Datum | Klasse |
|---|---|---|---|
| `ADR-multitenant-database.md` | Tak B, schema-per-fonds, D15 | 2026-08-24 | **gebouwd** — `packages/db/src/schema/{control,fund}/`, `withFundSchema` |
| `NOTE-db-rollen-en-pooling.md` | CREATE ROLE onmogelijk | 2026-08-21 | gebouwd (check-grants, geen SET ROLE) |
| `NOTE-retrieval-copy-elektronische-detailhandel.md` | Retrieval-notitie ETD | 2026-08-21 | gebouwd (ingest-pad) |

**docs/decisions** — klasse tegen code

| Pad | Datum | Klasse |
|---|---|---|
| `DECISION-shared-agent-runtime.md` | 2026-08-24 | **gebouwd** — `AGENT_PROFILES` + `createGroundedAgent` |
| `DECISION-second-agent-arbo.md` | 2026-08-26 | **gebouwd** — `arboProfile` in `registry.ts:28-29` |
| `DECISION-roleplay-agent.md` | 2026-08-26 | **gebouwd** — `apps/roleplay`, `packages/agents/src/roleplay/` |
| `DECISION-dashboard-auth.md` | 2026-08-25 | **gebouwd** — Auth.js dashboard |
| `DECISION-dashboard-ia.md` | 2026-09-01 | gebouwd (routes/chrome) |
| `DECISION-dashboard-indeling.md` | 2026-09-01 | gebouwd (outcomes, gesprekken, signalen) |
| `DECISION-embed-api.md` | 2026-08-25 | gebouwd — `packages/embed`, `GET /api/config` |
| `DECISION-tenant-zero-marketing.md` | 2026-07-22 | gebouwd — `apps/marketing` |
| `DECISION-ui-foundation.md` | 2026-07-22 | gebouwd — `packages/ui` |
| `DECISION-ui-density.md` | 2026-08-27 | gebouwd |
| `DECISION-scaffold-content.md` | 2026-08-26 | gebouwd — `content-policy.ts` |
| `DECISION-voortgangsweergave-poort.md` | 2026-09-03 | gebouwd op lokale HEAD (`4bea381`); op verse clone **niet** in main-tip-check hier als runtime-gedrag herbouwd |
| `DECISION-analytics-retention.md` | 2026-08-21 | **deels ontworpen** — 90-dagen-DELETE staat in het besluit als nog niet geautomatiseerd (`:15-20`); commentaar in schema herhaalt 90 dagen zonder job |
| `IMPLEMENTATIEPROMPT-dashboard-indeling.md` | 2026-09-01 | ontworpen (prompt, deels uitgevoerd) |
| `NOTITIE-voortgangsweergave-nulmeting.md` | 2026-09-03 | gebouwd (meting) |

**Bekende kandidaten**

| Kandidaat | Resultaat |
|---|---|
| G0-ingestgate | Identifier `G0-ingestgate` **niet gevonden**. G0 in `PLAN-gate-restructure.md:29` = CI-enforcement + branch protection (`docs/audit/branch-protection-check.md`). Ingest-gates leven als run-docs onder `docs/eval/ingest/`. G0 **gebouwd** als CI-vlaggen; ingestgate als los product **ontbreekt**. |
| Gedeeld corpusmodel | Term **niet gevonden**. Corpus is per `agentKey` (`documents`, fingerprint). |
| `help-lms`-agent | **geen treffer** in `*.ts`/`*.md`. Niet ontworpen in deze tree. |
| MCP-connector | `packages/connectors` bestaat niet. MCP-**server** is **gebouwd** (`apps/runtime/lib/mcp-server.ts`, `PLAN-mcp-server.md`). Connector-airlock **ontworpen** in rules (`600-connectors.mdc`, `AGENTS.md:22`). |
| G5 arbo-asserties | `docs/compliance/arbo-agent-wettelijke-eisen-spiegeling.md:5` — **niet geland op main**. Tegelijk `create-agent.ts:413` gebruikt G5 voor BUFFER-TO-VERIFY. **ontworpen** (arbo-ids) + **gebouwd** (andere betekenis). |
| `packages/connectors` | **ontworpen**, map afwezig. |

**docs/eval, plans, audit, overig** (compact)

| Pad | Datum | Klasse |
|---|---|---|
| `docs/eval/GATE-ARCHITECTURE.md` | 2026-08-29 | **gebouwd** — `cao.eval.ts`; canoniek |
| `docs/eval/intervention-log.md` | 2026-08-26 | gebouwd (log) |
| `docs/eval/ingest/*`, `golden-sets/*`, `run-2026-08-29-*.json` | jul–aug 2026 | artefacten; gebouwd |
| `docs/plans/PLAN.md` / `PLAN-v2` / `PLAN-v3` | 2026-07-29 | **vervallen** als instap (`apps/demo/` in PLAN.md:29 bestaat niet) |
| `docs/plans/PLAN-gate-restructure.md` | 2026-07-29 | deels vervallen (beweert o.a. dat `gates-overview.md` niet bestaat; `docs/audit/gates-overview.md` bestaat, 2026-08-18) |
| `docs/plans/PLAN-mcp-server.md` | 2026-08-19 | gebouwd (server) / ontworpen (connectors-afbakening) |
| `docs/plans/PLAN-ui-*.md`, `PLAN-eval-gates.md` | jul 2026 | historisch; deels gebouwd |
| `docs/STATUS.md` | 2026-08-21 (kop 2026-07-19) | **vervallen** — spreekt de tree tegen |
| `docs/PRODUCT_SPEC.md` | 2026-07-03 | ontworpen + deels gebouwd; niet bijgewerkt als status |
| `docs/audit/AUDIT-code-review-2026-09-01.md` | 2026-09-01 | precedent; B5/B6/B7 leefden hier, niet in `claude/` |
| `docs/audit/mcp/latency-pipeline.md` | 2026-08-18 | artefact, 6,5 MB |
| `docs/runbooks/*` | aug 2026 | **ontworpen** (correctie 2026-09-04) — geschreven, nooit uitgevoerd als echte uitrol. Een runbook dat nooit is gelopen, faalt de eerste keer dat je het gebruikt. Zie addendum. |
| `docs/security/*` | jul–aug | audits |
| `docs/reviews/*` | jul 2026 | historisch |
| `docs/design/MOTION.md` | 2026-08-21 | gebouwd (`check-motion.sh`) |
| `docs/design/DASHBOARD-CARDS.md` | UNTRACKED | — |
| `docs/lti11-token-sessie.md` | 2026-08-26 | gebouwd |
| `docs/compliance/arbo-*.md` | 2026-08-26 | ontworpen (G5 niet op main) |
| `scripts/ingest/*/README.md` | jul–aug | corpus-leeswijzer |

### AGENTS.md-steekproef (D5)

Eén claim per file; bij twee treffers alles.

| File | Claim | Code | Treffer |
|---|---|---|---|
| `packages/analytics/AGENTS.md:11` | tabel in `packages/db/schema.ts` | bestand bestaat niet; wel `packages/db/src/schema/fund/interaction-events.ts` | ja |
| zelfde `:3-4` | “tot de schema-verhuizing … in `public`” | KPI-scope is fondsschema (`withFundSchema`) | ja → **alles gecontroleerd** |
| zelfde `:31-32` | geen theme-WHERE tot classifier | `signals.ts:110-111` zet `eq(interactionEvents.theme, query.theme)` | ja |
| zelfde overige | db via `@wunderstack/db`; grounded-only; integratietest bestaat | `fund-environment.integration.test.ts` aanwezig; db-import klopt | ok |
| `AGENTS.md:22,36` | `packages/connectors` bestaat | glob 0 files | ja |
| `packages/tenant/AGENTS.md:10` | alleen hier `TENANT` parsen | `rg process.env.TENANT` alleen `packages/tenant/src/index.ts:46` | ok |
| `packages/db/AGENTS.md` | control vs fund-schema | mappen bestaan | ok |
| `packages/embed/AGENTS.md` | `GET /config` | `apps/runtime/app/api/config/route.ts` bestaat | ok |
| `packages/ui` / playground / roleplay / dashboard / marketing | geen `@wunderstack/agents` | depcruise groen | ok |
| `apps/marketing/AGENTS.md` + `content/agents.ts:61` | arbo `binnenkort`, live = CAO | `AGENT_PROFILES` bevat `arbo` (`registry.ts:27-29`) | ja (eerlijkheid catalogus) |
| `apps/runtime/AGENTS.md` | Mastra achter seam | app-imports schoon; `next.config.mjs` noemt `@mastra/*` | bundler-config |

Drift is zwaar: analytics-`AGENTS.md` en root-`AGENTS.md` liegen op paden die een reviewer in het eerste uur opent.

### Instapvraag

Er is **geen** document waarmee iemand die de repo nooit zag, uitsluitend dat document volgend, binnen een dag binnen is én kan draaien. `README.md` is leeg. `AGENTS.md` beantwoordt wat/waarom/grenzen, niet hoe je clone → dev doet. `docs/STATUS.md` is gevaarlijk als tweede stop.

Vier vragen die het ontbrekende instapdocument moet beantwoorden:

1. Wat clone ik (SHA/branch) en welke Node/pnpm?
2. Welke commando’s zijn groen zonder secrets, en welke zijn de eval?
3. Welke vijf processen starten, op welke poort, met welke env?
4. Welk document is leidend als STATUS, PLAN en GATE-ARCHITECTURE elkaar bijten?

### `claude/`

Niet getrackt (`git ls-files claude/` leeg). Staat niet in `check-root`-allowlist; zou rood worden zodra iemand hem commit zonder allowlist-regel. Geen index, geen leesvolgorde. Eén file: H1-verificatie 29 augustus. B5/B6/B7 staan **niet** hier; ze staan in `docs/audit/AUDIT-code-review-2026-09-01.md`. Voor een buitenstaander is `claude/` een losse notitie die de clone niet eens bevat — geen redeneerspoor dat vertrouwen wekt, een USB-stick die je apart moet geven.

### Nederlands in de code

User-facing strings en docs zijn Nederlands; dat is beleid (`000-core.mdc:21`).

- Bestandsnamen: **0** Nederlandse paden in `git ls-files` (gesprek/signaal/instelling/…).
- Commit-subjects laatste 60: **0** Nederlandse zinnen.
- `rg` op `gesprekken|signalen|instellingen|kennisgaten|uitkomst|citaat|weigering` in `*.ts/tsx`: treffers in **19 files**, bijna allemaal UI-copy of prompts (correct) plus redirects/tests voor oude URL’s.

Ergste vijf **identifiers/contracten** (niet UI-copy):

1. `apps/runtime/lib/lti11/launch.ts:33` — padsegment `"gesprek"` in de LTI-contractparser.
2. `apps/runtime/AGENTS.md` (oppervlakken) — documenteert `/api/lti11/launch/gesprek/<slug>`.
3. `apps/dashboard/lib/redirects.test.ts:9-14` — Nederlandse legacy-URL’s (bewuste redirects; residue).
4. `apps/dashboard/lib/conversations.test.ts:102` — `parseConversationId("gesprekken")`.
5. `apps/dashboard/lib/overview-load.ts:122` — commentaar “sessies, not gesprekken”.

Geen `getCaoAntwoord`-stijl identifiers gevonden. De LTI-segmenten zijn de enige harde contract-Nederlands in code.

---

## Deel 5 — Register van bewuste afwijkingen

| Afwijking | Standaard zou zijn | Reden staat in | Oordeel |
|---|---|---|---|
| Vlootmodel + schema-per-fonds bij n=5 | Multi-tenant met rijniveau-isolatie | `docs/architecture/ADR-multitenant-database.md:22-47` (D15, tak B, geen CREATE ROLE) | **staat** |
| Nederlandstalige besluitdocumenten | Engels, uniform | `.cursor/rules/000-core.mdc:21`; `AGENTS.md:24-25` | **staat** |
| `claude/` als redeneerspoor | ADR’s, geen sessielogboek | ontbreekt | **ontbreekt** |
| Gate-architectuur G0–G5 bovenop CI | CI + testdekking | `docs/eval/GATE-ARCHITECTURE.md:1-48` (G1–G4 + skip≠pass); G0 in `PLAN-gate-restructure.md:29`; G5 is twee dingen | **staat, rommelig** |
| Drempels als vloer, nooit verlaagd | Drempels bijstellen op waarneming | `docs/eval/intervention-log.md:15` (C4 = rode vlag); `GATE-ARCHITECTURE.md:554-555` (“geen drempelverlaging”, demotie tot trend) | **staat** |
| `turbo test` = eval, unit = `test:unit` | `pnpm test` draait tests | ontbreekt in README; impliciet `turbo.json:10-11` + `packages/agents/package.json` | **ontbreekt** (reviewer-zichtbaar) |
| Lege README, echte instap in `AGENTS.md` | README onboarding | ontbreekt | **ontbreekt** |
| Mastra in `next.config` `serverExternalPackages` | Mastra alleen in `packages/agents` | commentaar in `apps/runtime/next.config.mjs:45-55` | **staat lokaal in config**, niet in het afwijkingenregister |

---

## Deel 6 — Simulatie van het eerste uur

Hij clonet `main` en krijgt een README van één woord. Tien seconden later is het oordeel “dit team schrijft niet voor vreemden”. Daarna opent hij `AGENTS.md` en schrikt de andere kant op: walking skeleton, soevereiniteit, pijl-regel, bundler-asymmetrie, verwijzingen naar ADR’s. Dat leest als een studio die wél nadenkt — en die de voordeur vergeten is. `packages/connectors` in diezelfde file bestaat niet; de eerste fact-check faalt. `docs/` is een bibliotheek: GATE-ARCHITECTURE en de multitenant-ADR zijn serieus, STATUS.md uit juli zegt dat Auth.js en een tweede agent bewust niet in v1 zitten terwijl het dashboard inlogt en `AGENT_PROFILES` `arbo` bevat. Vanaf dat moment leest hij elk document als mogelijk verlopen. Hij draait `pnpm install` (werkt, als hij het raad), `pnpm turbo run typecheck` en `lint` (groen, snel), `pnpm turbo run test` (groen in twee seconden omdat G2/G3 skippen) en `pnpm turbo run build` (rood: geen turbo-task). Hij concludeert dat de gates theater kunnen zijn tot hij CI.yml leest — daar zit wél een echte eval achter vlaggen die lokaal niet aanstaan. Depcruise is groen en de grensregels staan in een bestand dat hij herkent; de `@mastra`-rg is niet leeg. Als hij de laptop van de auteur krijgt in plaats van GitHub, ziet hij 400 dirty files, een untracked `claude/` zonder index, en `code-reviews/`. Dan is het oordeel niet meer “dunne README” maar “ik weet niet welke tree ik review”. Na een uur heeft hij respect voor de hoeveelheid redeneerwerk en geen vertrouwen dat hij de waarheid van de code uit de docs kan halen zonder alles zelf te meten.

**Oordeel na één uur:** een ongewoon doorwrochte walking skeleton achter een lege voordeur, met documentatie die zowel de moat als de onbetrouwbaarheid is.

---

## Bevindingenregister

Elke identifier hieronder komt één keer voor.

### F0-01

| Veld | Waarde |
|---|---|
| Pad + regel | `claude/verificatie-gate-h1.md` (lokaal); `git ls-files claude/` leeg op clone `63205ed` |
| Ernst | `blokkerend` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Track `claude/` met index, of geef hem niet mee als review-materiaal. |

### F0-02

| Veld | Waarde |
|---|---|
| Pad + regel | `README.md:1` (`# wunderstack`, 14 bytes, clone én HEAD) |
| Ernst | `blokkerend` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Zet clone→install→env→dev-poorten in de README, niet alleen in `AGENTS.md`. |

### F0-03

| Veld | Waarde |
|---|---|
| Pad + regel | `package.json:9-18` (geen `dev`/`test`); `turbo.json:1-41` (geen `build`) |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Eén commando-oppervlak documenteren dat een reviewer zonder omweg kan draaien. |

**Gesloten 2026-09-04:** root `pnpm test` → `turbo run test:unit`; commando’s in `AGENTS.md`.

### F0-04

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/agents/package.json` script `test` → `cao.eval.ts`; verse-clone-log G2/G3 `SKIPPED` daarna `Eval PASSED` |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Lokale `turbo test` zonder keys mag niet als PASSED lezen voor G2/G3, of de README moet zeggen dat dit G1-only is. |

**Gesloten 2026-09-04:** `formatEvalVerdict` — skipped gates print `Eval INCOMPLETE`, never `PASSED` (`packages/agents/src/evals/harness.ts`).

### F0-05

| Veld | Waarde |
|---|---|
| Pad + regel | `.github/workflows/ci.yml` op `origin/main`: typecheck/lint/eval/`test:unit`, geen `pnpm build` / `turbo run build` (zoek `pnpm build` → 0 hits) |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Next-productiebuild in CI zetten, of expliciet opschrijven dat v1 die gate niet heeft. |

**Gesloten 2026-09-04:** v1 bouwt niet in CI; reden in `AGENTS.md` (Commando's).

### F0-06

| Veld | Waarde |
|---|---|
| Pad + regel | `AGENTS.md:22` en `:36` (`packages/connectors`); glob `packages/connectors/**` = 0 |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Schrap de map uit onboarding tot hij bestaat, of markeer hem als niet-gebouwd. |

**Gesloten 2026-09-04:** `packages/connectors` gemarkeerd als niet-gebouwd in `AGENTS.md`.

### F0-07

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/analytics/AGENTS.md:3-4, 11, 31-32` vs `packages/db/src/schema/fund/interaction-events.ts` (geen `packages/db/schema.ts`) vs `packages/analytics/src/signals.ts:110-111` |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Trek `AGENTS.md` gelijk met het fondsschema en de echte theme-WHERE. |

**Gesloten 2026-09-04:** analytics-AGENTS wijst naar fondsschema-pad; theme-WHERE blijft dormant.

### F0-08

| Veld | Waarde |
|---|---|
| Pad + regel | worktree: 400 porcelain-paden op `perf/dashboard-2026-09-01`; lokale `main` `12791fb` ≠ `origin/main` `63205ed` |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Beoordelaar een enkele SHA geven; deze tree is geen reviewbare snapshot. |

### F0-09

| Veld | Waarde |
|---|---|
| Pad + regel | `packages/analytics/src/corpus.ts:33-38` (`docs[0]?.agentKey` vóór sort op `sourceUri`) |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | `agentKey` in de gesorteerde materiaalset opnemen, niet uit `docs[0]`. |

### F0-10

| Veld | Waarde |
|---|---|
| Pad + regel | `apps/runtime/next.config.mjs:51-55` (`@mastra/core` e.d. in `serverExternalPackages`); `rg` buiten `packages/agents` niet leeg |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | De Mastra-grens in de rg-test laten kloppen, of de test en de belofte herschrijven naar “geen import”. |

### F0-11

| Veld | Waarde |
|---|---|
| Pad + regel | `docs/STATUS.md:24` (“Auth.js, tweede agent … geen van deze is gebouwd”) vs dashboard-auth + `packages/agents/src/runtime/registry.ts:27-29` |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | `STATUS.md` markeren als vervallen of herschrijven tegen HEAD. |

**Gesloten 2026-09-04:** `docs/STATUS.md` gemarkeerd VERVALLEN.

### F0-12

| Veld | Waarde |
|---|---|
| Pad + regel | `apps/marketing/content/agents.ts:61` `status: "binnenkort"` voor `arbo` vs `registry.ts:28` `arbo: arboProfile` |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Catalogusstatus gelijkzetten aan wat de runtime echt serveert. |

**Gesloten 2026-09-04:** marketing `arbo` → `live`; publieke embed blijft CAO-only.

### F0-13

| Veld | Waarde |
|---|---|
| Pad + regel | `.env.example:121` `MCP_BEARER_TOKEN=91a56a2e594c6a7ae25626bc58b5d8e0bab8ff5aa535cb5ba99113ae4f3f164e` |
| Ernst | `zwaar` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Waarde eruit; alleen de generatie-instructie laten staan. Roteren als dit ooit live was. |

**Gesloten 2026-09-04:** hex uit `.env.example`; waarde zat in commit `311a9c9` — roteer op Scalingo als die ooit gedeployed is. `check-docs.sh` in CI.

### F0-14

| Veld | Waarde |
|---|---|
| Pad + regel | `docs/audit/mcp/latency-pipeline.md` object size 6553502 |
| Ernst | `licht` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Dump uit git; samenvatting in audit houden. |

### F0-15

| Veld | Waarde |
|---|---|
| Pad + regel | `03f6ebe` (2026-09-01), 135 files, `git diff-tree --name-only` |
| Ernst | `licht` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Grote plakken knippen vóór de review-SHA, niet erna. |

### F0-16

| Veld | Waarde |
|---|---|
| Pad + regel | `scripts/check-root.sh:40-46` (`git ls-files` only); `claude/` en `code-reviews/` untracked |
| Ernst | `licht` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Allowlist of gitignore voor handoff-mappen, zodat de guard dezelfde root ziet als de reviewer. |

### F0-17

| Veld | Waarde |
|---|---|
| Pad + regel | `apps/runtime/lib/lti11/launch.ts:33` (`segments[0] !== "gesprek"`) |
| Ernst | `licht` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Engelse path-segment in het LTI-contract, Dutch alleen in de leerling-UI. |

### F0-18

| Veld | Waarde |
|---|---|
| Pad + regel | ontbrekend `packages/agents/AGENTS.md` (ook `ai`, `rag`, `shared`); `ls` op clone faalt |
| Ernst | `licht` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Minstens `packages/agents/AGENTS.md` — dat is de moat. |

### F0-19

| Veld | Waarde |
|---|---|
| Pad + regel | `apps/marketing/tsconfig.json:19` `"exclude": [..., "**/*.test.ts"]` |
| Ernst | `licht` |
| Status | `gebouwd` |
| Geldt | `nu (5 fondsen)` |
| Aanbeveling | Tests in dezelfde `tsc` als de app, of de uitzondering in de tsconfig-tabel van de review zetten. |

---

## Vóór de review — effect / kosten (max tien)

1. README met clone→dev.
2. Eén SHA + schone tree; `claude/` tracken of niet meenemen.
3. Root-`AGENTS.md` connectors-zin en analytics-`AGENTS.md` gelijkzetten met de tree.
4. `STATUS.md` vervallen verklaren.
5. Bearer uit `.env.example`.
6. Marketing-arbo-status.
7. Eerlijk maken wat `turbo test` lokaal bewijst.
8. Fingerprint `agentKey` niet uit `docs[0]`.
9. Next-build in CI of de afwijking registreren.
10. 6,5 MB latency-dump uit de clone.

Niet doen in die twee dagen: architectuur omgooien, G5-arbo landen, `exactOptionalPropertyTypes` aanzetten, knip invoeren.

---

## Addendum 2026-09-04 — classificatie vs. uitrol

Aanleiding: `docs/plans/PLAN-q4-gereedheid.md`. De fase-0-lat mat of een
document in de clone staat en of de code het pad heeft. Dat is niet of het
pad ooit tegen een fonds is gelopen.

Vier rijen die als `gebouwd` lazen, zijn `ontworpen` tot spoor 1 (één echte
uitrol) ze waarmaakt:

| Wat | Fase-0-lezen | Correctie |
|---|---|---|
| Vlootmodel (één instance per fonds, releasetags) | ADR tak B **gebouwd** (schema-per-fonds in code) | Deploy: één Scalingo-app `wunderstack`, `TENANT` unset → `demo`. Vloot is ontworpen. |
| `docs/runbooks/*` | gebouwd (operator) | Nooit uitgevoerd als uitrol. Zie tabel hierboven. |
| Provisionering (`createFundEnvironment`, migratieledger) | code + GATE_DB-tests | Niet bewezen buiten de testomgeving. |
| Analytics-laag | schema + 191 rijen in `fund_oomt` | Lokaal proces (`tenant_id=oomt`); geen echte gebruikersbeurten. |

De lijst “Vóór de review” hierboven rangschikt niet meer. Volgorde: het Q4-plan.
