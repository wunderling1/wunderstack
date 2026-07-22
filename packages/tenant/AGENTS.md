# packages/tenant

**Wat dit is:** de enige bron van waarheid voor tenant-identiteit (D15). `tenant` = instance/deployment-
identiteit (env `TENANT`), `fund` = het domeinwoord in klantcontext; 1-op-1 in v1. Tenant zero = `demo`.

## Regels
- Env wordt hier **één keer** via Zod geparsed (`300-typescript`); geen andere plek leest `TENANT` direct.
- Geen React/Next/DB-afhankelijkheden — pure, testbare functies. Framework-agnostisch.
- Breid de `TENANT_FUND`-mapping uit per instance; onbekende tenant → gelijknamig fund (1-op-1-conventie).
