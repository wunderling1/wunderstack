# OOMT-review — PR-0.2 (werkgebied + weigerzinnen)

Status: **wacht op OOMT-goedkeuring** · Datum: 25 augustus 2026  
Blokkeert: arbo-answergate **PR-2** (Beleidsregel-promptblokken met letterlijke zinnen)  
Duurzame bron: [Beleidsregel arbocatalogi 2019](https://wetten.overheid.nl/BWBR0042288/2023-06-21)

> Dit document **verzint geen nieuwe zinnen**. Het zet de teksten die vandaag al in productie
> staan (`packages/agents/src/arbo/prompt.ts`) naast wat OOMT nog moet vaststellen. Tot
> goedkeuring blijven Deel B2-concepten in
> [arbo-agent-compliance-actieplan.md](./arbo-agent-compliance-actieplan.md) concept.

## Te ratificeren (al live — geen nieuwe tekst)

| Rol | Constante | Huidige productiezin |
|---|---|---|
| Weigerzin (a) — niet in catalogus | `NOT_IN_CATALOG_MESSAGE` | *Ik kan dit niet terugvinden in de arbocatalogus waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.* |
| Weigerzin (c) — buiten scope | `OUT_OF_SCOPE_MESSAGE` | *Deze vraag valt buiten de arbocatalogus waar ik toegang toe heb. Voor regels uit de Arbowet of je CAO kun je de CAO-agent of je fonds raadplegen. Voor individueel veiligheidsadvies: neem contact op met de bedrijfsarts of je fonds.* |
| Werkgebied (art. 3 sub a) — huidige promptomschrijving | (inline in `ARBO_SYSTEM_INSTRUCTIONS`) | *Deze catalogus gaat over veilig werken aan elektrische voertuigen (e-voertuigen, HV-systeem, PBM, BHV).* |

## Nog vast te stellen door OOMT (niet geïmplementeerd als letterlijke eis)

| Onderwerp | Waarom |
|---|---|
| Weigerzin (b) — derde zin | Prompt vraagt drie zinnen + tie-break twijfel (a)↔(c) → (c). Derde zin bestaat nog niet in productie. |
| Exacte restrisicozin (art. 5-interpretatie) | Beleidsregel art. 5 regelt aanvullende maatregelen op bedrijfsniveau; de gebruikersgerichte "restrisicozin" is fondsbeleid, geen letterlijke wetstekst. |
| Eventuele herschrijving van (a)/(c)/werkgebied | Alleen als OOMT de live tekst wil vervangen — dan PR-2 + hermeting. |

## Besluitvorming

OOMT vinkt per rij goed / herschrijf / afkeuren. Goedgekeurde letterlijke tekst landt in
`arbo/prompt.ts` (met broncommentaar) en deactiveren van `status: concept` boven Deel B2.

Tot die tijd: hard-fact-guards en G2-answer-parameterisatie mogen door; letterlijke
Beleidsregel-promptblokken en G5-asserties die een exacte zin eisen, rapporteren
`niet van toepassing — OOMT-tekst ontbreekt` of gebruiken alleen al-goedgekeurde live zinnen.
