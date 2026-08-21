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
- **Open toegang (D9).** Geen auth-gate; tenant zero is publiek + rate-limited (rate-limit zit in de runtime).
- Draait lokaal op `:3001`.
