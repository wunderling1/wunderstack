# DECISION — Second RAG agent (arbocatalogus)

Status: accepted · Scope: `packages/agents`, `packages/rag`, `packages/db`, `apps/runtime`,
`apps/playground`, `scripts/ingest`, eval gates.

## Context

Wunderstack's first agent is the CAO-agent (RAG over CAO texts). OOMT needs a second RAG agent
over the arbocatalogus on the same fund. The walking-skeleton rule applies: copy-and-adapt the CAO
module, not abstract into a generic `RagAgent` / `BaseAgent`. The rollenspel agent is not a RAG agent
and does not count toward the rule of three.

## Decisions

1. **Two separate surfaces — no Mastra Supervisor, no AgentNetwork.** Each agent gets its own embed
   snippet, MCP tool, and playground entry. The agents do not share a conversation, so a router adds an
   LLM hop, router evals, and a second isolation leak without product value. Mastra's Supervisor
   pattern applies only when multiple agents share one conversation thread (see `500-agents.mdc`).

2. **Corpus isolation via `agent_key` on `documents`** (values: `cao` | `arbo`). One vocabulary
   everywhere: `catalog.ts` id = `agent_config.agentKey` = `documents.agent_key` = `data-agent`
   attribute (hint only — see decision 3). `retrieve()` and `fetchParentPassage()` require `agentKey`
   with no default so a forgotten call-site is a type error, not a silent cross-corpus read.

3. **`tenant_config` becomes an agent-instance table.** One row per `(tenant_id, agent_key)`, unique
   on that pair, with its own `public_key` per row. The public key resolves the agent instance
   server-side. `data-agent` on the embed snippet is a hint for widgets that can show multiple
   instances; it must be validated against what the key allows and never overrides agent choice.

4. **Rule of three: copy, don't abstract.** The arbo module is a copy-and-adapt of the CAO module.
   No generic `RagAgent` / `BaseAgent`. Shared infrastructure stays in `packages/rag` (retrieve →
   threshold → LLM → verbatim quote-check → refuse without source), embeddings (`qwen3-embedding-8b`
   @ 4096), Mistral, Langfuse, and the catalog seam. Not shared per agent: chunker, prompt, hard-facts,
   query-rewrite glossary, golden set, `minScore`.

5. **`agent_config(agent_key, fund_key)` holds tuning knobs only.** `minScore`, starters, corpus
   version / validity date. Prompts and refusal sentences stay in code.

6. **Citation contract unchanged.** `{marker, chunk_id, quote}` and the verbatim quote-check stay in
   shared grounding code. Only the human-readable `sourceRef` label differs (e.g. "Hoofdstuk 4 —
   Fysieke belasting" vs "Artikel 5, lid 2").

7. **MCP: one tool per agent.** `ask_cao` and `ask_arbo` are separate tools; fund and agent are
   resolved server-side from the instance key. No agent parameter on tools, no internal corpus router.

## Verified

- pgvector uses flat (exact) search — no hnsw/ivfflat index. Adding `(fund, agent_key)` pre-filter
  does not change ANN recall (see `packages/db/migrations/0001_add_embedding.sql`).
- `documents.source_uri` uniqueness moves to `(agent_key, source_uri)` so two corpora on one fund do
  not collide.

## Related

- `docs/decisions/DECISION-embed-api.md` — embed snippet and `GET /config`
- `docs/plans/PLAN-mcp-server.md` — MCP surface (M6 updated for per-agent tools)
