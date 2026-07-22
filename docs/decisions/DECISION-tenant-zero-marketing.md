# DECISION — Tenant zero & marketing-skeleton (Fase 5)

Status: accepted. Scope: `PLAN-ui-ecosystem.md` Fase 5. Two pre-agreed choices drove this phase:
**buildembed** (the marketing live demo reuses the Fase 4 embed, no fork) and **author_only** (author
the demo corpus + goldenset as repo files and wire the commands; do not run live ingestion/gates now).

## 1. "CAO Fictief" demo corpus goes through the real pipeline

The demo corpus is a fully fictional CAO (`scripts/ingest/demo-corpus/cao-fictief.md`), deliberately
structured like a real CAO (hoofdstukken / artikelen / leden + a salary table) so it runs through the
**same** ingestion pipeline as a real corpus — no demo-only shortcut. It is ingested under fund `demo`
(tenant zero) with the normal command; that command is documented in the corpus README, not run here
(author_only: it needs `SCALEWAY_API_KEY` + `DATABASE_URL`).

## 2. Demo fund-layer goldenset, registered like any fund

`packages/agents/src/evals/fixtures/golden-set.demo.jsonl` is a small fund-layer set (in_scope,
table, multi-turn, refusal) matched on article/lid — exactly the shape of the ETD fund set. It is
registered in `FUND_SET_META.demo` (fund `demo`, corpusVersion `demo-1`) so the eval loader treats it
as a first-class fund. This is a deliberate, eval-related edit (rule 700): the base golden set is
untouched, so `GOLDEN_FIXTURE_HASH` and `GOLDEN_CORPUS_VERSION` do not change and the base gates run
unchanged. The demo fund set only becomes active on the **nightly integration gate** (`EVAL_REQUIRE_DB`),
which requires the demo corpus to be ingested into the gate DB first — hence author_only.

## 3. Tenant-zero hardening: a global daily cap

On top of the existing per-IP (20/60s) and per-key (120/60s) limits, the runtime now enforces a
single **global daily ceiling** on chat requests (`RUNTIME_DAILY_CAP`, `apps/runtime/lib/rate-limit.ts`).
It is coarse by design — one counter for the whole process, resetting at UTC midnight — so even a
distributed flood cannot run the public demo's inference bill past a known daily limit. Same seam
LIMITATION as the other counters: per process; a multi-instance deployment needs a shared store, and
that change stays confined to `rate-limit.ts`. Unset/0 disables it (dev).

## 4. `apps/marketing` is a content site, not an app surface

Home + catalog overview + a detail page per agent. It depends only on `@wunderstack/ui` and
`@wunderstack/shared`; it must never import the agent/model runtime (enforced by depcruise
`no-marketing-to-agents`). The catalog is **hand-curated content** (`content/agents.ts`), intentionally
decoupled from the runtime `listAgents()` registry: the marketing story is broader than what is wired
today and must stay honest about live vs. roadmap. Only `status: "live"` agents (today: CAO) get a
real demo — the **Fase 4 embed**, loaded via the stable snippet against tenant zero. Non-live agents
show a scripted walkthrough; no live demo for an agent that does not exist.

## Left to infrastructure (not code, per the plan's DoD)

- DNS/TLS for `wunderling.nl` (marketing) and `api.wunderling.nl` (runtime/embed origin).
- Deploying tenant zero pinned to a release tag (not staging) with `RUNTIME_DAILY_CAP` set.
- Running the live ingestion of "CAO Fictief" and the gates (author_only).
- Adding the marketing origin to the demo tenant's CORS allowlist (dashboard console).
