# DECISION — Shared agent runtime (profile-driven pipeline)

Status: accepted · Datum: 24 augustus 2026 · Eigenaar: Wunderstack-maintainers  
Amendeert: [DECISION-second-agent-arbo.md](./DECISION-second-agent-arbo.md) §4 (rule of three).  
Raakt: `packages/agents` (niet D15 / niet gedeelde fonds-runtime).

## Context

CAO en arbo deelden al de pipeline via imports uit `cao/` (citations, condense, generate-answer,
verify). Agent 3 zou een derde kopie van `agent.ts` zijn geweest. Drie aparte registries
(catalog, eval profiles, hard-fact keys) sloten niet op elkaar.

## Besluit

1. **Eén functie, geen klasse.** `createGroundedAgent(profile: AgentRuntimeProfile)` in
   `packages/agents/src/runtime/`. Geen `BaseAgent`, geen overerving, geen plugin-mechanisme.
2. **Profiel = data met functievelden.** Prompt, refusal-teksten, `questionSchema` (minScore-default),
   `runRetrieval`, `clarify: fn | null`. Verschillen horen in het profiel, niet in
   `if (agentKey === "…")` in de pipeline.
3. **`AGENT_PROFILES` is de enige bron.** Catalog, `AgentKey` / `HardFactAgentKey`, en
   `Record<AgentKey, AgentEvalProfile>` leiden daaruit af.
4. **Grens: agent-runtime ≠ fonds-runtime.** Dit deelt de *agent*-pipeline tussen catalogus-
   agents in één proces. Het verbod op een gedeelde *fonds*-runtime (D15-collapse, ADR
   multitenant tak B) blijft staan.

## Wat per agent blijft

Chunker, prompt, hard-fact-patronen, query-rewrite-glossarium, golden set, `minScore` (schema-
default + `agent_config` override).

## Wat bewust niet

Gedragswijzigingen (clarify voor arbo, hernoemen van `cao-retrieval` span) — aparte PRs met
evalbewijs.

Repair-assessment volgt `profile.agentKey` voor hard-fact-patronen en `profile.notFoundMessage`
voor de gecoachte refusal-zin. Scope-weigerzinnen horen niet in repair-coaching: die volgen uit
de vraag, niet uit een mislukte retrieval. Retrieval-types leven in `runtime/retrieval.ts`.
