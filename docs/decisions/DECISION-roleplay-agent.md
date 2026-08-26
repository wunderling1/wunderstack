# DECISION — Rollenspelagent (tweede agenttype)

Status: accepted · Datum: 25 augustus 2026 · Eigenaar: Wunderstack-maintainers
Amendeert: [DECISION-second-agent-arbo.md](./DECISION-second-agent-arbo.md) §4 en
`.cursor/rules/400-data-rag.mdc` (achtergrondjobs).
Raakt: `packages/shared`, `packages/agents`, `packages/db`, `apps/runtime`, `apps/dashboard`.
Plan: `docs/plans/` (rollenspelagent) · Inventarisatie: [qonvo-rollenspel-inventarisatie.md](../audit/qonvo-rollenspel-inventarisatie.md)

## Context

Wunderstack krijgt een rollenspelagent: een gespreks-partner die een persona speelt zodat een
deelnemer een lastig gesprek kan oefenen, gevolgd door een beoordeling tegen een rubriek. De
implementatie wordt overgezet uit Qonvo, waar hij al op Mastra draait met prompts in code.

Dat is een fundamenteel ander agenttype dan CAO en arbo. Die halen passages op en mogen niets
beweren zonder geverifieerd citaat; de rollenspeler haalt niets op en citeert niets. Hij is ook
niet stateless: een gesprek is een reeks beurten met een teller, een eindconditie en een
transcript dat de beoordelaar later in zijn geheel moet zien.

Dit was al voorzien in [DECISION-second-agent-arbo.md](./DECISION-second-agent-arbo.md) regel
10-11: "The rollenspel agent is not a RAG agent and does not count toward the rule of three."
Dit document maakt daar de consequenties van expliciet.

## Besluit

### R1 — De sleutelruimte splitst in instances en grounded agents

`AGENT_KEYS` in `packages/shared/src/config/agent-keys.ts` was tegelijk vier dingen: de lijst van
mogelijke instances, de sleutel van `control.agent_instances`, de catalogus, en de domein van
`AGENT_PROFILES`. Die vier vallen niet langer samen.

- **`AGENT_KEYS` / `AgentKey`** — alles wat als instance op een fonds kan bestaan: `cao`, `arbo`,
  `roleplay`. Dit is de sleutel in `control.agent_instances`, in tracing en in analytics.
- **`GROUNDED_AGENT_KEYS` / `GroundedAgentKey`** — de deelverzameling die vragen beantwoordt uit
  een corpus via `createGroundedAgent`. Alleen deze hebben een `AgentRuntimeProfile`.

`AGENT_PROFILES` gaat `satisfies Record<GroundedAgentKey, AgentRuntimeProfile>`. Zonder deze
splitsing zou een rollenspelprofiel een `runRetrieval` moeten leveren die het niet gebruikt
(`packages/agents/src/runtime/profile.ts`) en zou de citatiedwang die het grounded product veilig
maakt uitgezet moeten worden (`packages/agents/src/runtime/create-agent.ts`). De guard slopen om
een agent binnen te laten die er niet thuishoort is de verkeerde volgorde.

`GROUNDED_AGENT_KEYS` is `satisfies readonly AgentKey[]`, zodat de deelverzameling-relatie een
compileerfout wordt zodra iemand hem breekt.

**Overgangsstand (volledig opgeheven 25 augustus 2026, fase 6).** De filters die `roleplay` buiten
instance-aanmaak hielden verdwenen in fase 5, toen runtime en auteurs-UI er waren. Het laatste
restant — `/admin/agents` en `KNOWN_AGENTS` die op `GROUNDED_AGENT_KEYS` stonden — is weg nu de
rollenspelagent zijn eigen gate-familie heeft (`G1-roleplay-contract`, `G2-roleplay-persona`,
`G2-roleplay-review`). De reden om hem te verbergen was dat een stub-manifest met "n.n.b." een agent
suggereerde die niet te meten viel; dat klopt niet meer. De splitsing zelf blijft: `roleplay` staat
in `AGENT_KEYS` en niet in `GROUNDED_AGENT_KEYS`, want hij haalt niets op.

**Alias in `packages/agents`.** `registry.ts` exporteert `GroundedAgentKey` als primaire naam en
houdt `AgentKey` als gedeprecieerde alias, uitsluitend zodat `src/evals/agent-profile.ts`
ongewijzigd blijft — `700-evals.mdc` verbiedt het aanraken van `src/evals/` als neveneffect van
ander werk. De publieke barrel (`packages/agents/src/index.ts`) exporteert alleen de nieuwe naam,
zodat er buiten het package geen twee betekenissen van `AgentKey` naast elkaar leven.

### R2 — Plat scenariomodel, geen blokkenbibliotheek

Qonvo modelleert een scenario als vijf herbruikbare `*_library`-tabellen met per sjabloon een
`*_override`-jsonb, een resolve-laag, een copy-flow en drie zichtbaarheidsniveaus. Dat is zijn
antwoord op hergebruik over veel organisaties heen.

Wunderstack heeft één fonds per runtime (D15). V1 is één `roleplay_scenarios`-rij met inline
velden. De blokkenbibliotheek is een promotiepad, geen startpunt — te overwegen zodra een fonds
aantoonbaar dezelfde persona over meerdere scenario's hergebruikt.

**Aangetekend bij fase 5.** Auteurswerk zit in het dashboard onder de rollenspel-instance
(`/admin/funds/[fundKey]/agents/roleplay/scenarios`). Alleen `assertAdmin()` schrijft, via
`getWriterDb()` op `control.roleplay_scenarios` — niet het fondsschema, en niet het fondsgezicht.
Eén formulier, geen wizard, geen blokkenkiezer. Publiceren faalt hard tot persona, situatie,
openingszin, briefing en minstens één rubriekvraag er zijn; een mislukte publicatie wordt als
concept bewaard. `version` bump bij inhoudswijziging, niet bij alleen-status. Bestaande
`roleplay_sessions.scenario_snapshot`-rijen worden nooit herschreven.

### R3 — Pseudoniem-only, ook wanneer LTI identiteit aanbiedt

De rollenspelagent volgt het identiteitsmodel van de bestaande agents: geen persoonsgegevens.
Wanneer LTI later een launch levert, slaan we de `user_id` van het platform op als ondoorzichtige
pseudonieme referentie en vragen of bewaren we `lis_person_name_full` en
`lis_person_contact_email_primary` niet. Qonvo bewaart die wel als display-metadata; dat nemen we
niet over.

Gevolg: de didactische context uit Qonvo (vorige pogingen van deze deelnemer terugkoppelen in de
prompt) kan pas als er een stabiel pseudoniem is, dus niet in v1.

**Aangetekend bij fase 2:** dat gevolg reikt verder dan een weggelaten promptblok. Qonvo's
beoordelingsprompt *verplicht* een samenvattingssectie met de kop "Hoe heeft de leerling vooruitgang
geboekt ten opzichte van vorige pogingen?". Die kop laten staan zonder geschiedenis mee te sturen
dwingt het model om vooruitgang te verzinnen. De sectie is daarom verwijderd, niet leeggelaten; de
samenvatting heeft in v1 twee vaste secties in plaats van drie.

Een teruggekoppeld resultaat is een administratief record in het systeem van de klant en heeft
daarmee een andere bewaartermijn dan de 90 dagen van `interaction_events`.

**Aangetekend bij fase 7:** de resultaat-envelop draagt het cijfer, de rubriek, de eindreden en de
pseudoniemen — niet het transcript. Dat blijft in het fondsschema. `sessionId` is de
idempotency-sleutel: een retried POST mag bij de klant geen tweede cijfer worden. Hun kopie volgt
hun eigen bewaartermijn; de onze volgt de sessietabel.

**Aangetekend bij fase 8:** de LTI 1.1-launch slaat `user_id` op als HMAC onder `LTI_SESSION_SECRET`
(geen e-mail-autolink, geen rollen uit `roles`, geen `lis_person_name_*` /
`lis_person_contact_email_primary`). Er is geen `lti11_user_mappings`-tabel. Het sessietoken is
`{ lid, exp }` — geen `uid`. Dat is de voorwaarde voor een later "voortgang t.o.v. vorige pogingen"-
blok in de beoordelingsprompt; tot die geschiedenis daadwerkelijk wordt meegestuurd blijft de kop
weg (aantekening fase 2).

### R4 — De beoordeling is server-gedreven, met een outbox

`400-data-rag.mdc` zegt: "Ingestion = de enige background-job in v1. Generaliseer async NIET naar
het chat-pad." Dat houdt geen stand zodra een resultaat naar buiten moet.

De beoordeling duurt tot twee minuten, en het resultaat moet daarna naar het systeem van de klant
(webhook, later LTI-cijferteruggave). Een beoordeling die door de client wordt gestart en
afgewacht, verdwijnt zodra de deelnemer zijn tabblad sluit. Bezorging die afhangt van een open
browser is geen bezorging.

Daarom: de beoordeling wordt server-side gestart en afgemaakt, en de uitkomst gaat via een
outbox-tabel met poging-teller en dedup naar buiten. Dit amendeert de regel expliciet; het
chat-pad van de grounded agents blijft ongewijzigd request/response.

**Aangetekend bij fase 7.** De outbox is `roleplay_result_deliveries`. Verwerking is opportunistisch
(`after()` op review en start), geen queue-product: Inngest/Temporal blijven buiten v1. De eerste
adapter is webhook (HMAC-spiegel van de inkomende seam, SSRF-guard op de door de klant gekozen URL).
LTI 1.1 haakt op dezelfde `target.kind`-naad (`lti11` Basic Outcomes, OAuth 1.0a + `oauth_body_hash`).
Cijferteruggave is opt-in per consumer (`grade_passback_enabled`, default false) en stuurt de
bestaande `normalizedScore` (0–1), geen nieuw geslaagd/gezakt-primitief. Een mislukte bezorging laat
de beoordeling staan.

**Aangetekend bij fase 8.** De nonce-claim is atomair (`control.acquire_lti11_nonce`); bij falen ná
de claim wordt hij vrijgegeven, anders is een browser-retry een false-positive replay. Timestamp-skew
is 90 minuten. De cookie-flow uit Qonvo is niet overgezet — zie
[lti11-token-sessie.md](../lti11-token-sessie.md).

### R5 — Eigen streamingcontract, niet `chatEventSchema`

Het contract in `packages/shared/src/contracts/chat.ts` heeft een verplicht `citations`-event met
`found`, `citations[]` en `citationVerificationFailed`. Die volgorde is de G4-garantie van het
grounded product. Een rollenspelbeurt heeft daar niets zinnigs in te vullen, dus krijgt de
rollenspeler een eigen NDJSON-contract in dezelfde vorm en met dezelfde perimeter.

Bijkomend: omdat er niets te verifiëren valt, mag de rollenspeler wél token-voor-token streamen —
het grounded pad kan dat structureel niet (buffer-to-verify in `create-agent.ts`).

**Aangetekend bij fase 2 (25 augustus 2026):** die laatste alinea is nog geen vrijbrief. De
overgezette beurt-prompt laat het model JSON teruggeven (`{"text": …, "conversationEnd": …}`), en
je kunt geen JSON-veld token-voor-token doorgeven zonder incrementeel te parsen. Fase 2 buffert
daarom en levert een hele beurt. Wil fase 3 echt streamen, dan is dat een prompt-wijziging — proza
gevolgd door een sentinel, zoals `CITATIONS_SENTINEL` in het grounded pad — en dus een bump van
`ROLEPLAY_PROMPT_VERSION`, geen implementatiedetail van de route.

**Aangetekend bij fase 3:** het contract staat er (`packages/shared/src/contracts/roleplay.ts`).
`turn` is het terminale event — de rollenspel-tegenhanger van `citations` — met de reactie,
`conversationEnd`, de gezaghebbende beurtteller en `endReason`. `status` heeft één fase
(`generating`), omdat er geen retrieval te melden valt; de enum blijft bestaan zodat fase 10
`transcribing`/`synthesizing` kan toevoegen zonder contractwijziging.

De *robuustheid* is wél gedeeld. De hartslag, het beurtbudget en de garantie "een verbonden client
krijgt nooit een gesloten stream zonder terminaal event" zaten in `chat-stream.ts` en zijn verhuisd
naar `lib/ndjson-stream.ts`; chat en rollenspel injecteren alleen hun eigen union en terminal/final-
regels. Twee kopieën van die code zou betekenen dat de volgende bug in één ervan gefixt wordt. De
55 bestaande chat-streamtests draaiden onveranderd door de extractie heen.

Eén getal bleek gevaarlijk: het streambudget van de route en de modeltimeout uit fase 2 stonden
allebei op 30 s, en dan bepaalt een race wie het eerst afgaat. Het routebudget is nu afgeleid van
`ROLEPLAY_TIMEOUT_MS.turn + 5 s`, zodat de modeltimeout altijd wint en de specifieke fout de
generieke "duurde te lang" niet verliest.

### R6 — Code in `packages/agents/src/roleplay/`

Geen nieuw package. De rollenspeler hergebruikt `model/sovereign-model.ts` en
`observability/trace.ts` en raakt `runtime/` niet aan. Eigen sub-barrel, zodat de grounded seam en
de rollenspel-seam los van elkaar te lezen zijn. Een eigen package pas als die grens vervaagt.

**Aangetekend bij fase 2:** `observability/trace.ts` bleek niet herbruikbaar. Die helper is
retrieval-gevormd (`startRetrieval`, `citationCount`, `refused`) en het rollenspel heeft daar niets
in te vullen — hem toch gebruiken zou dezelfde fout zijn als het rollenspel in `AgentRuntimeProfile`
persen, waar R1 vanaf stapt. De tracing loopt daarom via Mastra's eigen span (`roleplay/model-call.ts`)
met branch, promptversie en sessie-id als metadata. Het model gaat wél via `sovereign-model.ts`, dus
de soevereiniteitsgarantie is ongewijzigd.

**Aangetekend bij fase 3:** de sessieopslag (`roleplay/session-store.ts`) landt in hetzelfde package,
maar niet omdat het daar het mooist staat — de grensregel `no-apps-to-fund-schema` verbiedt een app
om `packages/db/src/schema/fund/` aan te raken, precies zoals het corpus via `packages/rag` loopt en
het event-log via `@wunderstack/analytics`. Rollenspel had zo'n eigenaar niet en R6 sluit een nieuw
package uit, dus komt hij naast de agent die de data produceert. De agent-seam zelf (`agent.ts`)
blijft database-vrij: dit is een buurmodule, geen laag eronder.

Dat de scenario's in `control` staan en de sessies in het fondsschema betekent dat een sessie zijn
scenario per slug en versie noemt, niet per foreign key. Zwakker, en dat is de prijs van tak B.

### R7 — Het model scoort, wij rekenen

Qonvo vraagt het model om zelf `Σ(score × weging)` uit te rekenen, de uitkomst in de samenvatting te
noemen, en op basis daarvan `isPassed` te bepalen. Drie problemen: taalmodellen zijn onbetrouwbaar in
precies dit soort meertermige rekenwerk, het getal is geen suggestie maar een cijfer dat straks naar
het LMS van een klant gaat, en zodra wij het totaal zelf herberekenen spreekt de samenvatting het
opgeslagen cijfer vroeg of laat tegen.

Daarom is de taakverdeling omgedraaid: het model scoort elk criterium — dat is een oordeel — en de
weging, het totaal en de geslaagd-beslissing gebeuren in code (`roleplay/rubric.ts`). De prompt
verbiedt het model expliciet om een cijfermatig eindoordeel te noemen. Zijn eigen `isPassed` wordt
nog wel gevraagd, maar alleen bewaard als tweede mening voor de evals in fase 6.

Twee defecten die deze omkering aan het licht bracht en die anders meegeport waren:

- Qonvo's `toScore` doet `Number(value)`, en `Number(null)` is `0`. Een criterium dat het model als
  `"score": null` teruggaf, kreeg dus een harde nul in plaats van uit het gemiddelde te vallen.
- Gewichten werden per criterium op twee decimalen afgerond en daarna opgeteld: drie gelijke
  criteria geven 33,33 × 3 = 99,99. Wij delen in hele honderdsten, zodat de restterm exact verdeeld
  wordt in plaats van achteraf gerepareerd.

**Aangetekend bij fase 3:** de gescoorde-criteriumvorm stond op drie plekken los gedefinieerd — de
reviewer in `packages/agents`, de jsonb-kolom in `packages/db`, en nu ook het API-antwoord. Drie
definities van één vorm is drie kansen op drift, en ze waren al gedrift. `RoleplayCriterionScore`
staat nu één keer in `@wunderstack/shared`; de andere twee zijn aliassen. Dat legde twee verschillen
uit fase 1 bloot:

- De kolomtypering had `score: number`, terwijl de reviewer `null` teruggeeft voor een criterium dat
  hij niet kon beoordelen. Zonder deze samenvoeging was "niet beoordeeld" alsnog als een nul in de
  database beland — dezelfde fout als Qonvo's `Number(null)`, één laag verderop.
- `weight` was gedocumenteerd als "auteursgewicht (1-5)" maar bevat het genormaliseerde percentage.
  Alleen met het percentage klopt de belofte dat de rij zijn eigen totaal kan verantwoorden.

### R8 — De sessie draait op een bevroren scenario, niet op de live rij

Een scenario is bewerkbare configuratie; een sessie is een verslag van wat er werkelijk gebeurd is.
Zou elke beurt de live rij lezen, dan verandert een bewerking halverwege een gesprek de persona onder
de deelnemer vandaan, en beoordeelt de reviewer straks een transcript tegen tekst die het gesprek
nooit gezien heeft. Het scenario wordt daarom één keer opgelost bij `start` en weggeschreven in
`roleplay_sessions.scenario_snapshot`; alle latere beurten en de beoordeling lezen dat snapshot.
Bestaande snapshots worden nooit herschreven (EU AI Act Art. 12).

Het snapshot heeft twee helften: `prompt` en `display`. `briefing` zit alleen in `display`. R3 hield
identiteit structureel uit het prompttype; dit doet hetzelfde met de voorbereidingstekst van de
deelnemer, want een persona die leest waar de oefening op toetst gaat naar de les toe sturen in
plaats van zijn rol te spelen. Het snapshot wordt bij teruglezen geparsed, niet gecast — een jsonb
die ongecontroleerd een prompt in rolt, is precies het object dat je wél wilt valideren.

Alleen `published` scenario's starten een sessie. Concept, gearchiveerd en niet-bestaand geven
hetzelfde `404`, zodat een beller niet kan aftasten welke slugs als concept bestaan.

### R9 — De beurt wordt geclaimd vóór de stream opengaat, en is dan uitgegeven

`claim_roleplay_turn` doet de controle en de ophoging in één UPDATE. De route roept hem aan vóór de
ReadableStream opengaat, zodat een weigering een HTTP-status is (`409`) in plaats van een `200` met
een foutevent erin. Drie uitkomsten die uit elkaar gehouden moeten worden: geen sessie (`404`),
sessie klaar of budget op (`409`), en een toegekende beurt. De eerste twee samennemen zou een vertypt
sessie-id rapporteren als "gesprek voorbij".

Een geclaimde beurt is uitgegeven, ook als de generatie daarna faalt. Teruggeven zou de race
heropenen die de atomaire claim juist dichtzet, en een gratis retry-loop is een groter probleem dan
een verloren beurt bij een provider-hik. De berichten worden wél pas ná een geslaagde generatie
weggeschreven, in één transactie: anders staat er een onbeantwoorde deelnemersbeurt in het transcript
en ziet het model de volgende keer twee deelnemersberichten achter elkaar.

Omdat de claim al opgehoogd heeft, betekent `turnsUsed === maxTurns` dat dít de laatste toegestane
beurt is. De persona krijgt dan de opdracht af te ronden in plaats van door te vragen; zonder dat
stopt een sessie die zijn plafond raakt gewoon midden in een uitwisseling.

### R10 — Geen aparte "sessie beëindigen"-route

`POST /api/roleplay/review` beëindigt een nog lopende sessie zelf en start dan de beoordeling. Een
onafgemaakt gesprek beoordelen is precies het `abandoned`-geval dat de reviewerprompt al kent, dus
een vierde route zou alleen een extra rondje zijn dat de client kan overslaan.

De opgegeven `endReason` telt alleen zolang de sessie nog actief is. Een gesprek dat de persona zelf
heeft afgesloten houdt de reden waarmee het is afgesloten — anders kan een client een voltooide
sessie als `abandoned` labelen om de beoordeling milder te maken.

Het werk loopt losgekoppeld via `after()`; de opgeslagen rij is de bron van waarheid, niet het
HTTP-antwoord. Dat is wat R4's "moet een gesloten tabblad overleven" concreet maakt, en het is de
vorm waar de outbox van fase 7 op aansluit. De client pollt tot die tijd met `GET`.

### R11 — Rollenspel heeft een eigen fondsresolver, geen agent-instance

`resolveRequestScope` kiest naast een fonds ook een agent, en faalt op het sleutelloze pad met
`no_agent_instance` als `RUNTIME_UNCONFIGURED_AGENT` niet gezet is. Rollenspel is geen grounded
instance — geen corpus, geen `agent_config`-rij, geen `AGENT_PROFILES`-entry (R1) — dus daar een
agent voor eisen zou een fonds dat alleen rollenspellen draait onbedienbaar maken.

`lib/roleplay-scope.ts` houdt wél het deel dat een echte controle is: het `fund` van de client is een
claim, geen autorisatie. Een sleutelverzoek wordt gebonden aan het fonds van zijn instance, een
sleutelloos verzoek getoetst aan de proces-allowlist. De beurt- en beoordelingsroutes accepteren
sowieso geen `fund` in de body: het sessie-id bepaalt al in welk fondsschema de sessie staat, en een
tweede claim kan daar alleen maar mee in tegenspraak raken.

### R12 — De leerling-UI praat alleen HTTP, en is al iframebaar

`apps/roleplay` is een blad, net als `apps/playground`: geen `@wunderstack/agents`, geen db/rag/ai.
De beurten gaan via `rewrites()` naar de runtime. De grensregel `no-roleplay-to-agents` is dezelfde
soort CI-afdwinging als `no-playground-to-agents`, plus db/rag/ai/analytics, omdat deze pagina in
een LMS-iframe belandt en Mastra daar niet in mag lekken.

`frame-ancestors` staat nu al op een allowlist (`ROLEPLAY_ALLOWED_ORIGINS`), default `'self'`. Geen
`X-Frame-Options: DENY`: die header kent geen allowlist, en zou fase 8 tot een blank frame maken
ook nádat de origins gezet zijn. De CSP is nonce + `strict-dynamic` zonder `'unsafe-inline'` op
scripts — dat is de mitigatie voor de token-sessie van fase 8, geen iets dat later "voor LTI soepeler
mag".

Het plan zette beurtenteller en doelstrip in `packages/ui` omdat ze props-in zijn. D16 en de regel
van drie zeggen: promoveer pas bij de derde consumer. Ze blijven dus app-lokaal. Een tweede surface
(embed-widget, LTI-chrome) is het moment om ze te tillen, niet deze.

**Aangetekend bij fase 4:** `GET /api/roleplay/review` sloeg embed-auth over. Een keyed start gevolgd
door een unkeyed poll keek in het verkeerde fondsschema en meldde `session_not_found` voor een
beoordeling die wel liep. GET deelt nu `gateRoleplayAuth`, met een eigen poll-limiet (40/60s): de
beurtlimiet van 20/60s zou een client 429'en die alleen maar wacht op een oordeel dat al betaald is.

**Aangetekend bij fase 8:** de LMS-iframe-launch landt op dezelfde pagina met `?ltiToken=`. De keeper
stript hem naar `sessionStorage`; fetches sturen `x-lti-token`. `Referrer-Policy: no-referrer` staat
op de hele leerling-app. De CSP is niet soepeler gemaakt.

## Wat dit niet is

Dit is geen tweede *fonds*-runtime. D15 (één runtime-proces = één fonds) blijft staan, net als bij
[DECISION-shared-agent-runtime.md](./DECISION-shared-agent-runtime.md): het delen van
agent-machinerie binnen één proces is iets anders dan het delen van een runtime over fondsen.

## Herzieningscriteria

- **R1** — een derde niet-grounded agenttype: dan pas kijken of `GroundedAgentKey` een algemener
  capability-model moet worden (regel van drie).
- **R2** — een fonds hergebruikt aantoonbaar dezelfde persona of rubriek over meerdere scenario's.
- **R3** — een klant eist naamsherkenning in de terugkoppeling; dat is een AVG-beslissing, geen
  technische.
- **R4** — vervalt als de beoordeling betrouwbaar binnen een request past.
- **R7** — vervalt niet. Als een toekomstig model wél betrouwbaar weegt, is dat nog steeds geen reden
  om een cijfer dat naar een LMS gaat door een taalmodel te laten uitrekenen.
