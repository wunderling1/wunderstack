# Slotverslag — ingest-herstelplan (2026-07-30 / 2026-07-31)

**Kort:** er was niets kapot in de code die de gates toetsen — het gat zat *tussen* de gates, in het pad dat data naar de gates brengt. Bewijs per bewering: `intervention-log.md` (interventies met datum), `ingest/` (structuurrapporten en voor/na-metingen), `golden-sets/NULMETING-etd-full-2026-07-30.md`, `GATE-ARCHITECTURE.md` §2 (ingest-contract) en §7 (promotiepoort).

**Nieuw bewaakt — vóór dit plan onzichtbaar.**

1. **De ingest zelf.** Elke ingest schrijft nu een structuurrapport: ankerdekking, mid-zin-starts, table-chunks, "wel ankerbaar maar niet geankerd". Daarvóór kon een echte CAO-PDF volledig zonder structuur landen zonder dat iets het zag — `article` was null voor alle 107 ETD-chunks, nu 221/245 (90,2%) en 12 table-chunks in plaats van 0.
2. **Een gate op een echt geïngest corpus.** `demo` (het gedocumenteerde corpus, dat nooit was ingeladen) en `etd-full` (245 chunks uit de echte CAO-PDF, 15 cases) hebben nu een golden set. Tot 30 juli scoorde élke groene fondsgate tegen de handgecureerde fixtureset, dus tegen materiaal dat de ingest nooit had aangeraakt.
3. **Een corpus vervangen kan, en is zichtbaar.** `--prune` trekt documenten terug die niet meer in de bron staan, README's worden niet langer als CAO-tekst geïndexeerd, en de gedocumenteerde ingest-opdracht werkt — hij faalde met ENOENT, wat verklaart waarom het demo-corpus maanden leeg bleef.
4. **Een rood resultaat houdt nu iets tegen.** `pnpm promote-check <fonds> <tag>` geeft NO-GO op een rood, ontbrekend of niet-identificeerbaar `G3-fund`-resultaat, op een append-only ledger die runs overleeft. Nachtelijk rood was visibility zonder gevolg.
5. **Wat een groene gate níét bewijst, staat er nu bij.** Een `Bewijst niet`-regel per laag G1–G4, en Bijlage B gecorrigeerd zodat `G3-fund [etd]` niet meer als "toets op echte CAO-teksten" te gebruiken is.

**Bewust open gelaten.**

- **Drempelcalibratie.** De refusal-guard is rood op `demo` én `etd-full` en groen op alleen de fixtureset; `minScore = 0.48` lijkt daarop gekalibreerd. Niet aangeraakt: een drempel verlagen om een run groen te krijgen is categorie C4. Gevolg — **P0.2 (groene volledige run als bevroren baseline) blijft open.**
- **Embedding-bake-off.** Buiten scope. Wel van belang voor later: de chunkgrenzen van `elektronische-detailhandel` zijn veranderd, dus metingen op de oude 107 chunks zijn vervallen als vergelijkingsbasis.
- **Tabel-extractie.** Loontabellen komen heel door en worden als table-chunk herkend, maar er is geen structurele extractie naar rijen en cellen: een bedrag uit een tabel leest het model nog uit platte tekst.
- **Drie residu's uit Fase 3.** De inhoudsopgave is doorzoekbare inhoud, afgebroken kruisverwijzingen leveren enkele vals-positieve koppen, en drie PDF-pagina's geven geen extraheerbare tekst (gemeld tijdens de ingest, niet stilzwijgend).
