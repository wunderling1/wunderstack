# packages/ui

**Wat dit is:** het design system — tokens (primitive → semantic → theme), primitives en (laag 3)
trust-patterns. Gedeeld door playground, dashboard, embed en de rollenspel-leerling-UI.

## Regels
- **Props-in, geen data-wiring.** Nooit `@wunderstack/agents` importeren (CI: `no-ui-to-agents`). Componenten
  krijgen data via props; apps doen de wiring.
- **Alleen semantische tokens** in componenten (`--color-*`, `--radius-*`, …). Geen rauwe hex of primitieve
  tokens in `primitives/`/`trust-patterns/` (CI: `scripts/check-ui-boundaries.sh`).
- Laag 3 heet `trust-patterns` (D16): alleen wat ≥3 consumers delen. App-specifieke chat-shell blijft app-lokaal.
- **Density via `size` (D18):** `"sm" | "md" | "lg"`, default `"md"`. Embed gebruikt `sm`; chat-composer
  controls in playground/roleplay gebruiken `lg`. Geen Lucide in componenten die de embed deelt
  (inline SVG i.p.v. `lucide-react`). Zie `docs/decisions/DECISION-ui-density.md`.
