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
  zodat hij wisselbaar is — maar bouw geen zware systemen (workflow-engines, multi-tenancy,
  gateways) voordat een echte usecase ze afdwingt.
- **Soeverein-by-default.** Het standaard request-pad blijft EU-soeverein. Fondsdata gaat
  nooit by default naar een niet-EU-model.
- **Alle code in het Engels** (identifiers, comments, bestandsnamen, commits; packages onder
  `@wunderstack/*`). Nederlands alleen in docs en user-facing tekst.

## Stack (kort)
Cursor · TypeScript strict · Turborepo + pnpm · Node 22.13+ · Next.js 16 · React · Tailwind ·
shadcn/ui · Mastra (achter een naad) · AI SDK (via Mastra's versie) · Mistral · Scalingo
managed Postgres + pgvector · Scaleway embeddings · Drizzle · Zod · Langfuse EU · Auth.js.
Volledige lijst + versiebeleid: `.cursor/rules/100-stack.mdc`.

## Repo-structuur
`apps/demo` (Next.js: demo, widget, API) · `packages/ai` (model-naad) · `packages/agents`
(agent-defs, Mastra erin) · `packages/rag` · `packages/db` (Drizzle) · `packages/shared`.
Pijl-regel: apps importeren uit packages, nooit andersom (CI-afgedwongen).

## Bewust NIET in v1
Temporal · LangGraph · losse agent-runtime · interne gateway · multi-tenancy ·
Supabase Auth/RLS · Inngest. Wil je iets hiervan toevoegen: motiveer eerst tegen de regels.

## Waar te beginnen
Lees `.cursor/rules/000-core.mdc` eerst. Daarna 100 (stack), 200 (architectuur). De glob-
geladen regels (300 TypeScript, 400 data/RAG, 500 agents) activeren bij het werken in de
betreffende mappen.
