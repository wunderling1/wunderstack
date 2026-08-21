# Motion system

Peildatum: 19 augustus 2026
Scope: fase 0 (tokens, no-op) en fase 1 (vier primitives). Marketing-laag en librarykeuze staan expliciet buiten deze scope.

---

## Token-tabel

### Primitives — `packages/ui/src/tokens/primitive.css`

Raw values. Only `semantic.css` and `theme.css` may reference these.

| Token | Value |
|---|---|
| `--duration-50` | `50ms` |
| `--duration-100` | `100ms` |
| `--duration-150` | `150ms` |
| `--duration-250` | `250ms` |
| `--duration-400` | `400ms` |
| `--duration-spin` | `1000ms` |
| `--ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--ease-linear` | `linear` |
| `--distance-xs` | `4px` |
| `--distance-sm` | `12px` |

`--duration-spin` is the loop period. It is not on the enter/press scale and is not mapped to a Tailwind `duration-*` utility (`duration-1000` stays `initial`).

### Semantics — `packages/ui/src/tokens/semantic.css`

What components use. Never reference raw `ms` or `cubic-bezier()` in component code.

| Token | Resolves to | Intent |
|---|---|---|
| `--motion-press` | `var(--duration-100) var(--ease-standard)` | Button `:active` feedback |
| `--motion-state` | `var(--duration-150) var(--ease-standard)` | State change (colour, focus ring) |
| `--motion-enter` | `var(--duration-250) var(--ease-out-soft)` | Dialog / overlay enter |
| `--motion-enter-slow` | `var(--duration-400) var(--ease-standard)` | Empty-state enter (readable fade) |
| `--motion-exit` | `var(--duration-150) var(--ease-standard)` | Element leaving the DOM |
| `--motion-offset-enter` | `var(--distance-sm)` | `translateY` offset on enter |
| `--motion-stagger` | `var(--duration-100)` | Delay step for empty-state enter (`.motion-enter`, `--i`) |
| `--motion-spin` | `var(--duration-spin) var(--ease-linear) infinite` | Progress loop (`.motion-spin`); runs until the element unmounts |

Exit is intentionally shorter than enter: disappearing should never feel like waiting. Loops are not timed exits — they are state-bound (decision F).

### Reduced motion

Handled exactly once, in `semantic.css`. No `useReducedMotion` hook; no per-component `@media` block.
All `--duration-*` tokens become `0.01ms` (not `0ms`) so that `transitionend`/`animationend` still fire
and code waiting on those events cannot hang. `--motion-spin` becomes a single `0.01ms` tick (`1`
iteration), not `infinite` at 0.01ms — that combination would hyper-spin. The global
`animation-iteration-count: 1` on `*` is defense-in-depth for any loop that forgets the token.

### Tailwind bridge — `packages/ui/src/styles.css`

`duration-50`, `duration-100`, `duration-150`, `duration-250`, `duration-400` utilities map to our tokens.
Tailwind defaults (`duration-75`, `duration-200`, `duration-300`, `duration-500`, `duration-700`, `duration-1000`)
are removed via `initial`. `ease-out-soft`, `ease-standard`, and `ease-linear` utilities are added.
`--duration-spin` is not on this scale; consumers use `.motion-spin`, not `duration-1000`.

---

## Besluiten

### A — Motion is a token layer

Hierarchy mirrors colour: primitive → semantic → component. Components never reference raw `ms` values
or `cubic-bezier()`, just as they never reference hex.

### B — No motion library in fase 0/1

Everything is CSS. Zero new dependencies; zero bundle impact on `packages/embed`. Library selection is
fase 3 and requires a concrete case that CSS provably cannot handle.

### C — `prefers-reduced-motion` is handled once, in the token file

No `useReducedMotion` hook; no per-component `@media` block. A component that needs to inspect the
reduced-motion preference is a signal that the token is wrong.

### D — The trust layer does not animate

Answer text, citation chips, refusal state, and gate status appear in the same frame. This is a
reviewable rule, not a guideline. The `Chip` component enforces it in code: only a colour transition
on state change; no enter animation, no opacity fade, no translate.

The reason: these elements carry the agent's grounded, cited answer. Animating them in suggests the
information is being constructed live or performed for effect. The agent's answer is real and
immediate; theatrical delay contradicts the product positioning.

### E — Only `transform` and `opacity`

Transitions on `height`, `width`, `top`, `left`, `margin`, or `padding` are a blocking review
comment. `box-shadow` and `background-color` are allowed, but only on the fast duration (`--motion-state`).
Enforced by `scripts/check-motion.sh` Rule 3.

### F — Loop motion is state-bound

A progress spinner (`.motion-spin`) runs `infinite` while its host is mounted. React already owns
the duration of work: the playground progress checklist mounts `Loader2` only while the step is
`active`, and replaces it with `Check` in the same frame. Do not time the loop out in CSS; do not
use `.motion-enter` (one-shot) or Tailwind `animate-spin` in `apps/**` (Rule 4).

The checklist is progress UI, not the trust layer (decision D). Spinning is allowed; the done
`Check` must not fade or slide in.

---

## CI enforcement

`scripts/check-motion.sh` runs in the `verify` job after **UI boundaries**. Four rules:

1. No `cubic-bezier()` outside the token files.
2. No `transition`/`animation` shorthand with a literal time value (e.g. `150ms`) outside the token files.
3. No transition of layout properties (`height`, `width`, `top`, `left`, `right`, `bottom`, `margin`, `padding`) anywhere.
4. No Tailwind motion utilities (`transition-*`, `animate-*`) or `@keyframes` in `apps/**`.

Grandfathered violations live in `scripts/motion-allowlist.txt`.

### Empty-state enter (fase 2, chat shell only)

`.motion-enter` in `packages/ui/src/styles.css` is a CSS-only fade (`--motion-enter-slow`, 400ms,
`--ease-standard`) plus `translateY(--motion-offset-enter)`, with delay
`calc(var(--i) * var(--motion-stagger))`. The playground empty state (`Starters`) uses it on first
paint. Category switches must not re-stagger. Do not apply `.motion-enter` to answers, citations,
refusal, or gate status (decision D).

### Progress loop

`.motion-spin` rotates on `transform` only (`--motion-spin`). Apply it to a progress icon while work
is in flight. Reduced motion freezes it (decision F). The playground `AnswerSkeleton` uses it on the
active retrieval step.

---

## Reduced-motion manual smoke test

Until Playwright is added to the repo, verify reduced-motion behaviour manually:

1. Open `scripts/motion-reduced-smoke.html` in a Chromium-based browser.
2. Open DevTools → Rendering tab → check "Emulate CSS media feature prefers-reduced-motion: reduce".
3. Click the Button: the press animation should be imperceptible (< 1ms duration).
4. Open the Dialog: overlay and content should appear without any fade or slide.
5. The spinner on the smoke page should freeze (no continuous rotation).
6. Automated assertion: `packages/ui/src/primitives/chip.test.ts` — verifies that `Chip` carries
   `--motion-state` on its colour transition and no `opacity`/`transform` transition.
   `packages/ui/src/tokens/reduced-motion.test.ts` — verifies duration zeroing and `--motion-spin`
   dropping `infinite`.
