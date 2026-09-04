# @wunderstack/embed

The embeddable agent widget (Fase 4). A framework-agnostic web component a fund pastes into its own
site with a single, stable snippet.

## What it is

- A React app mounted inside a **Shadow DOM**, so the host page's CSS never leaks in or out.
- Reuses the `@wunderstack/ui` **trust-patterns** (`AnswerCard`, `CitationBlock`, `RefusalNotice`) so
  citations render natively and the embed never drifts from the design system.
- Talks to the runtime over HTTP with a **public tenant-key**; fetches theme + texts at boot from
  `GET /config` (D17 runtime theming — the tenant theme is injected as CSS custom properties, not the
  compile-time `[data-fund]` seam).
- Shows the **Article 50** (EU AI Act) transparency notice by default, always.
- Empty chat shows **starter categories** (defaults in the embed; optional `texts.starterCategories`
  override from `GET /config`).

## The stable snippet

Everything variable is fetched at runtime, so the snippet is minimal and never changes:

```html
<script src="https://api.wunderling.nl/embed.js" data-key="pk_…" data-agent="cao" async></script>
```

- `src` — the runtime origin; the embed derives its endpoint from it (override with `data-endpoint`).
- `data-key` — the public tenant-key (safe to expose; gated by CORS + rate limiting, not secrecy).
- `data-agent` — which agent to serve (default `cao`).
- `data-mode="inline"` — optional. Mounts into `[data-wunderstack-embed-slot]` as an always-open
  panel (marketing demo / a dedicated "ask the CAO" page). Default is the floating launcher.

## Rules

- **Browser-only.** Never import a server package (`@wunderstack/agents|db|rag|ai|analytics`) or
  `@wunderstack/shared` (it parses `process.env` at import). CI enforces this (`no-embed-to-agents`).
  Contract shapes are mirrored locally in `src/types.ts`.
- **Reuse, don't fork.** Visuals come from `@wunderstack/ui`. App-local chat shell (composer/thread)
  is fine (D16), but citation/answer/refusal visuals stay in the trust-patterns. Chat scroll is
  `useScrollAnchor` from `@wunderstack/ui` — the adapter scrolls only the embed's own container,
  never the host page (`scrollIntoView` is forbidden here).

## Build

```sh
pnpm --filter @wunderstack/embed build   # → dist/embed.js
```

`build.mjs` compiles the Tailwind utilities used by the embed + `@wunderstack/ui`, rewrites the design
tokens from `:root` to `:host` (so they resolve inside the shadow tree), and bundles the React app to
a single IIFE with the CSS inlined. The runtime serves the built bundle at `GET /embed.js`.

Measured IIFE (2026-09-04): **~737 KiB** (`754719` bytes); ~120 KB of that is base64-inlined Inter +
Spectral woff2 so the snippet stays one script (no second font fetch).
