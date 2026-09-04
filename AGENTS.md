# AGENTS.md

Onboarding voor mensen én AI-agents die aan deze repo werken. De afdwingbare regels staan
in `.cursor/rules/*.mdc`; dit bestand is de leesbare samenvatting.

## Wat dit is
**Wunderstack** — de agent-infrastructuur van een AI-boutique voor Nederlandse O&O fondsen. Losstaand van
Qonvo, BullyLink en The Bully Agency — koppelbaar, niet verweven. Eerste agent: de
**CAO-agent** (RAG over CAO-teksten). Richting: een catalogus van fonds-overstijgende
agents die je één keer bouwt en per fonds via configuratie uitrolt.

## Hoe we bouwen
- **Walking skeleton, geen platform.** Bouw primitives; bewijs ze door de CAO-agent
  end-to-end te laten werken. Geen speculatieve abstractie (regel van drie).
- **Naden, geen systemen.** Elke externe afhankelijkheid achter een dunne eigen interface,
  zodat hij wisselbaar is — maar bouw geen zware systemen (workflow-engines, gedeelde runtime
  over fondsen, gateways) voordat een echte usecase ze afdwingt. Schema-per-fonds + gedeeld
  dashboard: `docs/architecture/ADR-multitenant-database.md` (tak B).
- **Soeverein-by-default.** Het standaard request-pad blijft EU-soeverein. Fondsdata gaat
  nooit by default naar een niet-EU-model.
- **Airlock voor niet-soevereine bronnen.** Facebook, US-SaaS en andere niet-EU-bronnen
  koppelen via één geclassificeerde adapter per bron (gepland als `packages/connectors` —
  **nog niet gebouwd** in v1). Downstream van die grens blijft alles EU-soeverein; de bron zelf
  niet. Zie `.cursor/rules/600-connectors.mdc`.
- **Alle code in het Engels** (identifiers, comments, bestandsnamen, commits; packages onder
  `@wunderstack/*`). Nederlands alleen in docs en user-facing tekst.

## Stack (kort)
Cursor · TypeScript strict · Turborepo + pnpm · Node 22.13+ · Next.js 16 · React · Tailwind ·
shadcn/ui · Mastra (achter een naad) · AI SDK (via Mastra's versie) · Mistral · Scalingo
managed Postgres + pgvector · Scaleway embeddings · Drizzle · Zod · Langfuse EU · Auth.js.
Volledige lijst + versiebeleid: `.cursor/rules/100-stack.mdc`.

## Bundler (CI-afgedwongen)
`next dev` draait op **Turbopack** (geen `--webpack`-vlag); `next build` draait op **webpack**
(`--webpack` verplicht). Die asymmetrie is bewust.

Voorwaarde voor beide: **relatieve imports zonder bestandsextensie**. Turbopack kan `.js`-
specifiers niet naar `.ts` hermappen (vercel/next.js#82945) en Next 16.3.4 heeft geen
`resolveExtensionAlias`. Daarom staat de repo op `moduleResolution: "bundler"` en niet op
NodeNext. Zet je een `.js`-suffix terug op een relatieve import, dan breekt `next dev`.

Wissel **nooit** van bundler om een fout te omzeilen — repareer de code of de config.
`scripts/check-bundler.sh` faalt de build op elke afwijking.

## Repo-structuur
`apps/runtime` (Next.js API-only: agent-API, webhook, hardening) · `apps/playground` (publieke
tenant-zero-demo-UI) · `apps/roleplay` (leerling-UI rollenspel, HTTP-only) · `packages/ai` (model-naad) · `packages/agents`
(agent-defs, Mastra erin) · `packages/rag` · `packages/db` (Drizzle) · `packages/shared` ·
`packages/analytics` · `packages/tenant` · `packages/ui` · `packages/embed`.
(`packages/connectors` is gepland, nog geen map in de tree.)
Pijl-regel: apps importeren uit packages, nooit andersom (CI-afgedwongen).
Chat-scroll woont in `@wunderstack/ui` (`createScrollAnchor` + `useScrollAnchor`); playground,
roleplay en embed importeren die hook en schrijven hem niet over.

## Commando's (root)
- `pnpm test` — `turbo run test:unit` (snelle unit-tests; **geen** eval-gates).
- `pnpm turbo run test` — eval-suite (`@wunderstack/agents`); zonder keys: `Eval INCOMPLETE`.
- `pnpm build` — volledige Next/embed-productiebuild (lokaal/release). **Niet** in CI in v1:
  de verify-job draait typecheck, lint, depcruise, unit tests en eval — geen `next build`
  (duur; productiebuild blijft een deploy/release-stap). `pnpm dev` bestaat niet in de root:
  start per app (`pnpm --filter runtime dev`, enz.).
- `pnpm check-docs` — markdown-links in `docs/**` en `**/AGENTS.md` moeten bestaande paden zijn.

## Repo-indeling (CI-afgedwongen)
De root is allowlist-only: entry-docs, tooling-config en de code-/meta-mappen, verder niets.
`scripts/check-root.sh` faalt de build op elke andere getrackte root-entry.
- Plannen → `docs/plans/`, audits → `docs/audit/`, besluiten → `docs/decisions/`, runbooks →
  `docs/runbooks/`. Nooit in de root.
- Scratch- en debug-output → `tmp/` (gitignored), nooit gecommit.
- Hoort een bestand echt in de root? Zet het in dezelfde PR op de allowlist in
  `scripts/check-root.sh`, met de reden in de commit.

## Bewust NIET in v1
Temporal · LangGraph · losse agent-runtime · interne gateway · gedeelde runtime over
fondsen (D15-collapse) · Supabase Auth/RLS · Inngest. Schema-per-fonds en een gedeeld
dashboard wél: zie `docs/architecture/ADR-multitenant-database.md`.  
**Let op (24 augustus 2026):** de *agent*-runtime (`createGroundedAgent` + `AGENT_PROFILES`) is
iets anders dan een gedeelde *fonds*-runtime — zie `docs/decisions/DECISION-shared-agent-runtime.md`.
Wil je iets van de verbodslijst toevoegen: motiveer eerst tegen de regels.

## Waar te beginnen
Lees `.cursor/rules/000-core.mdc` eerst. Daarna 100 (stack), 200 (architectuur). De glob-
geladen regels (300 TypeScript, 400 data/RAG, 500 agents, 600 connectors) activeren bij
het werken in de betreffende mappen.
