# apps/marketing

The public marketing site (Fase 5): the vision, the agent catalog, and a detail page per agent. It is
a **content site**, not an app surface — no database, no auth, no agent/model runtime.

## Rules

- **No agent/model runtime.** Marketing depends only on `@wunderstack/ui` (design system) and
  `@wunderstack/shared` (types). It must NEVER import `@wunderstack/agents` (or `db`/`rag`/`ai`/
  `analytics`) — that would pull Mastra into a static content bundle. Enforced by depcruise
  `no-marketing-to-agents`.
- **Catalog = content, decoupled from the runtime registry.** The catalog lives in `content/agents.ts`
  as hand-curated data. It is intentionally NOT `listAgents()` from the runtime, because the marketing
  story is broader than what is wired today and must stay honest about live vs. roadmap.
- **Live demo only for real agents.** Only entries with `status: "live"` (today: CAO) mount a real
  demo. That demo is the **Fase 4 embed** (`packages/embed`), loaded via the stable snippet against
  tenant zero — no fork, no bespoke chat UI ("buildembed" decision). On the CAO detail page it uses
  `data-mode="inline"` so the chat sits in the page; a fund's own site omits that and gets the
  launcher. Everything else is a scripted walkthrough.

## Live demo config

The CAO detail page injects the embed snippet using:

- `EMBED_SCRIPT_BASE` — origin serving `/embed.js` (e.g. `https://api.wunderling.nl`, or
  `http://localhost:3000` in dev).
- `EMBED_PUBLIC_KEY` — the demo tenant's public key (safe in the snippet).

For the cross-origin fetch to succeed, the runtime's **demo tenant CORS allowlist must include this
marketing origin** (manage it in the dashboard embed console). In local `NODE_ENV=development` the
runtime already allowlists `http://localhost:3003`. Without both env vars the page shows a
"not configured" note instead of a broken widget.

## Dev

`pnpm --filter marketing dev` (port 3003). Runtime on 3000, playground on 3001, dashboard on 3002,
roleplay on 3004.
