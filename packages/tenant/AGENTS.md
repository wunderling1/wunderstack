# packages/tenant

**Wat dit is:** de enige bron van waarheid voor tenant-identiteit (D15). `tenant` = instance/deployment-
identiteit (env `TENANT`), `fund` = het domeinwoord in klantcontext — in v1 **altijd dezelfde
string** (`tenantFund(id) === id`). Tenant zero = `demo`. Geamendeerd 21 augustus 2026 (tak B): het
control plane mag meerdere fondsen kennen; dit package blijft de procesgrens. Niet collapsen tot
CREATE ROLE bestaat — zie `docs/architecture/ADR-multitenant-database.md`.

## Regels
- Env wordt hier **één keer** via Zod geparsed (`300-typescript`); geen andere plek leest `TENANT` direct.
- Geen React/Next/DB-afhankelijkheden — pure, testbare functies. Framework-agnostisch.
- Geen `TENANT_FUND`-override (verwijderd na F1-01). Fondssleutel = tenant-id; fysiek schema =
  `fundSchemaName(tenantId)` in `@wunderstack/db`.
