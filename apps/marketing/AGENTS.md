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
- **Live vs demo.** `status: "live"` matches the runtime registry (CAO + arbo). The public marketing
  embed demo remains CAO-only (tenant-zero key); other live agents show a walkthrough on this site.
  That demo is the **Fase 4 embed** (`packages/embed`), loaded via the stable snippet — no fork, no
  bespoke chat UI. On the CAO detail page it uses `data-mode="inline"`; a fund's own site omits that
  and gets the launcher. Roadmap agents stay `binnenkort`.
- **Canvas per page.** White is the product default (`:root`). Black is `[data-mode="dark"]` on
  `<html>`, set by the static route-group layouts `(black)` / `(white)` (home vs agent pages).
  `lib/page-theme.ts` remains the assignment table for tests. Do not load Google Fonts —
  display/body come from `@wunderstack/ui` (Spectral + Inter, self-hosted).

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
