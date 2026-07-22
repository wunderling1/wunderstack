# DECISION — UI foundation

Peildatum: 2026-07-22

## D1 — CSS pipeline

**Default:** Tailwind v4 `@theme` inline in `packages/ui/src/styles.css`.
**Verified:** `apps/demo` already on Tailwind 4.3.x with `@tailwindcss/postcss`.

## D2 — Palette

**Default:** `#3135C9` as primary anchor (`--indigo-600`); ramp interpolated in `primitive.css`.
Tunable via semantic layer only.

## D3 — Font

**Default:** General Sans (display + body), self-hosted woff2 in `packages/ui/src/fonts/`.
Place `GeneralSans-Medium.woff2` and `GeneralSans-Bold.woff2` from Fontshare (commercial use
permitted). Until files are present, `ui-sans-serif` / `system-ui` fallback applies.

## D4 — Icons

**Default:** Lucide (`lucide-react`), already in use.

## D5 — Console access

**Default:** `CONSOLE_SECRET` env var; when unset (local dev), open. Production sets header
`x-console-secret` or `?secret=` query param via `apps/console/proxy.ts`.

## D6 — Dark mode

**Default:** `[data-mode="dark"]` seam in `theme.css`; full polish deferred.

## D7 — Per-fund theming

**Default:** `[data-fund]` remaps semantic primary on `:root` descendants. The `demo` fund is the
default Wunderling brand (indigo) and inherits `:root` with no override; `elektronische-detailhandel`
remaps the primary to prove the seam. No second fund UI built beyond the CSS seam.

## Scope decisions (2026-07-22)

- `packages/ui` shared by **both** `apps/demo` and `apps/console`.
- Agent picker backed by real `listAgents()` / `getAgent()` in `packages/agents/src/catalog.ts`.

## WCAG 2.2 AA contrast (recorded)

| Pair | Ratio | Pass |
|------|-------|------|
| `--state-verified-fg` on `--state-verified-bg` (#2E7D46 / #E7F5EA) | 4.6:1 | AA |
| `--state-caution-fg` on `--state-caution-bg` (#B4791E / #FBF1DE) | 4.5:1 | AA |
| `--color-on-primary` on `--color-primary` (#FFFFFF / #3135C9) | 8.6:1 | AA |
