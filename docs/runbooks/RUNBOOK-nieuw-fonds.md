# RUNBOOK — Nieuw fonds

**Doel:** een nieuw fonds end-to-end live krijgen: control plane + schema via het dashboard,
daarna runtime-deploy en corpus-ingest door de operator.

**Niet in dit runbook:** hard delete (`DROP SCHEMA` — D3, later), Scalingo-API-automatie, gedeelde
runtime over fondsen (D15 blijft).

---

## 1. Wat het dashboard doet (`/admin/funds`)

Eén formulier roept `createFundEnvironment` aan (provisioner-connectie,
`PROVISIONER_DATABASE_URL`). In **één transactie**:

1. Rij in `control.funds` (sleutel + weergavenaam + `fund_<key>`)
2. `CREATE SCHEMA` + tabellen `documents` / `chunks` / `interaction_events`
3. `REVOKE … FROM PUBLIC` op dat schema
4. Owner-grants (`DB_OWNER_ROLE`) en reader-grants (`DB_READER_ROLE`) wanneer gezet
5. Eén `control.agent_instances`-rij per gekozen agent, elk met een unieke `public_key`
6. Fondsaccount in `control.users` (`role=fund`, `must_change_password=true`)
7. Auditregel `fund_created`

Na submit toont het resultaatscherm **eenmalig**:

- het gegenereerde wachtwoord (verdwijnt bij herladen)
- de tenant-key per agent
- het blok **Nog niet live** met de env-vars hieronder

De fondsgebruiker moet bij eerste login het wachtwoord wijzigen (`/password`).

---

## 2. Env-vars die de UI toont (letterlijk)

Zelfde lijst als op het resultaatscherm. `RUNTIME_UNCONFIGURED_AGENT` hoort **niet** bij een
fonds uit dit formulier (het heeft altijd instances).

```
TENANT=<fundKey>
CAO_FUNDS=<fundKey>
DATABASE_URL=<addon-owner connection string>
NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY=<cao public_key>
NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO=<arbo public_key>   # alleen als arbo is aangevinkt
EMBED_SCRIPT_BASE=<runtime origin, e.g. https://api.example.nl>
```

Optioneel, alleen als de fondssleutel óf de corpus-naam afwijkt van 1-op-1:

```
TENANT_FUND=<fund-domeinnaam>
```

Lokaal dashboard / provisioner:

```
PROVISIONER_DATABASE_URL=<zelfde als DATABASE_URL>
DB_READER_ROLE=<read-only login, bv. testadmin>
DB_OWNER_ROLE=<addon-owner login, zodat ingest na CREATE SCHEMA mag schrijven>
```

---

## 3. Wat de operator daarna doet

1. **Runtime-deploy** voor dit fonds: eigen proces met `TENANT=<fundKey>` (D15). Geen gedeelde
   runtime over fondsen.
2. **Corpus ingest** (voorbeeld):

   ```bash
   pnpm --filter @wunderstack/ingest ingest <pad-of-map> \
     --fund <fundKey> --agent cao --version 1 --prune
   ```

   Arbo (indien aangevinkt):

   ```bash
   pnpm --filter @wunderstack/ingest ingest <arbo-bron> \
     --fund <fundKey> --agent arbo --version <tag> --prune
   ```

3. **Embed / playground:** keys uit het resultaatscherm (of `/admin/embed` na aanmaken).
4. **Fonds-login:** e-mail uit het formulier + eenmalig wachtwoord → `/password` → fondsdashboard.

---

## 4. Hoe je ziet dat het gelukt is

| Check | Verwacht |
|-------|----------|
| `/admin/funds` | Rij met weergavenaam; status **Nog niet live** tot er events zijn; link **Beheren** |
| `/admin/funds/<key>` | Naam, accounts, dump, deactiveren (na dump) |
| `/admin` | Geen crash; agent-overzicht blijft laden (schema bestaat) |
| Fonds-login | Wachtwoordwissel, daarna KPI's op 0 en leeg corpuspaneel |
| Na ingest | Corpuspaneel toont documenten; na chat stijgt "Vragen" |
| `scripts/db/inspect-grants.ts` | Geen `PUBLIC`-grant op `fund_<key>` |

---

## 5. Bestaand fonds beheren (`/admin/funds/<key>`)

Detailpagina (alleen platform-admin):

- weergavenaam wijzigen (fondssleutel is **niet** wijzigbaar)
- accounts: e-mail wijzigen, wachtwoord **resetten** (eenmalig getoond, `must_change_password=true`).
  Wachtwoorden zijn niet in te zien.
- extra fondsaccount aanmaken
- agent-instance toevoegen (alleen als het fonds actief is)
- **Dump:** `POST /admin/funds/<key>/export` start `pg_dump --no-owner --no-acl -n fund_<key>`.
  Audit `fund_dumped` bewaart `{ bytes, sha256 }`, nooit de dump zelf. Ontbreekt `pg_dump` op de
  host → 503, geen nepdump.
- **Soft-delete:** `control.funds.status = inactive` + instances inactive. Vereist een eerdere
  dump-audit én het intypen van de fondssleutel. **Geen `DROP SCHEMA`.** Schema en users blijven
  staan. Embed-resolutie negeert inactive instances. Runtime-proces uitzetten blijft operatorwerk.

---

## 6. Bewust niet hier

- Hard delete / `DROP SCHEMA` / restore (eigen runbook; ADR D3)
- Gate-/release-manifest (nog stub `n.n.b.` op admin-detail)
