## Summary

<!-- What changed and why. -->

## Test plan

- [ ]

## Content

- [ ] Deze PR wijzigt geen fonds-gereviewde content. (Scaffold-content is meetbaar, niet merge-blocking — zie `.cursor/rules/750-scaffold-content.mdc`.)

## Destructive migration (schema-per-fund)

Do **not** DROP or TRUNCATE production corpus tables in the same release as the code that started depending on the new shape (ADR-multitenant-database). Dual-read/write onto `fund_*` can land on main first; `DROP public.documents|chunks|interaction_events` is a follow-up (`pnpm db:drop-public-corpus -- --confirm`).

- [ ] This PR does not combine a destructive DROP with the first deploy of the code that needs the new tables.
- [ ] No SQL join / union / `search_path` mix across fund schemas.
- [ ] No CREATE ROLE / SET ROLE as a security boundary (track B: isolation remains D15).
