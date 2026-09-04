# apps/playground

**Wat dit is:** de publieke tenant-zero-demo — een **UI-only** Next-app (D13). Publiek chatten met de
CAO-agent tegen de tenant-zero-runtime.

## Regels
- **Geen agent-/businesslogica.** Importeer nooit `@wunderstack/agents` (CI-afgedwongen:
  `no-playground-to-agents`). Alle `/api/*`-calls worden via `next.config.mjs` `rewrites()` naar de
  runtime geproxyd (`RUNTIME_URL`, lokaal `:3000`). Als de agent-instance een public key heeft, zet
  `NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY` en stuur die mee via `lib/runtime-api.ts`.
- **UI komt uit `@wunderstack/ui`.** Gebruik semantische tokens; geen rauwe hex/primitives in componenten.
  App-lokale chat-componenten (`components/chat/*`) mogen hier leven; gedeelde trust-patterns horen in `ui`.
  Chat-scroll is geen app-lokale kopie: `useScrollAnchor` uit `@wunderstack/ui`.
- **Open toegang (D9).** Geen auth-gate; tenant zero is publiek + rate-limited (rate-limit zit in de runtime).
- Draait lokaal op `:3001`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
