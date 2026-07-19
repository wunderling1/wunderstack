# PLAN-ui-fluency.md — UI die snel *voelt* (Wunderstack, Fase 13)

> **Vervolg op `docs/plans/PLAN-v2.md` (Fase 12 leverde de vertrouwens-UI: citations, feedback, starters,
> theming).** Deze fase raakt geen retrieval- of modelkwaliteit; ze pakt **waargenomen
> snelheid** aan. Het antwoord is inhoudelijk hetzelfde, maar de gebruiker ervaart de wachttijd
> heel anders. Doel: van "staren naar drie bolletjes" naar "je ziet het systeem werken".
> Leidend blijft: `.cursor/rules/*.mdc` (hoe) en `docs/plans/PLAN-v2.md` (context).

## Waarom dit los staat van kwaliteit
De wachttijd bestaat vandaag uit twee stille stukken: retrieval (~2,3s, straks <1s) en de
volledige LLM-call (blocking). In die hele periode ziet de gebruiker alleen drie pulserende
bolletjes — ongedifferentieerd wachten dat als *stilstand* voelt. Alle vijf de verbeteringen
delen één principe: **benoemde, zichtbare voortgang voelt als werk; een statische indicator
voelt als een hang.** We veranderen niets aan wát het antwoord is, alleen aan hoe het binnenkomt.

## Uitgangssituatie (gemeten aan de code)
- **Naad staat al.** De keten is `use-chat.ts` (NDJSON-reader) → `chatEventSchema` (contract) →
  `CaoAgent.answerStream` → `sovereign-model.doStream` → `@wunderstack/ai`. Events zijn
  gestructureerde NDJSON (`sources` → `text` deltas → `done`), niet plat.
- **De client is al klaar voor streaming**: `use-chat.ts` doet `text: m.text + event.delta` per
  delta (`apps/demo/components/chat/use-chat.ts:129`). Er komt alleen nooit meer dan één delta.
- **Optimistisch is deels al waar**: bij `send()` verschijnt de assistant-bubble meteen met
  `streaming: true` (`use-chat.ts:81`). Alleen: er is nog géén statustekst, alleen dots.
- **De echte blocker voor punt 1**: `@wunderstack/ai.generateText` is één blocking `fetch` naar
  Mistral (`packages/ai/src/models.ts:160`); `sovereign-model.doStream` faket daarom één
  `text-delta` (`packages/agents/src/model/sovereign-model.ts:122`). Zonder een echte
  `streamText`-naad kan tekst niet token-voor-token binnenkomen.
- **Statusfasen bestaan al impliciet** in `answerStream` (clarify-check → retrieval → generate,
  `packages/agents/src/cao/agent.ts:163`) maar worden niet als event uitgestuurd.

## Zo voeren we dit uit
- **Eén fase tegelijk**, in volgorde. Fase 13.1 legt de status-naad; 13.2 zet de goedkope
  client-wins erop (skeleton, status, optimistisch, progressieve bronnen); 13.3 is de enige
  backend-fase (echte token-streaming). 13.2 levert al merkbare winst *zonder* 13.3.
- **Soevereiniteit blijft hard.** Token-streaming loopt via dezelfde Mistral-EU-endpoint
  (`stream: true`), door dezelfde `@wunderstack/ai`-guard. Geen nieuwe provider, geen niet-EU-pad.
  Geen nieuwe dependency (Fase 13.1/13.2/13.3 gebruiken wat er is). Zie `000-core.mdc` ask-before-adding.
- **Alle code, namen, commits in het Engels**; user-facing statusteksten in het Nederlands
  (client-side, niet in de naad) — zie `000-core.mdc`.
- **Contract eerst, dan consument.** Elk nieuw event komt via Zod in `chatEventSchema` én
  `CaoStreamEvent`; types afgeleid, niet gedupliceerd (`300-typescript.mdc`).
- **Groen afsluiten:** elke fase eindigt met `typecheck + lint + test` groen en een commit.

---

## Fase 13.1 — Status-event door de naad  *← de enige nieuwe primitive*
**Doel:** één dun, transport-agnostisch `status`-event toevoegen dat de bestaande fasen van
`answerStream` benoemt. Dit is de ruggengraat voor punt 2 (gefaseerde status), punt 4 (skeleton
met tekst) en punt 5 (optimistische statusregel). Geen UI-verandering in deze fase.

**Ontwerp — nieuw event (minimale, gesloten set fasen):**
```ts
{ type: "status"; phase: "searching" | "retrieved" | "generating"; count?: number }
```
- `searching` — retrieval gestart.
- `retrieved` — retrieval klaar; `count` = aantal gevonden passages (`citations.length`).
- `generating` — LLM-call gestart (eerste tokens komen zo).
- De Nederlandse labels ("CAO doorzoeken…", "N passages gevonden", "Antwoord formuleren…")
  leven **client-side**, niet in de naad. De naad blijft Engels en taal-neutraal.

**Maken/wijzigen:**
- `packages/agents/src/types.ts` — `CaoStreamEvent` uitbreiden met de `status`-variant.
  De order-garantie in de doc-comment bijwerken: *"nul of meer `status`-events, dan exact één
  `sources`, dan nul of meer `text`, dan exact één `done`."*
- `packages/agents/src/cao/agent.ts` (`answerStream`) — status-events yielden op de bestaande
  faseovergangen:
  - vóór `retrieveTraced`: `{ type: "status", phase: "searching" }`;
  - ná retrieval met hits: `{ type: "status", phase: "retrieved", count: retrieval.citations.length }`,
    dan het bestaande `sources`-event, dan `{ type: "status", phase: "generating" }` vlak vóór
    `registered.stream(...)`;
  - clarify-pad en niet-gevonden-pad: g. status weglaten (die keren snel terug; een flits
    "doorzoeken" op het clarify-pad zou misleiden). Bewust laten zoals nu.
- `apps/demo/app/api/chat/contract.ts` — `chatEventSchema` de `status`-variant in de
  discriminated union geven (identiek Zod-schema, één bron van waarheid).
- Route (`apps/demo/app/api/chat/route.ts`) — geen wijziging nodig: die forwardt elk agent-event
  ongewijzigd (`line(event)`), dus het nieuwe event rolt automatisch mee.

**DoD:** `answerStream` zendt op de normale flow `searching → retrieved(count) → sources →
generating → text… → done`; `chatEventSchema` valideert het; bestaande tests groen; een unit-test
dekt de event-volgorde en dat clarify/not-found géén status krijgen.

---

## Fase 13.2 — Client: skeleton, gefaseerde status, progressieve bronnen, optimistisch
**Doel:** punten **2, 3, 4, 5** in één client-fase, want ze delen dezelfde render-logica in de
assistant-bubble en hebben na 13.1 geen backend meer nodig. Dit is de grootste
perceived-speed-winst per euro.

### Punt 5 — Optimistische statusregel (<100ms)
De bubble verschijnt al meteen; we seeden nu ook meteen een **lokale beginfase** zodat er nooit
een leeg/dots-only moment is vóór het eerste server-event.
- `apps/demo/components/chat/use-chat.ts` — bij het aanmaken van de assistant-bubble een
  clientveld `phase: "searching"` zetten (nieuw veld op `ChatMessage`). Zo staat "CAO
  doorzoeken…" er <100ms na verzenden, niet pas bij de eerste response.

### Punt 2 — Gefaseerde status i.p.v. dots
- `use-chat.ts` — `event.type === "status"` afhandelen: `phase` (+ `count`) op de bubble patchen.
- `apps/demo/components/chat/message-list.tsx` — de status als leesbare regel tonen zolang er
  nog geen tekst is. Mapping (Nederlands, user-facing):
  - `searching` → "CAO doorzoeken…"
  - `retrieved` → `${count} passage(s) gevonden`
  - `generating` → "Antwoord formuleren…"
- **Toegankelijkheid:** de statusregel in een `aria-live="polite"` container zodat screenreaders
  de voortgang aankondigen.

### Punt 4 — Skeleton i.p.v. drie bolletjes
- `apps/demo/components/chat/message-list.tsx` — de `showCaret` drie-bolletjes-tak
  (`message-list.tsx:44-49`) vervangen door een **shimmer-skeleton**: 2–3 tekstregels met
  wisselende breedte + Tailwind `animate-pulse` (shadcn `Skeleton`-patroon), mét de statusregel
  erboven. Conditie blijft `message.streaming && message.text.length === 0`.
- Zodra de eerste `text`-delta binnen is, verdwijnt de skeleton en neemt de gestreamde/volledige
  tekst het over (bestaande `Markdown`-tak).

### Punt 3 — Bronnen progressief + kandidaat-markering
Volgorde in de bubble wordt: **statusregel → bronnen schuiven in bij `retrieved`/`sources` →
antwoord erboven**. De kanttekening (bronnen die een "niet gevonden" ontkrachten) dekken we af:
- Op het **niet-gevonden-pad** zijn `citations` al leeg (agent yield lege sources,
  `agent.ts:184`), dús daar verschijnt sowieso geen bronnenblok — dat risico bestaat feitelijk
  niet in de huidige flow.
- Voor de **kandidaat-fase** (bronnen binnen, maar antwoord nog niet begonnen): render het
  bronnenblok tot de eerste `text`-delta als **"Mogelijke bronnen"** met gedempte/gestippelde
  styling; promoveer naar de definitieve "Bronnen"-kop zodra `text.length > 0 && found === true`.
- `apps/demo/components/chat/citation.tsx` — `Citations` een `candidate?: boolean`-prop geven die
  kop-tekst + styling wisselt. `message-list.tsx` geeft `candidate={message.text.length === 0}` door.

**Cross-cutting (client-robuustheid):**
- **Markdown-herparse per delta**: `Markdown` draait `ReactMarkdown` over de héle groeiende string
  bij elke delta (`markdown.tsx:58`). Na 13.3 wordt dat tientallen keren per antwoord. Throttle de
  re-render (bijv. `requestAnimationFrame`/coalescing van deltas in `use-chat.ts`, of memoize de
  bubble) zodat snelle deltas de UI niet laten stotteren.
- **Autoscroll**: `Chat.tsx:33` scrollt smooth bij élke `messages`-mutatie. Bij vloeiende deltas
  vecht dat met de lezer. Alleen auto-scrollen als de gebruiker al bij de bodem staat
  (near-bottom check); anders niet meescrollen.

**Maken/wijzigen (samengevat):** `use-chat.ts` (nieuw `phase`-veld + status-handler +
delta-coalescing), `message-list.tsx` (skeleton + statusregel + candidate-doorgifte),
`citation.tsx` (candidate-prop), `chat.tsx` (near-bottom autoscroll).

**DoD:** binnen 100ms na verzenden staat "CAO doorzoeken…"; de statusregel loopt zichtbaar door de
fasen; het wachtvak toont een shimmer-skeleton i.p.v. bolletjes; bronnen verschijnen als
"Mogelijke bronnen" en promoveren naar "Bronnen" bij het eerste antwoordtoken; niet-gevonden toont
geen bronnen; screenreader kondigt de fasen aan. Werkt identiek in demo én widget (zelfde `Chat`).

---

## Fase 13.3 — Echte token-streaming (het grootste effect)  *← enige backend-fase*
**Doel:** punt **1**. Tekst die verschijnt terwijl je kijkt voelt 2–3× sneller. Dit vervangt de
enkele grote delta door echte token-voor-token-stream, via dezelfde soevereine Mistral-endpoint.

**Maken/wijzigen:**
- `packages/ai/src/models.ts` — een `streamText`-functie naast `generateText`: POST naar dezelfde
  `MISTRAL_CHAT_URL` met `stream: true`, de SSE-`data:`-lijnen parsen tot `delta`-tekststukjes,
  en aan het eind `finishReason` + `usage` teruggeven (Mistral stuurt usage in de laatste chunk).
  Zod op elke geparste chunk (`300-typescript.mdc`). Zelfde model-registry/guard, zelfde
  `DEFAULT_MAX_OUTPUT_TOKENS`, zelfde `abortSignal`. **Blijft Mistral/EU — geen soevereiniteits-
  wijziging.** Verifieer vóór bouw de actuele Mistral streaming-API-vorm (web search, `100-stack.mdc`).
- `packages/agents/src/model/sovereign-model.ts` (`doStream`) — de gefakete één-delta
  (`sovereign-model.ts:122-137`) vervangen door consumptie van `streamText`: per tekststukje een
  `{ type: "text-delta", ... }` enqueuen, afsluiten met de echte `finish`(usage/finishReason).
  `doGenerate` blijft ongewijzigd (`generateText`).
- `packages/agents/src/cao/agent.ts` — **geen wijziging nodig**: `answerStream` leest al
  `output.textStream` in een reader-loop en yield't per stuk (`agent.ts:205-218`). Zodra `doStream`
  echt streamt, stromen de deltas vanzelf door de hele keten tot de client.
- Evals/tracing: usage moet blijven kloppen (uit de laatste stream-chunk), zodat Langfuse-kosten
  onveranderd correct zijn (`500-agents.mdc` observability). Controleer dat de trace-span nog sluit.

**DoD:** een normaal CAO-antwoord komt token-voor-token binnen in de bubble; usage/kosten in
Langfuse blijven kloppen; abort (client-disconnect) stopt de Mistral-stream; het default-pad is nog
steeds Mistral-EU; `typecheck + lint + test` groen. Na deze fase levert de skeleton uit 13.2 na de
eerste tokens direct stromende tekst op — het beoogde "2–3× sneller"-gevoel.

---

## Volgorde & afhankelijkheden
1. **13.1** (naad) — enabler, geen zichtbaar effect alleen.
2. **13.2** (client) — levert 4 van de 5 punten en de meeste gevoelde winst, ook zónder 13.3.
3. **13.3** (streaming) — grootste losse effect; benut de skeleton/status uit 13.2 optimaal.

13.2 en 13.3 zijn onafhankelijk te bouwen na 13.1; 13.2 eerst omdat het goedkoper is en 13.3
er direct beter door oogt.

## Bewust NIET in deze fase (vraag eerst)
- Geen SSE-migratie: NDJSON blijft (naad is genoeg, geen systeem — `000-core.mdc`).
- Geen AI-SDK `useChat`/client-library erbij; de eigen `use-chat.ts` volstaat.
- Geen queueing van een tweede vraag tijdens streamen (composer blijft locked); apart voorstel als
  het nodig blijkt.
- Geen nieuwe dependency, provider of architectuurlaag.
