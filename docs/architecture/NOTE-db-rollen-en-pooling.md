# NOTE — Database rollen en pooling (PR0)

Datum: 21 augustus 2026  
Addon: Scalingo PostgreSQL `postgresql-starter-512` (app `wunderstack`, region `osc-fr1`)  
Verbinding: `scalingo db-tunnel` → lokaal `127.0.0.1:10000` → serverpoort **5432**  
Sessiegebruiker: `wunderstack_8322` (niet-superuser, `rolcreaterole = f`)  
Geen wachtwoorden of connection strings in dit document.

Vergelijking met eerdere meting: [docs/decisions/DECISION-analytics-retention.md](../decisions/DECISION-analytics-retention.md) L31–40 (22 juli 2026) — `CREATE ROLE` faalde toen al.

**Gekozen tak: B.** CREATE ROLE is NIET GESCHIKT. Schema-per-fonds blijft voor verwijderbaarheid en het promotiepad. D15 (runtime-per-fonds) blijft de afgedwongen isolatiegrens. Gedeeld dashboard (control plane) zonder gedeelde runtime. Niet presenteren als fail-closed DB-isolatie.

---

## 1. Rollen en grants

### Commando's (wegwerpschema, daarna opgeruimd)

```sql
SELECT current_user, session_user, current_database(),
       r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolcanlogin
FROM pg_roles r WHERE r.rolname = current_user;

CREATE SCHEMA fund_probe;
CREATE ROLE fund_probe NOLOGIN;
GRANT USAGE ON SCHEMA fund_probe TO fund_probe;
CREATE ROLE app_probe NOLOGIN;
GRANT fund_probe TO app_probe;
```

Tripwire + SET LOCAL (alleen zinvol als de rollen bestaan):

```sql
CREATE TABLE public.fund_probe_public (id int);
INSERT INTO public.fund_probe_public (id) VALUES (1);
BEGIN;
SET LOCAL ROLE app_probe;
SELECT current_user, session_user;
SELECT id FROM public.fund_probe_public;  -- verwacht: permission denied
COMMIT;
```

Cleanup:

```sql
DROP TABLE IF EXISTS public.fund_probe_public;
DROP SCHEMA IF EXISTS fund_probe CASCADE;
DROP ROLE IF EXISTS app_probe;
DROP ROLE IF EXISTS fund_probe;
```

### Uitkomst per statement

| Statement | Resultaat | Fout |
|---|---|---|
| whoami | `wunderstack_8322`, `rolsuper=f`, `rolcreaterole=f`, `rolcreatedb=f`, `rolcanlogin=t` | — |
| `CREATE SCHEMA fund_probe` | **OK** | — |
| `CREATE ROLE fund_probe NOLOGIN` | **FAIL** | `permission denied to create role` / `Only roles with the CREATEROLE attribute may create roles.` |
| `GRANT USAGE ON SCHEMA fund_probe TO fund_probe` | FAIL (gevolg) | `role "fund_probe" does not exist` |
| `CREATE ROLE app_probe NOLOGIN` | **FAIL** | zelfde `permission denied to create role` |
| `GRANT fund_probe TO app_probe` | FAIL (gevolg) | `role "app_probe" does not exist` |
| `CREATE TABLE public.fund_probe_public` | OK | — |
| `SET LOCAL ROLE app_probe` | FAIL (gevolg) | `role "app_probe" does not exist` — fail-closed SELECT dus **niet** meetbaar |
| `DROP SCHEMA fund_probe CASCADE` | OK | — |
| `DROP ROLE IF EXISTS app_probe` / `fund_probe` | FAIL (rollen bestaan niet; addon weigert DROP ROLE überhaupt) | `permission denied to drop role` |

`SET LOCAL ROLE` + “SELECT uit public moet permission denied geven” is **niet uitgevoerd**: er is geen NOLOGIN-rol om naar te switchen.

### Out-of-band LOGIN-users (niet gebruikt als vervanging)

`scalingo --addon postgresql database-users-list` op deze addon (21 augustus 2026):

- `wunderstack_8322` — read-write, protected
- `testadmin` — read-only

CLI kent `database-users-create` (LOGIN-users met wachtwoord), niet NOLOGIN-schemarollen voor `SET ROLE`. Dat is **geen** equivalent van de ADR-constructie. Niet ingezet.

### Conclusie (1)

**NIET GESCHIKT** voor tak A (fail-closed `SET LOCAL ROLE fund_<key>`).

`CREATE SCHEMA` is GESCHIKT — tak B (schema-per-fonds als organisatie + dump/drop/promotie) kan.

---

## 2. Pooling

### Hoe de runtime verbindt [feit]

[packages/db/src/client.ts](../../packages/db/src/client.ts) L30: `postgres(env.DATABASE_URL, { max: 10 })` — **driver-pool (postgres.js)**, geen `pg` Pool, geen pgbouncer in app-code.

Op de addon, deze sessie:

```sql
SHOW server_version;   -- 17.9 (Debian 17.9-1.pgdg12+1)
SHOW port;             -- 5432
SHOW pool_mode;        -- ERROR: unrecognized configuration parameter "pool_mode"
SELECT application_name, backend_type, usename
FROM pg_stat_activity WHERE pid = pg_backend_pid();
-- application_name=psql, backend_type=client backend, usename=wunderstack_8322
```

Geen `pool_mode` → dit is **Postgres zelf**, geen pgbouncer-sessie. Tunneldoel in de CLI was `….postgresql.c.osc-fr1.scalingo-dbs.com:37009` (directe Postgres-poort, niet een pooler-poort).

Modus: **session-semantiek per connectie** in de driver-pool. Geen transaction pooling.

### SET LOCAL reset na COMMIT (zelfde sessie)

`SET LOCAL ROLE` kon niet (geen rol). Proxy: `SET LOCAL search_path` — dezelfde transactiesemantiek.

**psql, één sessie:**

```sql
SHOW search_path;                    -- "$user", public
BEGIN;
SET LOCAL search_path = pg_catalog;
SHOW search_path;                    -- pg_catalog
COMMIT;
SHOW search_path;                    -- "$user", public   (teruggezet)
```

**Zonder BEGIN:**

```sql
SET LOCAL search_path = pg_catalog;
-- WARNING: SET LOCAL can only be used in transaction blocks
SHOW search_path;                    -- ongewijzigd "$user", public
```

**postgres.js `max: 1` (zelfde connectie, drizzle-achtige `sql.begin`):**

- tijdens tx: `current_schemas(false) = ["pg_catalog"]`
- na commit, volgende query op dezelfde client: `["public"]` (reset)

### Conclusie (2)

**GESCHIKT** voor `SET LOCAL …` **binnen een expliciete transactie**. Na COMMIT is de sessie terug op de vorige staat, op dezelfde connectie.

Zonder `BEGIN` is `SET LOCAL` een no-op (warning). Een transactiewrapper is verplicht als tak A ooit alsnog beschikbaar komt. Op tak B is search_path hooguit organisatie, geen beveiligingsgrens.

---

## 3. `eval_cases` classificatie

```sql
SELECT count(*)::int AS n,
       count(expected_passage) FILTER (WHERE expected_passage IS NOT NULL AND expected_passage <> '')::int AS n_passage,
       count(question) FILTER (WHERE question IS NOT NULL AND question <> '')::int AS n_question,
       coalesce(sum(length(expected_passage)), 0)::int AS passage_chars,
       coalesce(sum(length(question)), 0)::int AS question_chars
FROM eval_cases;
```

Uitkomst: **`n = 0`**, geen rijen, geen brontekst, geen gebruikersvraag.

Kolomvorm [feit] in [packages/db/src/schema.ts](../../packages/db/src/schema.ts) L104–109: `question` + `expected_passage` — dat *is* de vorm van fondsinhoud, maar de tabel is leeg. Golden sets leven in git (`packages/agents/src/evals/fixtures/*.jsonl`), niet hier.

**Classificatie:** geen fondsinhoud aanwezig. In PR2 **parkeren in `control.eval_cases`** (ongebruikte seed-tabel). Als er later rijen mét CAO-/catalogustekst in landen, verhuizen naar het fondsschema — de ADR-lijn is de inhoud, niet de tabelnaam.

---

## Samenvatting

| Aanname | Conclusie |
|---|---|
| (1) NOLOGIN-rol + SET LOCAL ROLE fail-closed | **NIET GESCHIKT** |
| (2) Pooling + SET LOCAL reset na commit | **GESCHIKT** (directe Postgres + postgres.js-pool; SET LOCAL alleen in een transactie) |
| (3) `eval_cases` | leeg → `control`, geen fondstekst |

Tak B. Geen RLS in deze reeks. CREATE ROLE later opnieuw meten als Scalingo `CREATEROLE` geeft; tot die tijd D15 niet collapsen.
