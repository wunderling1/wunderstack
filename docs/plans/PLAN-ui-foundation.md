# UI foundation — `@wunderstack/ui` + `apps/console`

See the attached plan in the repo conversation. Phases 1–6 implement a shared UI package,
refactor `apps/demo` onto it, add an agent catalog to `packages/agents`, and wire internal
`apps/console`.

## Package naming

`@wunderstack/ui` (not `@wunderling/ui`) per repo scope rules.

## Key paths

- Tokens: `packages/ui/src/tokens/`
- Primitives: `packages/ui/src/primitives/`
- Chat: `packages/ui/src/chat/`
- Console: `apps/console/`
- Boundaries: `.cursor/rules/ui-boundaries.mdc`, `scripts/check-ui-boundaries.sh`
