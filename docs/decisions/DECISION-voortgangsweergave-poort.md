# Besluit — voortgangsweergave poort (na PR-A t/m PR-E)

Datum: 2 september 2026
Status: genomen
Voorgaande: [NOTITIE-voortgangsweergave-nulmeting.md](./NOTITIE-voortgangsweergave-nulmeting.md),
[mockup-loading-states.html](../design/mockup-loading-states.html)

De vijf front-PR's (labelfunctie, gedeeld `AnswerProgress`, retrieval-rapportage, `retrieval`-event,
`turnOutcome` naar de client) zijn uitgevoerd. PR-2 t/m PR-5 starten pas na dit document.

---

## D7 — `corpus.passageCount`

**Besluit: weglaten (default).**

De mockup toont "412 passages", maar er is geen betrouwbare bron op het hot path zonder een extra
`count(*)` per corpus of een handmatig bijgehouden veld in `agent_config`. Onder PR-1 regel 1 ("vind
je geen bron, laat het veld weg") is weglaten de regelconforme keuze. Het `retrieval`-event draagt
`corpus: { label, version }` zonder `passageCount`.

**Promotiepad:** gecachte `count(*)` naast `loadCorpusVersion` als een fonds het getal echt nodig
heeft — niet vóór PR-3.

---

## Poort 1 — het `verify`-event

**Besluit: aparte PR vóór PR-4, met wijziging aan de G4-naad.**

`verifyAndBuild` (`packages/agents/src/runtime/create-agent.ts`) is een pure functie. Eén
`verify`-event per citaat "op de plek waar het oordeel valt" vereist een generator of callback in
die naad — geen bijzaak in het streamcontract.

**Default voor die PR:** `verifyAndBuild` krijgt een optionele `onVerified(citation)`-callback die
vanuit `verifyCitations` wordt aangeroepen per overlevende marker, vóór `yield`. De stream yieldt
dan `{ type: "verify", label, verified: true }`. Mislukte markers worden niet uitgezonden (er is
geen geslaagd oordeel om te tonen).

---

## Poort 2 — `topScore` in het publieke contract

**Besluit: deprecate in PR-3/PR-4, verwijderen in een latere contract-PR.**

`topScore` staat vandaag op `status` (`chat.ts:55`) en `citations` (`chat.ts:64`) en gaat naar
elke embed-client. Analytics leest hem server-side in `route.ts:192-199`. De client heeft hem niet
nodig voor de voortgangsweergave (B2: geen scores in beeld).

**Volgorde:** PR-3/PR-4 stoppen met `topScore` te renderen; daarna een breaking contract-PR die het
veld uit `chatEventSchema` haalt en analytics alleen uit de agent-interne trace laat lezen.

---

## Poort 3 — `statusLabels` als tenant-contract

**Besluit: laten staan tot PR-3 live is; deprecate daarna.**

PR-B gebruikt `statusLabels` nog voor `AnswerProgress` (driestappen-checklist). Zodra PR-3 het
event-gestuurde component activeert, wordt `statusLabels` overbodig voor de UI. Het veld blijft in
`tenantPublicConfigSchema` staan zodat bestaande embed-bundles en fonds-configs niet breken.

**Verwijderen:** pas in een contract-PR ná PR-3, samen met het `status`-event zelf.

---

## Wat PR-2 t/m PR-5 mogen aannemen

| PR | Mag starten | Mockup-referentie |
|---|---|---|
| PR-2 progress-queue | ja | `mockup-loading-states.html` regels 250-251, 363-372 |
| PR-3 component | ja | mockup in `docs/design/`; glans als token in `packages/ui` |
| PR-4 uitkomsten | ja | `turnOutcome` zit in client-state; verify-event nog niet |
| PR-5 trage beurt | ja | leunt op PR-3; geen percentage/balk |

---

## Definition of Done (poort)

- [x] D7 vastgelegd (passageCount weg)
- [x] Drie open punten uit de nulmeting hebben een default
- [x] PR-2 mag starten zonder nieuwe contract-wijzigingen
