# Arbo-agent — compliance-actieplan

Status: **concept** · Datum: 25 augustus 2026 · Eigenaar: Wunderstack-maintainers  
Spiegeling: [arbo-agent-wettelijke-eisen-spiegeling.md](./arbo-agent-wettelijke-eisen-spiegeling.md)  
Duurzame bron: [Beleidsregel arbocatalogi 2019](https://wetten.overheid.nl/BWBR0042288/2023-06-21)

> **Deel B2 zijn concepten.** De letterlijke teksten (werkgebiedzin, drie weigerzinnen, restrisicozin)
> komen uit PR-0 punt 2 (OOMT-goedkeuring) en zijn **nog niet vastgesteld**. Implementeer ze niet
> uit dit document totdat die goedkeuring in `docs/compliance/` of in `arbo/prompt.ts`-commentaren
> is vastgelegd met bronvermelding.

## Doel

Vertalen van de Beleidsregel naar (a) promptblokken in `packages/agents/src/arbo/prompt.ts` en
(b) deterministische eval-asserties onder G2-answer (capability, geen nieuwe G-laag).

## Deel A — corpus / ingest (buiten de answergate)

| Id | Onderwerp | Status |
|---|---|---|
| A1 | Metadatavelden `legal_basis`, `measure_id`, `special_groups`, `source_type` | Open — her-ingest; niet in answergate-PRs |

Zie issue-backlog: koppel aan A1 wanneer de answergate groen is. Niet meten in dezelfde PR als
de answergate (context-omvang verschuift).

## Deel B2 — promptblokken (concept)

Alle vijf zijn prompt-only. Letterlijke zinnen: **wachten op OOMT (PR-0.2)**.

| # | Blok | Beleidsregel | Landt in |
|---|---|---|---|
| 1 | Werkgebied | art. 3 sub a | `ARBO_SYSTEM_INSTRUCTIONS` (+ later `agent_config`) |
| 2 | Drie weigerzinnen (a/b/c), lege citatie-array; tie-break: twijfel a↔c → c | art. 3 | geëxporteerde constanten |
| 3 | Volledigheid (maatregel volledig; uitzondering op "houd het compact") | art. 3 sub e | system prompt |
| 4 | Restrisico (exacte zin zonder `[n]`; verbod "voldoe je aan de wet") | art. 5 | system prompt |
| 5 | Modaliteit ("de catalogus beschrijft", niet "de wet verplicht je") | art. 1 + 3 sub e | system prompt |

Niet in de answergate-reeks (hangt aan A1-metadata):

- grondslagregel (`legal_basis`, art. 2 sub b) — wel als **hard-fact / negatieve regex** in PR-2
- bijzondere-groepenregel (`special_groups`, art. 3 sub f)
- `source_type`-blok

## Deel B3 — deterministische asserties (G5)

Release-blokkerend. Judge-scores (faithfulness / relevance / completeness) blokkeren **niet**
(generator == judge == `mistral-large-2512`).

| Id | Wanneer actief | Assertie |
|---|---|---|
| `G5-3a-SCOPE` | na OOMT-weigerzinnen | Exacte weigerzin (c) op scope-cases; lege citatie-array; geen inhoudelijk alternatief. Deze cases scoren hoog op retrieval — `minScore` vangt ze niet. |
| `G5-3e-VOLLEDIG` | na promptblok volledigheid | Stappenplanvraag: elke stap uit de bron komt terug |
| `G5-5-RESTRISICO` | na OOMT-restrisicozin | Exacte art. 5-zin + negatieve assertie op "voldoe je aan de wet" / "dan ben je klaar" |
| `G5-3e-MODALITEIT` | na promptblok modaliteit | Negatieve woordassertie, tenzij letterlijk in context |
| `G5-2b-GRONDSLAG` | met hard-fact-uitbreiding | Geen Arbowet-/Arbobesluit-artikelnummer tenzij letterlijk in passage |

Expliciet **niet van toepassing** tot A1 landt (niet als pass, niet als skip):

| Id | Reden |
|---|---|
| `G5-3f-GROEPEN` | veld `special_groups` ontbreekt in corpus |
| `G5-3d-INTERPRETATIE` | interpretatie-metadata ontbreekt |
| `G5-3c-INGANG` | ingangsvoorwaarden-metadata ontbreekt |

Rapportagevorm: `"niet van toepassing — veld ontbreekt in corpus <corpus_version>"`.

## Deel B4 — hard-fact-guards (arbo-patronen)

Naast kg/dB/ppm/°C/termijnen:

1. Wetsartikelnummers (Arbowet / Arbobesluit)
2. Spanningsgrens 60V en varianten
3. Leeftijdsgrens 18

Een verwijzing mag alleen in het antwoord staan als hij letterlijk in de opgehaalde passage voorkomt.

## Besluiten (vast, niet heronderhandelen hier)

Zie de arbo-answergate implementatieprompt (25 augustus 2026): B1 prompt-eerst, B2 G2-fixtureroute,
B3 geen relatieve regressieband tot N≥25 + 14 nightlies, B4 judge blokkeert niet, B5 één evalingang.
