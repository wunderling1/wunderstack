# Interventielog

> **Waarvoor:** elke afwijking van het script tijdens ingest- en gate-werk, met datum, categorie,
> oorzaak en bewijs. Categorieën uit `docs/plans/PLAN-gate-scalability-test.md` §3:
>
> | Cat. | Betekenis | Zwaarte |
> |---|---|---|
> | C1 | Codewijziging nodig | Zwaar — pipeline niet corpus-onafhankelijk |
> | C2 | Configwijziging per corpus | Middel — automatiseerbaar? |
> | C3 | Handmatige datacorrectie (corpus/chunks) | Middel–zwaar — de kern van "niet plug-and-play" |
> | C4 | Drempel- of testwijziging | **Rode vlag — mag niet** |
> | C5 | Herstart/rerun | Licht, telt voor stabiliteit |
>
> Dit log telt mee voor beslisregel **R2** ("≥2 van 3 corpora halen de gates zonder
> C1–C4-interventies"). Interventies die vóór de koude doorloop nodig blijken tellen net zo hard mee
> als die tijdens: ze zijn alleen eerder gevonden.

---

## 2026-07-30 · C1 · Een corpus kon niet vervangen worden

**Fase:** ingest-herstelplan Fase 2 (voorbereiding demo re-ingest) · **Duur:** ±1 uur

**Wat.** Drie samenhangende gebreken in het productie-ingestpad, gevonden bij het klaarzetten van de
demo re-ingest:

1. Een ingest kon alleen **toevoegen** aan het corpus van een fonds. Idempotentie is per document
   gekeyd op `source_uri` (`scripts/ingest/run.ts:143-153`), en er was geen stap die documenten
   terugtrok die niet meer in de bron staan. Een CAO die onder een nieuwe bestandsnaam wordt
   heruitgegeven liet de vorige editie stil vindbaar naast de nieuwe.
2. Een mapscan pakte elk `.md`-bestand mee, dus een **README naast het corpus** werd doorzoekbare
   CAO-tekst die de agent kan citeren.
3. De gedocumenteerde ingest-opdracht (`scripts/ingest/demo-corpus/README.md:10`) gebruikte een
   repo-root-relatief pad terwijl `pnpm --filter` in de packagemap draait, en **faalde met ENOENT**.

**Oorzaak.** Punt 1 is een ontbrekende mogelijkheid, geen bug: het pad was gebouwd voor "voeg een
corpus toe", niet voor "vervang een corpus". Punt 3 verklaart waarom dit maanden onopgemerkt bleef —
wie de README volgde kreeg een foutmelding en het corpus werd nooit geladen.

**Waarom C1 en niet C3.** De datacorrectie zelf (de re-ingest) is C3 en staat hieronder. Dit is de
codewijziging die die correctie mogelijk maakte: zonder `--prune` bestond er geen manier om het
verkeerde corpus te verwijderen via het productiepad. Precies de C1-definitie: de pipeline was niet
corpus-onafhankelijk.

**Ingreep.** `--prune` toegevoegd (het inputset ís het volledige corpus; de rest wordt teruggetrokken,
uit staat het gedrag ongewijzigd), README-bestanden overgeslagen bij een mapscan mét zichtbare
melding, en de opdracht in de README gecorrigeerd. Chunks volgen het documentrij via de bestaande
`ON DELETE CASCADE` (`packages/db/src/schema.ts:55`) — geen schemawijziging.

**Bewijs.** Commit `79894c1`. Analyse: `docs/eval/ingest/FINDING-demo-corpus-mismatch-2026-07-30.md`.
Gates: `typecheck lint test:unit` 40/40 groen, `depcruise` 312 modules zonder violations.

**Wat dit zegt over schaalbaarheid.** Dit gebrek was niet corpus-specifiek. Het eerste echte fonds
dat een nieuwe CAO-editie aanlevert onder een andere bestandsnaam had er direct tegenaan gelopen,
zonder dat een gate het zag.

---

## 2026-07-30 · C3 · Fonds `demo` bevatte een ander corpus dan de golden set toetst

**Fase:** ingest-herstelplan Fase 2 · **Duur:** ±20 minuten (excl. gate-run)

**Wat.** In fonds `demo` stond één document: `demo/sample-cao.txt` (10 chunks, ingest 2026-07-03) —
een vroeg smoke-test-bestand. Het corpus waarvoor de demo-golden-set is geschreven,
`demo-corpus/cao-fictief.md`, was nooit ingeladen. Zeven van de tien verwachte artikelen bestonden
niet in de opgeslagen tekst; twee van de drie die wel bestonden gingen over iets anders.

**Oorzaak.** Zie C1 punt 3: de gedocumenteerde opdracht faalde. Dat `G3-fund [demo]` daarna
maandenlang 0% haalde was daarmee **overbepaald** — verkeerd corpus én geen structuurankers — en
niemand werd tegengehouden, want nachtelijk rood is visibility zonder blokkade (open besluit B4).

**Correctie op de diagnose.** `docs/eval/diagnosis-fund-article-metadata-2026-07-30.md` §2 wees dit
aan als verouderde chunker-output op het juiste corpus. Het label *vals-rood* blijft juist, het
mechanisme niet. §3 van de diagnose (de PDF-ingest levert geen ankers) staat onaangetast overeind en
is in Fase 1 onafhankelijk herbevestigd.

**Ingreep.** Re-ingest via het productiepad, geen ad-hoc script:

```sh
pnpm --filter @wunderstack/ingest ingest demo-corpus --fund demo --version 1 --prune --label na-reingest
```

```
  skipped   README.md (documentation, not corpus)
  created   demo/cao-fictief.md (32 chunks, 1 table, 31 with sourceRef)
  retracted demo/sample-cao.txt (10 chunks removed)
```

**Kosten.** 32 chunk-embeddings bij Scaleway (`qwen3-embedding-8b` @ 4096). Vooraf gemeld en
goedgekeurd.

**Meting voor/na [gemeten].**

| Maat | Voor | Na |
|---|---|---|
| Chunks | 10 | 32 |
| Met `article` | 0/10 (0,0%) | **26/32 (81,3%)** |
| Met `source_ref` | 0/10 (0,0%) | **31/32 (96,9%)** |
| Table-chunks | 0 | **1** |
| Begint mid-zin | 0/10 | 0/32 |
| Regel-leidende `Artikel N` zonder `article` | 6 | **0** |

**Bewijs.** Voor: `docs/eval/ingest/INGEST-demo-2026-07-30.md`. Na:
`docs/eval/ingest/INGEST-demo-2026-07-30-na-reingest.md`.

**Gate-uitkomst [gemeten].** `G3-fund [demo]` ging van 0% naar **100% op alle vier retrieval-maten**
(hit@1, recall@3, recall@5 alle 100%, MRR 1,000). Eén check sloeg de andere kant op: de refusal-guard
haalt nu 0 van 2 lege out-of-corpus-probes en faalt. Die stond in de baseline groen, maar **vacuüm
groen** — daar vond retrieval categorisch niets, ook op de inhoudelijke vragen. De volledige run
eindigt daardoor op `EVAL_EXIT=1`, dus **P0.2 blijft open**. Niet gerepareerd door een drempel te
verlagen: dat zou C4 zijn. Analyse: `docs/eval/ingest/GATE-RUN-demo-2026-07-30.md`.

---

## Openstaand

- **C1 · parse-fix PDF-regelstructuur** — Fase 3 van het ingest-herstelplan, nog niet uitgevoerd.
  Grond: `docs/eval/diagnosis-fund-article-metadata-2026-07-30.md` §3 en de baseline
  `docs/eval/ingest/INGEST-elektronische-detailhandel-2026-07-30.md` (0/107 ankers, 0 table-chunks,
  86% mid-zin-starts).
