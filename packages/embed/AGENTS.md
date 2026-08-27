# @wunderstack/embed

The embeddable agent widget (Fase 4). A framework-agnostic snippet a fund pastes into its own site.

## What it is

- **Host page:** a vanilla ~3 KB loader (`/embed.js`) that paints a launcher and opens an **iframe**
  on first click. React never executes on the fund’s site — document isolation is the procurement
  story (not only Shadow DOM CSS isolation).
- **Guest document:** `/embed/frame?key=&agent=` loads the React panel (hashed `/embed/panel/…`) in
  `data-mode="inline"` inside Shadow DOM, reusing `@wunderstack/ui` trust-patterns
  (`AnswerCard`, `CitationBlock`, `RefusalNotice`).
- Talks to the runtime over HTTP with a **public tenant-key**; fetches theme + texts at boot from
  `GET /config` (D17). Framing is gated by CSP `frame-ancestors` from the tenant CORS allowlist.
- Shows the **Article 50** (EU AI Act) transparency notice by default, always.
- Empty chat shows **starter categories** (defaults in the embed; optional `texts.starterCategories`
  override from `GET /config`).

## The stable snippet

Everything variable is fetched at runtime, so the snippet is minimal and never changes:

```html
<script src="https://api.wunderling.nl/embed.js" data-key="pk_…" data-agent="cao" async></script>
```

- `src` — the runtime origin; the loader derives the iframe URL from it.
- `data-key` — the public tenant-key (safe to expose; gated by frame-ancestors + rate limiting).
- `data-agent` — which agent to serve (default `cao`).
- `data-mode="inline"` — optional. Fills `[data-wunderstack-embed-slot]` with the iframe
  (marketing demo / a dedicated "ask the CAO" page). Default is the floating launcher.
- `data-color` / `data-label` — optional launcher branding on the host page (no config fetch).

## Rules

- **Browser-only.** Never import a server package (`@wunderstack/agents|db|rag|ai|analytics`) or
  `@wunderstack/shared` (it parses `process.env` at import). CI enforces this (`no-embed-to-agents`).
  Contract shapes are mirrored locally in `src/types.ts`.
- **Reuse, don't fork.** Visuals come from `@wunderstack/ui`. App-local chat shell (composer/thread)
  is fine (D16), but citation/answer/refusal visuals stay in the trust-patterns.
- **Do not add lucide or `react-markdown`** to this package (keeps the panel lean; host stays vanilla).

## Build

```sh
pnpm --filter @wunderstack/embed build
# → dist/embed.js              (vanilla loader)
# → dist/embed-panel.<hash>.js (React panel, immutable)
# → dist/manifest.json
```

`build.mjs` compiles Tailwind for the panel, rewrites design tokens from `:root` to `:host`, bundles
the React app to a content-hashed IIFE, and copies the loader. The runtime serves the loader at
`GET /embed.js`, the panel at `GET /embed/panel/…`, and the guest HTML at `GET /embed/frame`.
