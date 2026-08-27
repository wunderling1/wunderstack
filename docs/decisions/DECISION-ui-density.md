# DECISION — UI density (`size` axis)

Status: accepted · Scope: `packages/ui` (primitives + trust-patterns), consumers
`apps/playground`, `packages/embed`, `apps/roleplay`, `apps/dashboard`, `apps/marketing`.

## Context

Playground and embed share tokens and a few trust-patterns (`AnswerCard`, `CitationBlock`,
`RefusalNotice`), but each surface builds its own chat shell with different spacing, type
scale, wait-UI, and citation layout. The result is two visual languages for the same grounded
conversation. Roleplay already duplicates the playground composer; dashboard and marketing
rebuild pills, buttons and answer bubbles by hand.

D16 keeps the chat shell (thread, starters, follow-ups, markdown, feedback, passage fetch)
app-local. That stays. What is missing is a single **scale axis** so the embed can be a
smaller rendering of the same components, not a fork.

## Decisions

1. **One `size` axis: `"sm" | "md" | "lg"`.** Every primitive and trust-pattern that has
   density-sensitive padding or type accepts `size`. Default is `"md"` — the look already
   shipped in playground, dashboard, roleplay and marketing. `"sm"` is the embed panel
   (~380 px). `"lg"` is reserved for the chat composer controls that already render at 48 px
   in playground/roleplay.

2. **Zero visual regression on `md`.** Adding `size` must not change the default class
   strings. `sm` is additive. Consumers that do not pass `size` look identical after the
   change.

3. **`Button`: split shape from size.** Today's `size: "default" | "pill" | "icon"` is shape,
   not scale. Rename to `shape: "control" | "pill" | "icon"` so `size` means the same thing
   everywhere.

4. **Composer is promoted into `packages/ui` (rule of three).** Three bit-identical
   implementations exist (playground, roleplay, embed-inline). The shared composer lives at
   `trust-patterns/composer.tsx` with `size`, `multiline` (embed sets `false`), `stopping`,
   `onSend`, `onStop`. Icons are inline SVG — never `lucide-react` — so the embed panel stays
   Lucide-free (tree-shaken today; must stay that way).

5. **New trust-patterns for shared chrome.**
   - `CardSection` — footer strip with hairline, density-aware padding, optional heading
     (replaces four hand-rolled `border-t … px-8 py-5` blocks).
   - `AnswerProgress` — wait-UI with a `steps` prop and inline SVG markers (no Lucide).
     Playground, embed and roleplay all consume it.

6. **Still app-local (D16 unchanged).** Thread/layout, starters, follow-up chip row wiring,
   markdown renderer, feedback, passage expander, embed chrome (launcher, Article 50, close),
   playground sidebar and fund/agent selectors. No shared `<Chat />`.

7. **Explicit `size` props, no Density context.** Passing `size` on ~8 embed call sites is
   cheaper than a React context. Revisit only if a third compact surface appears.

## Not in this decision

- Markdown parity in the embed (plain text for now).
- CI gate against new DS duplicates.
- Marketing `wunder-lexicon` expressive layer.
- Density context / CSS variable cascade for size.

## Acceptance

- Playground, dashboard, roleplay and marketing are visually unchanged after introducing
  `size` defaults.
- Embed and playground show the same cards, chips, refusal and footer hairlines — only
  smaller in the embed.
- No `lucide` / `createLucideIcon` string in `packages/embed/dist/embed-panel.js`.
- `/ui` preview renders every component at both `md` and `sm`.
