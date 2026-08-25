# Arbo-agent — wettelijke eisen (spiegeling)

Status: **concept** · Datum: 25 augustus 2026 · Eigenaar: Wunderstack-maintainers

## Duurzame bron

Dit document spiegeling de eisen uit de **Beleidsregel arbocatalogi 2019**:

- Officiële tekst: [wetten.overheid.nl/BWBR0042288/2023-06-21](https://wetten.overheid.nl/BWBR0042288/2023-06-21)

Het begeleidende [compliance-actieplan](./arbo-agent-compliance-actieplan.md) is de *interpretatie*
van die regel naar de arbo-agent (promptblokken, gates, metadatavelden). Waar actieplan en
Beleidsregel verschillen, wint de Beleidsregel.

## Scope van deze spiegeling

| Onderwerp | Beleidsregel | Agent-implicatie (samenvatting) |
|---|---|---|
| Werkgebied | art. 3 sub a | Agent noemt het werkgebied woordelijk uit de catalogus |
| Grondslag | art. 2 sub b | Geen wetsartikelnummer zonder letterlijke passage |
| Weigeren buiten catalogus | art. 3 | Exacte weigerzinnen; lege citatie-array |
| Volledigheid | art. 3 sub e | Maatregel/stappenplan volledig (niet "houd het compact") |
| Modaliteit | art. 1 + 3 sub e | "de catalogus beschrijft", niet "de wet verplicht je" tenzij letterlijk |
| Bijzondere groepen | art. 3 sub f | Vereist `special_groups`-metadata (nog niet in corpus) |
| Restrisico | art. 5 | Exacte zin bij maatregelantwoorden, zonder `[n]` |

## Gate-ids (G5) — artikelverwijzing

Deze ids belanden in assertienamen in de eval en in `GATE-ARCHITECTURE.md`. Ze verwijzen naar
artikelen in de Beleidsregel hierboven. Zie het actieplan voor de status per id.

| Id | Artikel | Wat de assertie afdwingt |
|---|---|---|
| `G5-3a-SCOPE` | art. 3 sub a | Exacte scope-weigerzin; lege citatie-array; geen inhoudelijk alternatief |
| `G5-2b-GRONDSLAG` | art. 2 sub b | Geen Arbowet-/Arbobesluit-artikelnummer tenzij letterlijk in de passage |
| `G5-3e-VOLLEDIG` | art. 3 sub e | Stappenplanvraag: elke stap uit de bron komt terug |
| `G5-3e-MODALITEIT` | art. 1 + 3 sub e | Negatieve woordassertie op "wettelijk verplicht" / "de wet verplicht je" |
| `G5-5-RESTRISICO` | art. 5 | Exacte restrisicozin aanwezig; verbod op "voldoe je aan de wet" |
| `G5-3f-GROEPEN` | art. 3 sub f | Bijzondere groepen — **n.v.t.** tot `special_groups` in het corpus zit |
| `G5-3d-INTERPRETATIE` | art. 3 sub d | Interpretatiegrenzen — **n.v.t.** tot metadata aanwezig is |
| `G5-3c-INGANG` | art. 3 sub c | Ingangsvoorwaarden — **n.v.t.** tot metadata aanwezig is |
| *(9e id gereserveerd)* | — | Zie actieplan wanneer OOMT de set vaststelt |

## Wat dit document niet is

- Geen goedgekeurde weigerzinnen. Die komen uit PR-0 punt 2 (OOMT) en landen in
  `packages/agents/src/arbo/prompt.ts`.
- Geen vervanging van de Beleidsregel. Bij twijfel: de wetstekst.
