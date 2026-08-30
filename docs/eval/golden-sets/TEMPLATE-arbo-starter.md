# Sjabloon — starter-golden-set voor een arbocatalogus

> Zuster van [`TEMPLATE-starter.md`](./TEMPLATE-starter.md) (CAO). Arbo-cases matchen op
> **hoofdstuk/sectiekop** (`expectedChapter`), niet op CAO-artikel/lid.

## Waar het bestand komt

| Wat | Pad |
|---|---|
| De set zelf | `packages/agents/src/evals/fixtures/golden-set.<key>.jsonl` |
| Registratie (verplicht) | profile sidecar `fixtures/fund-sets/<key>.json` met `agentKey: "arbo"` |
| Nulmeting | `docs/eval/golden-sets/NULMETING-<key>-<datum>.md` |

Een META-entry zonder fixturebestand **faalt hard** (omgekeerde guard). Een fixture zonder META idem.

## Formaat — één JSON per regel

```json
{"id":"<key>-01","question":"...","expectedChapter":"2.6. Persoonlijke beschermingsmiddelen (PBM’s)","referenceAnswer":"...","category":"in_scope"}
```

| Veld | Verplicht | Betekenis |
|---|---|---|
| `id` | ja | Stabiel, uniek |
| `question` | ja | Zoals een monteur/werknemer het vraagt |
| `expectedChapter` | ja, behalve bij `refusal` | Exacte sectiekop zoals de arbo-chunker die zet |
| `referenceAnswer` | ja | Antwoord in gewone taal, limieten letterlijk uit de catalogus |
| `category` | ja | `in_scope` · `refusal` · `table` · `derived` |

## Canonieke onderwerpen (minstens één per blok, tenzij de catalogus het niet regelt)

| # | Onderwerp |
|---|---|
| 1 | Risico’s bij e-voertuigen / HV |
| 2 | Spanningsloos maken (stappenplan) |
| 3 | PBM / isolerende handschoenen |
| 4 | Serviceplug / HV-schakelaar |
| 5 | Aanwijsbeleid (ev VOP / VP / WV) |
| 6 | BHV / calamiteiten |
| 7 | Markeringsmiddelen / oranje bedrading |
| 8 | Leeftijdsregel / jongeren |
| 9 | 0-volt-check / meetapparatuur |
| 10 | Ontlaadtijd condensatoren |

## Drie verplichte gedragscases (`category: "refusal"`)

1. **Niet in deze catalogus** — onderwerp dat semantisch grenst maar niet in de tekst staat (bijv. tillen/beeldscherm als de catalogus alleen EV is).
2. **Arbowet of CAO** — expliciet buiten scope; `referenceAnswer` mirrors `OUT_OF_SCOPE_MESSAGE`.
3. **Individueel advies** — bedrijfsarts / “is mijn werkplek goedgekeurd”; geen individueel keuringsadvies.

Ankers altijd uit de geïngeste catalogus controleren, nooit op gevoel.
