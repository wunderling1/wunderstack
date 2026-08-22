# ADR — Eén platformomgeving, gescheiden data plane per fonds

Status: **accepted (tak B)** · Datum: 21 augustus 2026  
Amendeert: de operationele lijn “één instance = één tenant = één database” (D15 in [PLAN-ui-ecosystem.md](../plans/PLAN-ui-ecosystem.md), comments in `packages/db`, migratie `0007`) — die lijn wordt **niet vervangen**. Database-per-fonds verhuist naar een **promotiepad** (§7). De procesgrens (runtime-per-fonds) blijft de afgedwongen isolatie.  
Raakt: `packages/rag`, `packages/db`, `apps/runtime`, `apps/dashboard`, `scripts/ingest`, migraties.  
Verificatie: [NOTE-db-rollen-en-pooling.md](NOTE-db-rollen-en-pooling.md) (21 augustus 2026).

---

## 1. Context

Wunderstack krijgt één gezamenlijke platformomgeving: fondsen loggen in op hetzelfde dashboard, zien hun eigen agents, hun eigen gate-uitslagen en hun eigen gebruik. De code is gedeeld (regel van drie). De release-eenheid is een gesigneerde `(fund, agent_key)`-bundel.

De vraag is **waar de scheidslijn tussen fondsen fysiek ligt**. Dat besluit is grotendeels onomkeerbaar zodra er corpus staat.

Drie kandidaten:

- **A** — Shared schema + RLS-policies. Alle fondsen in dezelfde tabellen, `fund`-kolom + policy.
- **B** — Schema per fonds, één Postgres. Eigen tabellen per fonds, gedeelde instance.
- **C** — Database per fonds. Eigen addon per fonds.

Vandaag is de afgedwongen isolatie **deployment**, niet de database: D15, één proces = één `TENANT` = één fund; embed-auth weigert keys van een andere tenant ([`apps/runtime/lib/embed-auth.ts`](../../apps/runtime/lib/embed-auth.ts)).

---

## 2. Besluit

**Twee vlakken, twee inrichtingen. Isolatie op twee lagen, tot CREATE ROLE bestaat.**

**Control plane — één gedeeld schema `control`.** Alles wat het gezamenlijke dashboard mogelijk maakt en géén fondsinhoud is:

- `users` (Auth.js Credentials; geen adaptertabellen)
- `funds`
- `agent_instances` — één rij per `(fund_key, agent_key)` (nu: `tenant_config`), `public_key` als **publieke identifier** (geen hash), status, `schema_name`, `connection_key` (opaque; nooit een URL)
- `agent_config` — jsonb-knoppen (`minScore`, starters, corpusversie). Prompts en weigerzinnen blijven in code.
- Gate-uitslagen blijven het file-ledger tot een latere tabel ze verdient
- Audit log (dun, bij het verwijder-runbook), later usage-tellers zonder brontekst

**Data plane — schema per fonds (optie B), binnen één Postgres.** Corpus, chunks, embeddings, interaction events mét inhoud. Golden-set-**bestanden** blijven JSONL in git (D3 default, niet in deze reeks gebouwd).

Wat expliciet **niet** in het control plane staat: chunks, embeddings, gespreksinhoud, golden-set-inhoud. Alleen tellers en uitkomsten, geen brontekst en geen vragen van eindgebruikers.

**Tak B (geverifieerd):** de addon-user kan geen `CREATE ROLE`. Fail-closed `SET LOCAL ROLE` is niet beschikbaar. Daarom:

- schema-per-fonds voor **aantoonbaar verwijderen** en het **promotiepad**;
- **D15 niet collapsen** — runtime-per-fonds blijft de beveiligingsgrens;
- gedeeld **dashboard**, geen gedeelde **runtime**.

Naar een bestuur: dit is geen DB-afgedwongen isolatie. `search_path` is organisatie, geen lock.

---

## 3. Waarom B en niet A — twee pijlers

Niet drie. De oorspronkelijke ANN-reden is ongeldig en hoort niet in de onderbouwing.

**a. Aantoonbaar verwijderen.**
Fonds stopt → `pg_dump -n fund_<key>` als export, daarna `DROP SCHEMA fund_<key> CASCADE`. Bij optie A is verwijderen een `DELETE` over meerdere tabellen die je nooit bewijsbaar compleet krijgt. Dat raakt de propositie (bewijsbare betrouwbaarheid), de AVG-verwijderplicht en de exit-clausule in de AV.

**b. Het promotiepad naar C blijft open.**
Een fonds dat contractueel een eigen database eist, verhuis je met een schema-dump naar een eigen addon. De DSN komt **niet** in de control-plane-tabel: `connection_key` is opaque; de URL staat in env (`WUNDERSTACK_DB_URL_<KEY>`). Tot er een echt promotiesignaal is, is dit pad niet live (amendement §11).

**Geen pijler: ANN-recall.** Embeddings zijn `qwen3-embedding-8b` @ 4096 dim. pgvector’s HNSW/ivfflat-limiet is 2000, dus retrieval is **exact (flat) search**. Een pre-filter op `(fund, agent_key)` degradeert geen recall: er valt geen ANN-recall te verliezen. HNSW per partitie is fysiek onmogelijk zonder re-embed. Partitioneren van `documents` raakt de vector-scan niet (die loopt over `chunks`).

**Voetnoot, geen hoofdreden:** bij exact search schaalt de queryprijs lineair met het aantal gescande rijen. Kleinere tabellen per schema zijn dan meer waard dan bij ANN. De winst is bescheiden: een btree op `(fund, agent_key)` restrict ook. Prestatie, geen correctheid.

---

## 4. Isolatienaad — tak B

De ontwerp-ADR beschreef fail-closed rollen: runtime-rol zonder USAGE op fondsschema’s, `SET LOCAL ROLE fund_<key>` per transactie, vergeten SET → permission denied.

[PR0](NOTE-db-rollen-en-pooling.md): `CREATE ROLE` = `permission denied to create role` (`rolcreaterole = f`). Zelfde uitkomst als 22 juli 2026.

Op tak B:

- Fondsschema’s bestaan; de addon-owner (`wunderstack_8322`) ziet ze allemaal. Dat is **geen** fail-closed DB-grens.
- Afgedwongen isolatie blijft **D15**: één runtime-proces, één `TENANT`, embed-auth `instance.tenantId === getTenantId()`.
- Public key is een publieke identifier in de embed-snippet, geen secret. Intrekbaarheid = `rotateTenantKey` zonder de instance te herbouwen. Geen `public_key_hash`.
- `data-agent` / meegestuurde `fund` blijven geen trust boundary: valideren tegen wat de key toestaat, nooit overrulen.
- Resolver mag `search_path` zetten als organisatie. Een bug daar is geen permission denied — geaccepteerd tot tak A beschikbaar is.
- Drie rollen (`migrator` / `app_runtime` / `fund_<key>`) zijn de vorm van **tak A**, niet van deze release. RLS als vervanging van SET ROLE is een nieuwe ADR, niet deze.

`documents.fund` blijft als redundante kolom, met CHECK tegen de fund-key. Tripwire voor de isolatiegate.

---

## 5. Harde invariant — geen query over fondsschema’s heen

Cross-fonds-aggregatie gebeurt **uitsluitend op tellers in het control plane**, nooit met SQL over fondsschema’s (join, union, gecombineerde `search_path`, dblink, FDW).

Eén join over schema’s en `pg_dump -n` is geen verhuizing meer: het fonds is dan geen zelfstandige dump-eenheid. Admin-KPI over meerdere fondsen: control-tellers, of iteratie in de applicatie (één fondscontext per ronde), aggregatie buiten SQL.

Geldt of CREATE ROLE later wel of niet komt.

---

## 6. Gevolgen voor bestaande besluiten

- `agent_key` op `documents`, fail-closed `retrieve()` / `fetchParentPassage()` — **ongewijzigd**. Binnen het fondsschema blijft de WHERE-filter.
- `--prune` alleen op eigen `(fund, agent_key)` — **ongewijzigd**, nu ook fysiek begrensd tot het schema.
- `tenant_config` als agent-instance-tabel ([DECISION-second-agent-arbo.md](../decisions/DECISION-second-agent-arbo.md) besluit 3) — **verhuist naar `control.agent_instances`**. Bestaande rijen (cao **en** arbo) behouden hun `agent_key`. Embed-kolommen `cors_allowlist`, `theme`, `texts` gaan mee. Public key blijft plaintext.
- Gesigneerde bundels per `(fund, agent_key)` — **ongewijzigd**.
- Langfuse EU Cloud, tags per fonds — **open** (D5). Geen hardcoded fondsstrings; tags uit de resolved instance.
- D14 ([PLAN-ui-ecosystem.md](../plans/PLAN-ui-ecosystem.md)) — **niet ingetrokken.** Runtime blijft API-only en **per fondsinstance** gedeployed. Het herzieningscriterium “meerdere fondsen op één runtime-instance” is **niet** getrokken.
- D15 — **niet gecollapseerd.** 1-op-1 tenant↔fund per runtime-proces blijft de lock. Control plane (dashboard) mag rijen van meerdere fondsen bevatten; de runtime van fonds A praat niet met het schema van fonds B via een gedeeld proces.
- Sibling-expansie — **ongewijzigd**, niet in dezelfde PR als de retrieval-kopieermeting.

---

## 7. Wat we hiermee opgeven — expliciet

**PITR per fonds vervalt.** Eén instance is één backup-tijdlijn. Eén fonds terugzetten naar gisteren betekent: restore naar een zij-instance, schema terugkopiëren. Dat is te doen, maar het moet een **getest runbook** zijn vóór klant twee, niet daarna. Dit is de enige harde functionaliteit die optie C wél heeft en B niet.

**De release-trilemma wordt structureel.** Gedeelde code betekent dat één deploy alle actieve fondsen raakt. De deploy-gate wordt: alle golden sets van alle actieve fondsen groen, elk met hun eigen gepinde bundel. CI-tijd schaalt lineair in het aantal fondsen. Dat is bekend en geaccepteerd; het wordt hier alleen concreet.

**Migraties draaien N keer.** Er is een runner nodig die per schema itereert en gedeeltelijke mislukking overleeft (fonds 7 faalt, 1–6 zijn al om). Gevolg als harde regel: **elke migratie is backward-compatible met de vorige codeversie.** Geen destructieve migratie in dezelfde release als de code die erop leunt.

**Noisy neighbour blijft mogelijk.** Eén fonds met een zware ingest kan de latency van een ander raken. Meetbaar, niet uitgesloten. Dit is een promotietrigger, geen blokker.

---

## 8. Promotiepad naar database per fonds (optie C)

Vier triggers, nu vastgelegd zodat er later niet over onderhandeld hoeft te worden:

1. Contractuele eis van het fonds;
2. Uitkomst van een DPIA die fysieke scheiding vereist;
3. Een pensioenfonds onder DNB-toezicht;
4. Aantoonbare noisy-neighbour-latency (p95 op fonds X verslechtert door belasting van fonds Y).

Bij elke trigger: `pg_dump -n fund_<key>` → nieuwe addon → opaque `connection_key` + DSN in `WUNDERSTACK_DB_URL_<KEY>` (nooit een URL in de tabel). **Niet live tot een echt signaal** (§11).

Op tak B is dit pad extra belangrijk: het is de weg naar échte DB-scheiding zolang `CREATE ROLE` ontbreekt.

---

## 9. Open besluiten met gekozen default

- **D1** Control plane in dezelfde Postgres-addon (eigen schema) of eigen addon? Default: eigen schema nu. Herzien bij klant drie (dashboardbeschikbaarheid vs. corpusbelasting).
- **D2** Interaction events mét inhoud: fondsschema. Alleen geaggregeerde tellers zonder tekst naar control plane.
- **D3** Golden sets: default fondsschema (data-asset van het fonds); alleen pass/fail naar control. **In deze reeks:** JSONL in git; `eval_cases` is leeg en parkeert in `control`.
- **D4** Migratierunner: dunne runner over `control.funds`, per-schema versietabel. Herzien als Drizzle native multi-schema-migraties krijgt.
- **D5** Langfuse: één project met fondstag, of project per fonds? **Nog open — besluit vóór klant twee.**
- **Tak A-heropening:** als Scalingo `CREATEROLE` geeft, opnieuw PR0 draaien. Pas dán D15 collapsen en `SET LOCAL ROLE` als fail-closed grens. Geen stille overstap.

---

## 10. Bewust niet in deze ADR

- Memberships, Auth.js-adaptertabellen, bundle-registry, usage-tellers, gate-uitslagen-tabel — niet bouwen omdat een doelplaatje ze noemt.
- HNSW, ivfflat, partitionering van `documents` of `chunks`.
- Hashen van de public key.
- RLS als vervanging van SET ROLE.
- SQL over fondsschema’s heen.
- Gedeelde runtime (meerdere fondsen in één proces) op tak B.

---

## 11. Amendement 21 augustus 2026 — grants en promotie

Code review 2026-08-21 20:30. Eigenaar: Wunderstack-maintainers. Datum: 21 augustus 2026.

**Promotie (D2 van die review):** `getDbForConnection` en `lookupConnectionRef` worden niet gebouwd. `connection_ref` is hernoemd naar `connection_key` met CHECK die `://` weigert. `resolveConnection(key)` leest alleen `WUNDERSTACK_DB_URL_<KEY>` en gooit bij onbekende/ontbrekende sleutel — geen terugval op `DATABASE_URL`. Het request-pad blijft de gedeelde pool.

**`TO PUBLIC` (D3 van die review):** `CREATE ROLE` blijft onmogelijk op de addon. Er is geen smallere in-database-rol die we zelf kunnen maken. Daarom:

- `GRANT … TO PUBLIC` op `control` is ingetrokken (migratie `0014_revoke_public_grants`). `control.users` (`password_hash`) en `control.agent_instances` krijgen nooit een PUBLIC-grant.
- Nieuwe fondsschema's krijgen geen PUBLIC-grant (`fund-ddl.ts`).
- Bestaande `fund_*`-schema's: eenmalig `scripts/db/revoke-public-fund-grants.ts`. Volgorde: [DEPLOY-revoke-public-grants.md](../runbooks/DEPLOY-revoke-public-grants.md) (`grant-reader` vóór `0014`).
- Extra Scalingo-logins krijgen standaard geen SELECT. Een named reader alleen via `scripts/db/grant-reader.ts` (`DB_READER_ROLE`). We maken geen extra login aan zonder dat script.
- De addon-owner behoudt alle rechten. Isolatie blijft D15, niet de database.

CI: `scripts/check-grants.sh` faalt op nieuwe `TO PUBLIC` in migraties en `fund-ddl.ts`.

