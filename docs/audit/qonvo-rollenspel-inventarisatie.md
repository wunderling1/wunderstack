# Inventarisatie rollenspelimplementatie in Qonvo

Datum: 25 augustus 2026 · Read-only onderzoek, geen code gewijzigd in beide repo's.
Qonvo-repo: `/Users/jordylissenburg/qonvo` · Wunderstack-repo: `/Users/jordylissenburg/wunderstack`.

Elke uitspraak hieronder draagt bestandspad + regelnummer. Waar bewijs ontbreekt staat dat
expliciet, met de plek waar gezocht is. Aannames zijn gemarkeerd met `(aanname)`.

---

## Oordeel in één regel

Fase 1 is een **PORT met refit**, omdat de aanroepbare grens al bestaat als één functie
(`processMessage`, `src/lib/chat/process-message.ts:84-254`), de prompts al in code staan
(`src/lib/mastra/prompts.ts:24-365`) en de motor al op Mastra + Mistral + Langfuse draait
(`src/lib/mastra/instance.ts:79-101`, `src/lib/mastra/provider.ts:32-45`) — niet meer op n8n; het
werk zit niet in herbouw maar in het losknippen van Supabase-persistentie
(`process-message.ts:106-286`) en het inpassen in een Wunderstack-agentruntime die vandaag
retrieval verplicht stelt (`packages/agents/src/runtime/profile.ts:28`) en geen gesprekstoestand
kent (`packages/db/src/schema/fund/index.ts:1-7`).

Belangrijkste correctie op de aanname onder het bestaande implementatieplan: **de
rollenspellogica is geen n8n-orkestratie meer.** De n8n-webhookclient bestaat nog
(`src/lib/n8n/client.ts:208-341`), maar de router draait standaard op Mastra —
`getAiBackendModeWithDefault("mastra")` in `src/lib/ai-backend/route-ai-call.ts:46` en `:117`,
default gedocumenteerd in `src/lib/ai-backend/config.ts:9-10`. De naam `n8n` leeft alleen nog
voort in bestands- en typenamen (`src/types/n8n.ts:1`, `src/lib/n8n/client.ts:65`).

---

## V1 — Waar zit de gespreksafhandeling?

### De grens bestaat, in één module

```84:88:/Users/jordylissenburg/qonvo/src/lib/chat/process-message.ts
export async function processMessage({
  conversationId,
  message,
  conversation,
}: ProcessMessageInput): Promise<ProcessMessageResult> {
```

- Input-contract: `ProcessMessageInput` = `{ conversationId: string; message: string; conversation: ConversationWithTemplate }` — `src/lib/chat/process-message.ts:55-59`.
- Output-contract: `ProcessMessageResult` = `{ assistantMessage: string; conversationEnd: boolean; turnsUsed: number; turnsRemaining: number }` — `src/lib/chat/process-message.ts:61-66`.
- Dit is letterlijk "geef de volgende beurt, gegeven sessie + input". De sessie komt als
  volledig geladen rij binnen (`conversation`), niet als id die de functie zelf ophaalt.

### Eén module of verspreid?

Eén module. De route-handlers zijn dun en doen alleen auth, guards en doorgeven:

- `src/app/api/roleplay/chat/route.ts:66-70` roept `processMessage` aan; de hele handler is 80 regels waarvan 42 auth/guards (`:10-63`).
- `src/app/api/embed/chat/route.ts:75-79` roept dezelfde functie aan met token-auth in plaats van cookie-auth.
- `src/app/api/roleplay/review/route.ts:3-14` is een 501-stub; de echte reviewroute is `src/app/api/conversations/review/route.ts`.

De **openingsbeurt** zit níet in `processMessage` maar inline in de start-route:
`src/app/api/conversations/start/route.ts:304-311` (`responseType: "start"`), met fallbacktekst
`"Hallo!"` op `:283` en `:318-320`. Dat is het enige stuk gespreksafhandeling dat wél in een
route-handler woont.

De **voice-tegenhanger** is een aparte, bewust 1-op-1 gespiegelde orkestrator:
`src/lib/voice/turn-orchestrator.ts:163-438` (spiegeling benoemd in
`src/lib/chat/process-message.ts:5-7`). Fase 1 is tekst-only, dus die blijft staan.

### Omvang van de kern, los van transport en persistentie

`process-message.ts` telt 293 regels totaal. Uitgesplitst:

| Blok | Regels | Aard |
|---|---|---|
| Doc-comment | 1-32 | uitleg |
| Types + `TurnFailedError` | 34-82 | contract |
| Pre-flight max_turns | 97-99 | **kernlogica** |
| Turn-increment (RPC) | 106-116 | persistentie |
| User-message insert | 120-136 | persistentie |
| Payload bouwen + LLM-call | 139-174 | **kernlogica** |
| AI-meta wegschrijven | 176 | persistentie |
| Assistant-message insert | 181-196 | persistentie |
| Einde-bepaling + statusflip + review-trigger | 198-235 | **kernlogica** + persistentie |
| Rollback-helpers | 262-293 | persistentie |

De echte beurtlogica — pre-flight, payload, closing-turn-vlag, einde-bepaling — beslaat
ruwweg **40 regels** (`:97-99`, `:139-174`, `:198-199`, `:215`). De rest is Supabase-I/O en
rollback. Dat is het getal dat telt voor de port: de motor is klein, de vergroeiing met de
database is het werk.

Ondersteunende kernmodules die meegaan (regelaantallen via `wc -l`):

| Module | Regels | Rol |
|---|---|---|
| `src/lib/mastra/prompts.ts` | 365 | alle systeem- en user-prompts |
| `src/lib/mastra/schemas.ts` | 192 | Zod-schema's + review-normalisatie |
| `src/lib/mastra/agents/conversation-agent.ts` | 120 | rollenspeler-call |
| `src/lib/mastra/agents/review-agent.ts` | 104 | beoordelaar-call |
| `src/lib/mastra/history.ts` | 102 | historie laden + formatteren |
| `src/lib/mastra/instance.ts` | 179 | Mastra-root + Langfuse |
| `src/lib/didactic/build-context.ts` | 261 | leergeschiedenis → promptstrings |
| `src/lib/rubric/resolve.ts` | 122 | rubric + gewichten normaliseren |

### Roept de motor zelf HTTP/SSE/streaming aan?

Nee, en dat is gunstig.

- `processMessage` bevat geen `fetch`, geen `Response`, geen stream. De LLM-call gaat via
  `routeConversationCall` (`src/lib/chat/process-message.ts:161-168`), die op het Mastra-pad
  `agent.generate(...)` aanroept (`src/lib/mastra/agents/conversation-agent.ts:73-86`).
- De tekstflow is **niet streaming**: één JSON-response per beurt.
  Bewijs: `NextResponse.json(result)` in `src/app/api/roleplay/chat/route.ts:72` en
  `src/app/api/embed/chat/route.ts:81`; de motor retourneert een compleet object
  (`process-message.ts:237-242`); de client doet `await res.json()`
  (`src/hooks/use-conversation.ts:166`). Geen `ReadableStream` of `text/event-stream` in het
  tekstpad (gezocht in `src/`; streaming bestaat alleen in voice/TTS, bv.
  `src/lib/voice/mistral-tts.ts:163`).
- Wel HTTP binnen de motorketen: de n8n-fallbackclient doet zelf `fetch`
  (`src/lib/n8n/client.ts:247`, `:314`). Op het default Mastra-pad wordt die niet geraakt
  (`src/lib/ai-backend/route-ai-call.ts:122-128`).

**Conclusie V1:** de grens bestaat. Fase 1 is een verplaatsing, geen ontvlechting van transport.

---

## V2 — Waar raakt de motor de Qonvo-datamodellen?

### Tabellen die de motor daadwerkelijk raakt

| Tabel | Operatie + kolommen | Pad:regel | Motor of platform |
|---|---|---|---|
| `conversations` | UPDATE `status`, `completed_at`, `end_reason` | `src/lib/chat/process-message.ts:207-218` | **motor** |
| `conversations` | UPDATE `status` → `reviewed` | `src/lib/chat/process-review.ts:155-158`, `:253-255` | **motor** |
| `conversations` | SELECT `*` + join templates/rubric | `src/lib/chat/trigger-review.ts:138-142`, `src/app/api/roleplay/chat/route.ts:34-37` | **motor** |
| `conversations` | SELECT `model_version`, `n8n_workflow_id`, `n8n_workflow_version`; UPDATE idem | `src/lib/n8n/session-audit.ts:36-38`, `:59-61` | **motor** (AI Act Art. 12) |
| `conversations` | SELECT `difficulty` + nested `reviews` | `src/lib/didactic/build-context.ts:34-42` | grensgeval — motor leest platform-historie |
| `messages` | INSERT `conversation_id`, `role`, `content` | `src/lib/chat/process-message.ts:121-127`, `:182-188` | **motor** |
| `messages` | SELECT `role`, `content`, `created_at` | `src/lib/mastra/history.ts:31-34` | **motor** |
| `messages` | DELETE (rollback) | `src/lib/chat/process-message.ts:272-274` | **motor** |
| `reviews` | INSERT/UPSERT `conversation_id`, `feedback`, `feedback_summary`, `is_passed`, `scores` | `src/lib/chat/process-review.ts:143-152`, `:242-251` | **motor** |
| `reviews` | SELECT idem | `src/lib/chat/trigger-review.ts:68-70`, `:119-121` | **motor** |
| `conversation_templates` | SELECT `*` (join) | `src/lib/chat/trigger-review.ts:138-142` | **motor-configuratie** |
| `rubric_templates` | SELECT `review_prompt`, `criteria`, `pass_threshold` | `src/lib/chat/trigger-review.ts:140` | **motor-configuratie** |
| `difficulty_templates` | SELECT `*` (cached) | `src/lib/supabase/cached-queries.ts:8-10` | **motor-configuratie** |
| `review_locks` | via RPC | `src/lib/chat/trigger-review.ts:87-90`, `:216-218` | **motor** |
| `organizations` | SELECT `plan_id` + `subscription_plans(monthly_credits)` | `src/lib/chat/process-review.ts:257-260` | **platform** |
| `credit_transactions` | INSERT `organization_id`, `conversation_id`, `amount`, `type`, `description` | `src/lib/chat/process-review.ts:271-277` | **platform** |
| `users` | SELECT `id`, `organization_id`, `role`, `full_name` | `src/app/api/conversations/start/route.ts:38-41` | **platform** |
| `learning_paths` | SELECT `id` | `src/app/api/conversations/start/route.ts:73-78` | **platform** |
| `embed_configs` | SELECT token/org/domains | `src/app/api/embed/chat/route.ts:15-19` | **platform** |
| `embed_sessions` | INSERT deelnemergegevens | `src/app/api/embed/start/route.ts:142-150` | **platform** |
| `lti11_launches` / `lti11_grade_links` / `lti11_consumers` | SELECT/INSERT/UPDATE | `src/app/api/conversations/start/route.ts:100-104`, `:265-271`; `src/lib/lti11/outcomes.ts:178-181`, `:257-261`, `:274-276` | **platform** |

Kolomdefinities: `conversations` is gegroeid van `supabase/migrations/008_conversations.sql:1-11`
tot 31 kolommen, canoniek in `src/types/database.ts:583-615`. `messages`:
`supabase/migrations/009_messages.sql:1-7`, Row op `src/types/database.ts:711-721`. `reviews`:
`supabase/migrations/010_reviews.sql:1-8`, Row op `src/types/database.ts:755-763`.

**Scheidslijn.** De motorkern raakt vier tabellen: `conversations`, `messages`, `reviews`,
`review_locks` — plus de drie configuratietabellen. Alles wat over credits, LTI, embed-sessies,
leerpaden en gebruikers gaat, zit in `process-review.ts:257-297` en in de route-handlers, niet in
`processMessage`. Die scheiding is al vrij schoon; de vergroeiing zit in de *manier* waarop
(directe Supabase-calls door de hele motor heen), niet in de *hoeveelheid* platformtabellen.

### Identiteitsdata in het pad van de motor

Dit is de scherpste bevinding van dit onderzoek: **er gaat geen persoonsherleidbare data naar
het model.**

Wat wordt gelezen maar niet doorgegeven:

| Veld | Gelezen op | Belandt in prompt/payload? |
|---|---|---|
| `users.full_name` | `src/app/api/conversations/start/route.ts:39` | Nee — geselecteerd, nergens verder gebruikt |
| `users.email` | — | Niet gelezen in het motorpad |
| `users.role`, `users.organization_id` | `src/app/api/conversations/start/route.ts:39` | Nee |
| `conversations.user_id` | `src/lib/chat/process-message.ts:141`, `src/lib/didactic/build-context.ts:38` | Nee — alleen als filterkey |
| `conversations.organization_id` | `src/lib/chat/process-review.ts:259`, `:272`, `:279` | Nee |
| `embed_sessions.participant_name` / `participant_email` / `ip_address` | geschreven op `src/app/api/embed/start/route.ts:145-149` | Nee — nergens teruggelezen in chat/review |

Wat wél in de payload zit (`buildN8nPayload`, `src/lib/n8n/client.ts:101-136`):

- `sessionID` = `conversations.id`, een UUID zonder persoonsbetekenis —
  `src/lib/chat/process-message.ts:163`, `src/types/n8n.ts:2`.
- `userTitle` / `userRole` = de **rolnaam** uit `conversation_templates.user_role`, niet de
  persoon — `src/lib/n8n/client.ts:106-107`, gebruikt in `src/lib/mastra/prompts.ts:116`.
- De berichtinhoud zelf (`message`) en de volledige historie —
  `src/lib/mastra/history.ts:31-34`, `:68-80`; review-transcript op
  `src/lib/mastra/agents/review-agent.ts:38-47`.
- Didactische context: uitsluitend geaggregeerde strings die spreken over "de gebruiker" —
  `src/lib/didactic/build-context.ts:167-168`, `:212`. Geen naam, geen e-mail, geen ruwe id.
- De persona kan een **fictieve** rolnaam bevatten (`src/lib/library/resolve-persona.ts:51-52`).

Ook de tracing is bewust gepseudonimiseerd:

```128:136:/Users/jordylissenburg/qonvo/src/lib/mastra/instance.ts
 * - `metadata.sessionId` → Langfuse `session.id`: groepeert alle turns + de
 *   beoordeling van één gesprek onder één sessie. We gebruiken bewust
 *   `conversationId` en GEEN persoonlijke identifier als `userId` — dat houdt
 *   Qonvo aan de "limited risk"-kant van de EU AI Act (geen onnodige
 *   persoonsgegevens in observability).
```

**Gevolg:** er is **geen airlock nodig vóór de port** voor identiteitsdata. Het enige
persoonsgegeven dat de grens raakt is de vrije tekst die de deelnemer zelf typt — precies zoals
in Wunderstack, waar `interaction_events.question` met 90 dagen retentie hetzelfde probleem heeft
(`packages/db/src/schema/fund/interaction-events.ts:34-35`). Restrisico dat je apart moet wegen:
de deelnemer kan zichzelf noemen in een beurt, en die beurt gaat naar het model en naar Langfuse.

### Tenancy

- De tenancy-kolom is **`organization_id`**. Er is **geen** `white_label_id` — gezocht in de hele
  repo op `white_label` / `whitelabel`; de enige treffers zijn een abonnementsfeature
  (`supabase/migrations/018_subscription_plans.sql:28`) en UI-teksten.
- Resolutie bij cookie-auth: `users.organization_id` uit het profiel, daarna als filter op het
  template — `src/app/api/conversations/start/route.ts:39` en `:143`; weggeschreven op de
  conversation op `:231`.
- Resolutie bij embed (token-auth): uit `embed_configs.organization_id` —
  `src/app/api/embed/start/route.ts:53-59`, `:119`; gecontroleerd per beurt op
  `src/app/api/embed/chat/route.ts:70-71`.
- Bij embed is `user_id` bewust `null` — `src/app/api/embed/start/route.ts:117`.
- RLS bestaat voor authenticated clients (`supabase/migrations/014_rls_policies.sql:90-146`,
  helper `013_functions.sql:1-4`), maar **de motor omzeilt RLS**: alles loopt via `adminClient`
  (service role), bv. `src/lib/chat/process-message.ts:34` en `:106`. Isolatie steunt dus op
  applicatiechecks, niet op de database.

---

## V3 — Waar zitten de prompts?

**Alle prompts staan in code, niet in de database.** Dit is de tweede grote correctie op het
implementatieplan: PR-2 wordt geen reverse-engineering van DB-rijen.

| Prompt | Pad:regel |
|---|---|
| Systeemprompt rollenspeler | `src/lib/mastra/prompts.ts:24-107` (`buildConversationSystemPrompt`) |
| User-message rollenspeler | `src/lib/mastra/prompts.ts:113-117` — letterlijk `` `${userTitle}: "${message}"` `` |
| Systeemprompt openingsbeurt | `src/lib/mastra/prompts.ts:125-185` (`buildStartSystemPrompt`) |
| User-message openingsbeurt | `src/lib/mastra/prompts.ts:191-195` |
| Voice-outputinstructies | `src/lib/mastra/prompts.ts:7-18` (constante) |
| Vaste beoordelaarsinstructies | `src/lib/mastra/prompts.ts:202-265` (`REVIEW_FIXED_INSTRUCTIONS`) |
| Systeemprompt beoordelaar | `src/lib/mastra/prompts.ts:272-291` |
| User-message beoordelaar (criteria + transcript) | `src/lib/mastra/prompts.ts:303-365` |
| Basisinstructies per Mastra-agent | `src/lib/mastra/instance.ts:84`, `:90`, `:96-97` |

Configureerbare fragmenten die wél uit de DB komen, als *invulling* van deze codesjablonen:

- `rubric_templates.review_prompt` → `payload.reviewPrompt` → `prompts.ts:281`.
- `difficulty_templates.conversation_prompt` / `.review_prompt` → `src/lib/n8n/client.ts:26-34`,
  ingevoegd op `prompts.ts:100-102` en `:283`.
- De persona-, situatie-, leerdoel- en instructieteksten uit de bibliotheek (zie hieronder).

### Het feitelijke scenarioschema — welke velden worden gesubstitueerd

Dit is het schema dat telt. `N8nBasePayload` (`src/types/n8n.ts:1-42`), gevuld door
`buildN8nPayload` (`src/lib/n8n/client.ts:101-136`), letterlijk:

| Payloadveld | Bron (pad:regel) | Gebruikt in prompt op |
|---|---|---|
| `sessionID` | `conversations.id` — `process-message.ts:163` | tracing, niet in tekst |
| `difficultyLevel` | `conversations.difficulty` — `client.ts:103` | tracing (`conversation-agent.ts:83`) |
| `maxTurns` | `conversation_templates.max_turns` — `client.ts:104` | indirect via `isClosingTurn` |
| `userTitle` | `conversation_templates.user_role` — `client.ts:106` | `prompts.ts:116` |
| `userRole` | `` `een ${user_role.toLowerCase()}` `` — `client.ts:107` | `prompts.ts:89` |
| `partnerRole` | `conversation_templates.partner_role` — `client.ts:108` | `prompts.ts:84`, `:89`, `:157`, `:194`, `:352` |
| `openingLine` | `conversation_templates.start_message` — `client.ts:109` | `prompts.ts:168` |
| `endCondition` | `conversation_templates.end_condition` — `client.ts:110` | `prompts.ts:75` |
| `instructions` | `instructions_library.content.instructions_text` — `client.ts:92`, `:111` | `prompts.ts:77` |
| `persona` | `persona_library.content.persona_prompt` — `client.ts:89`, `:112` | `prompts.ts:99`, `:177` |
| `contextDescription_conversation` | `situation_library.content.context_conversation` — `client.ts:90`, `:113` | `prompts.ts:90-92`, `:159-161` |
| `hiddenInformation` | `situation_library.content.hidden_information` — `client.ts:91`, `:114` | `prompts.ts:45-47`, `:140-142`, `:344-346` |
| `learningObjective` | `learning_objective_library.content.learning_objective` — `client.ts:94`, `:117` | `prompts.ts:49-53`, `:144-146`, `:332-338` |
| `secondaryObjective` | idem `.secondary_objective` — `client.ts:95`, `:118` | `prompts.ts:51`, `:335` |
| `behavioralIndicators` | idem `.behavioral_indicators` (lijst → string) — `client.ts:96-98`, `:119` | via rubriccriteria, `prompts.ts:318` |
| `commonPitfalls` | idem `.common_pitfalls` — `client.ts:99`, `:120` | `prompts.ts:55-57`, `:340-342` |
| `reviewCriteria[]` | `resolveRubric(template)` — `client.ts:121-126` | `prompts.ts:309-325` |
| `reviewPrompt` | rubric-override of `rubric_templates.review_prompt` — `client.ts:127` | `prompts.ts:281` |
| `passThreshold` | override of `rubric_templates.pass_threshold` — `client.ts:128` | `prompts.ts:327-330` |
| `conversationDifficultyPrompt` | `difficulty_templates` — `client.ts:130` | `prompts.ts:100-102` |
| `reviewDifficultyPrompt` | idem — `client.ts:131` | `prompts.ts:283` |
| `previousResults` | didactiek — `client.ts:133` | `prompts.ts:61` |
| `didacticGuidance` | didactiek — `client.ts:134` | `prompts.ts:59-62`, `:148-150` |
| `reviewDidacticContext` | didactiek — `client.ts:135` | `prompts.ts:348-350` |
| `message` | de beurt van de deelnemer | `prompts.ts:116` |
| `responseType` | `"conversation" \| "start" \| "review"` — `src/types/n8n.ts:68`, `:88` | kiest de promptbouwer |
| `isClosingTurn` | `newTurnsUsed >= max_turns` — `process-message.ts:157` | `prompts.ts:65-67` |
| `modality` | `conversations.modality` — `process-message.ts:167` | `prompts.ts:86`, `:154` |
| `endReason` | `conversations.end_reason` — `process-review.ts:224` | `prompts.ts:273-278` |

Elk van deze velden heeft een gedefinieerd bibliotheekcontract in `src/types/library.ts`:
`PersonaContent` (`:71-74`), `SituationContent` (`:82-94`), `BriefingContent` (`:107-112`),
`LearningObjectiveContent` (`:121-128`), `InstructionsContent` (`:143-146`).

Let op één uitzondering: **briefing gaat bewust níet naar het model** — het is leerling-facing
UI-context. `src/lib/n8n/client.ts:115-116`.

### Versionering

Ja, op drie niveaus, en je kunt per sessie terugzien wat er gebruikt is:

1. **Promptversie.** `MASTRA_WORKFLOW_VERSION = "2026-06-26-dutch-grammar"` —
   `src/lib/mastra/version.ts:13`, met de instructie "bump bij prompt-/schema-wijzigingen" op
   `:9`. Per response meegegeven via `getMastraResponseMeta` (`:33-39`) en weggeschreven naar
   `conversations.model_version` / `n8n_workflow_id` / `n8n_workflow_version` door
   `src/lib/n8n/session-audit.ts:29-61` (eerste-keer-wint). Grondslag: EU AI Act Art. 12,
   benoemd op `src/lib/mastra/version.ts:30`.
2. **Contentversie.** Bij gespreksstart worden alle bouwstenen bevroren als snapshot op de
   conversation: `persona_snapshot`, `situation_snapshot`, `briefing_snapshot`,
   `learning_objective_snapshot`, `instructions_snapshot` —
   `src/app/api/conversations/start/route.ts:169-176`, `:238-242`. Vanaf dat moment wint de
   snapshot boven de bibliotheeklink: `src/lib/n8n/client.ts:139-147`. Motivatie letterlijk
   "AI-Act reproducibility" op `:41-42`.
3. **Templateversie.** `template_version`, `rubric_template_id`, `rubric_version` op de
   conversation — `src/app/api/conversations/start/route.ts:235-237`.

Dat betekent: voor een gegeven sessie is exact reconstrueerbaar welke promptversie, welk model en
welke scenario-inhoud gebruikt zijn. Dat is precies de gouden-set-eigenschap die je bij een
herbouw kwijt zou raken.

---

## V4 — Hoe wordt de beoordelaar aangeroepen?

### Aanroep: achtergrondjob achter een DB-lock, vanuit vier plekken

De aanroepketen is `triggerReview` → `processReview` → `routeReviewCall` → `runReviewWithMastra`.

- `src/lib/chat/process-message.ts:229-234` — fire-and-forget zodra de beurt het gesprek beëindigt.
- `src/lib/chat/end-conversation.ts:102-104` — als de deelnemer op "Beëindig" klikt.
- `src/app/api/conversations/review/route.ts:44` — expliciet door de client.
- `src/lib/voice/server/ws-handler.ts` via `finalizeAbandonedSession` — benoemd in
  `src/lib/chat/trigger-review.ts:8-9`.

De eigenlijke start als achtergrondjob:

```200:204:/Users/jordylissenburg/qonvo/src/lib/chat/trigger-review.ts
    processReview(conversation)
      .catch((err) => console.error("Background review failed:", err))
      .finally(() => {
        void releaseLock(conversationId);
      });
```

Idempotentie via een persistente lock (`review_locks`, `supabase/migrations/060_review_locks.sql:32-36`,
RPC's op `:44-67` en `:69-78`), aangeroepen op `src/lib/chat/trigger-review.ts:87-90` en `:216-218`.
De uiteindelijke Mastra-call: `src/lib/chat/process-review.ts:216-225` → `routeReviewCall`
(`src/lib/ai-backend/route-ai-call.ts:42-50`) → `src/lib/mastra/agents/review-agent.ts:54-67`.

### Krijgt hij het transcript of loopt hij mee in de historie?

Hij krijgt het **volledige transcript als losse JSON-blob**, niet de gesprekshistorie van de
rollenspeler:

```30:41:/Users/jordylissenburg/qonvo/src/lib/mastra/agents/review-agent.ts
    // `windowSize: "all"` — een beoordeling moet het VOLLEDIGE transcript zien,
    // niet het 30-berichten-venster van de conversatie-turn. Anders valt bij
    // lange gesprekken (> 30 berichten) de opening uit de beoordeling.
    const history = await loadConversationHistory(conversationId, {
      windowSize: "all",
    });

    // Transcript in JSON-formaat — spiegelt JSON.stringify(Get Chat Memory.messages) in n8n.
    const transcriptJson = formatTranscriptForReview(
      history,
      payload.userTitle,
    );
```

Formaat `[{"type":"human","content":"..."},{"type":"ai","content":"..."}]` —
`src/lib/mastra/history.ts:88-102`. Geplaatst in de user-message op
`src/lib/mastra/prompts.ts:352`. De rollenspeler zelf gebruikt een venster van 30 berichten
(`src/lib/mastra/history.ts:4`, `:55-58`).

### Vorm van de output: allebei — gestructureerde scores én vrije tekst

Zod-contract:

```32:37:/Users/jordylissenburg/qonvo/src/lib/mastra/schemas.ts
export const reviewResponseSchema = z.object({
  feedback: z.array(reviewFeedbackItemSchema),
  feedbackSummary: z.string(),
  isPassed: z.boolean(),
  scores: z.array(reviewScoreItemSchema).optional(),
});
```

Met `reviewFeedbackItemSchema` = `{ question, answer, score? }` (`:21-25`) en
`reviewScoreItemSchema` = `{ criterion, score }` (`:27-30`). Het letterlijke outputformaat staat
ook in de prompt op `src/lib/mastra/prompts.ts:259-260`.

Parse- en reparatielogica:

- `normalizeReviewResponse` (`src/lib/mastra/schemas.ts:71-174`) dwingt de criteriumvolgorde af,
  matcht antwoorden eerst op index en dan op vraagtekst, en clampt scores (`toScore`, `:54-58`).
- `assertReviewContract` (`:176-192`) gooit als het aantal of de volgorde niet klopt.
- De **gewogen eindscore wordt in TypeScript herberekend**, niet van het model overgenomen:
  `calculateWeightedScore` (`src/lib/chat/process-review.ts:83-97`) met gewichten uit
  `resolveRubric`; `isPassed` wordt overschreven op `:236-239`. Het model mag de score voorstellen,
  de code beslist.
- `feedbackSummary` is een markdownstring met drie voorgeschreven secties —
  `src/lib/mastra/prompts.ts:245-256`.

### Draait de beoordelaar op hetzelfde model?

Apart configureerbaar, met dezelfde default:

- Rollenspeler: `MISTRAL_LLM_MODEL`, default `mistral-small-2603` — `src/lib/mastra/provider.ts:11-13`.
- Beoordelaar: `MISTRAL_REVIEW_MODEL`, default `mistral-small-2603` — `:20-22`, met de expliciete
  opmerking dat `MISTRAL_LLM_MODEL` hier bewust niet doorcascadeert (`:17-18`).
- Openingsbeurt: `MISTRAL_START_MODEL`, default `mistral-small-2603` — `:28-30`.

Drie losse Mastra-agents op één root-instance: `src/lib/mastra/instance.ts:79-101`.

### Hoe wordt bepaald dat een gesprek klaar is? Allebei

```198:199:/Users/jordylissenburg/qonvo/src/lib/chat/process-message.ts
    const maxTurns = template.max_turns;
    const isEnded = conversationEnd || newTurnsUsed >= maxTurns;
```

- **Door het model**: `conversationEnd: boolean` in de gestructureerde output
  (`src/lib/mastra/schemas.ts:7-10`), waar het model op gestuurd wordt via de `endCondition` uit
  het scenario (`src/lib/mastra/prompts.ts:75`).
- **Deterministisch in code**: `turns_used >= max_turns`. Pre-flight op
  `src/lib/chat/process-message.ts:97-99`, closing-turn-vlag op `:157`, einde op `:199`.
- Het onderscheid wordt bewaard in `end_reason`: `completed` versus `max_turns_reached` —
  `src/lib/chat/process-message.ts:215`, met de reden op `:211-214`. De hele enum staat in
  `src/types/n8n.ts:113-119`, DB-CHECK in `supabase/migrations/061_conversation_end_reason.sql`.
- De beoordelaarsprompt leest `end_reason` en past de framing aan —
  `src/lib/mastra/prompts.ts:273-278`.

---

## V5 — Wat zit er tussen de motor en de UI?

### Een dunne API-laag, geen directe koppeling

De UI praat nooit rechtstreeks met de motor; er zit steeds een route-handler tussen. Maar die laag
is **niet Zod-gevalideerd** — in geen van de acht onderzochte routes:
`src/app/api/roleplay/chat/route.ts:24-31` (handmatige checks),
`src/app/api/conversations/start/route.ts:48-65`, `src/app/api/conversations/end/route.ts:58-75`,
`src/app/api/conversations/review/route.ts:24-28`, `src/app/api/embed/chat/route.ts:10-12`,
`src/app/api/embed/start/route.ts:37-50`, `src/app/api/demo/chat/route.ts:39-43`.

### Afspraken tussen UI en motor

**Streamingformaat: geen.** Eén JSON-antwoord per beurt (zie V1). De client leest drie velden:

- `data.assistantMessage` → bericht toevoegen — `src/hooks/use-conversation.ts:178`
- `data.turnsUsed` → beurtenteller — `:182`
- `data.conversationEnd` → afronden + review starten — `:184-187`

`turnsRemaining` wordt wel geretourneerd (`process-message.ts:241`) maar niet gebruikt door de hook.

**Tussenstatussen:**

| Status | Bron |
|---|---|
| `isSending` → typing-dots | `src/hooks/use-conversation.ts:157`; `src/components/conversations/chat-interface.tsx:133` |
| `isReviewing` → "Gesprek wordt geanalyseerd…" | `src/hooks/use-conversation.ts:61`, `:120`; `src/components/conversations/message-list.tsx:137-141` |
| `isCompleted` → "Dit gesprek is afgerond." | `src/components/conversations/chat-interface.tsx:142-145` |
| `continuationLocked` → geen invoerveld | `src/components/conversations/chat-interface.tsx:146-151` |

**Review-afhandeling is polling, geen push:** POST `/api/conversations/review`
(`src/hooks/use-conversation.ts:123-127`), daarna elke 3 s een GET, maximaal 40 pogingen —
`:37-38`, `:107-110`, `:136`. Bailt direct bij 4xx behalve 404 (`:93-96`).

**Foutvormen.** De routes geven `{ error: string }` met 400/401/403/404/409/429/502 —
`src/app/api/roleplay/chat/route.ts:12`, `:19`, `:28`, `:40`, `:46`, `:50`, `:58-61`, `:76`. De UI
vertaalt die mager: bij een mislukte beurt wordt het optimistische bericht stil teruggerold,
**zonder melding** (`src/hooks/use-conversation.ts:168-170`, `:188-190`). Alleen bij beëindigen
komt er een toast (`:219-223`). `src/lib/chat/errors.ts:22-42` definieert een
`ConversationNotFoundError` die de chatroutes niet gebruiken.

### Wat hoort bij het gesprek en wat bij het Qonvo-leerproduct

**Gaat mogelijk mee (het gesprek):**
`src/hooks/use-conversation.ts` · `src/components/conversations/chat-interface.tsx` ·
`conversation-shell.tsx` · `message-list.tsx` · `message.tsx` · `conversation-header.tsx` ·
`progress-segments.tsx` · `goal-strip.tsx` · `end-conversation-confirm.tsx` ·
`start-conversation.tsx` · `src/components/embed/embed-chat-interface.tsx`.

**Blijft staan (het leerproduct):**
leerpaden (`src/components/learning-paths/*`, `src/lib/learning-paths/step-access.ts`) ·
dashboard (`src/app/(app)/(dashboard)/dashboard/page.tsx`) ·
resultaten (`academy/resultaten/[conversationId]/page.tsx`,
`src/components/reviews/rubric-score-breakdown.tsx`) ·
credits (`src/components/layout/credits-sidebar-widget.tsx`,
`src/components/admin/credit-manager.tsx`) ·
bibliotheek en scenariobeheer (`dashboard/bibliotheek/**`, `src/components/library/*`,
`src/components/conversation-templates/*`) ·
LTI (`src/app/api/lti11/**`, `src/lib/lti11/*`).

---

## Randgevalpatches

Hardgevochten kennis die in geen ontwerpdocument staat. "Gaat mee" = relevant voor een tekst-only
rollenspelagent in Wunderstack.

| pad:regel | Wat het voorkomt | Gaat mee |
|---|---|---|
| `supabase/migrations/058_fix_persona_role_framing.sql:4-15` | "Je bent Petra" werd door het model gelezen als beschrijving van de *deelnemer*, waarna de AI de leerling met de personanaam aansprak; vervangen door "Jij speelt de rol van" | **ja** |
| `src/lib/mastra/prompts.ts:72` | Assistent zet `"Klant: "` voor zijn eigen antwoord | ja |
| `src/lib/mastra/prompts.ts:74` | Kromme werkwoordvervoegingen en letterlijke vertalingen in het Nederlands | ja |
| `src/lib/mastra/prompts.ts:71` | Model valt uit zijn rol en gaat coachen in plaats van spelen | ja |
| `src/lib/mastra/prompts.ts:76` | Hallucinatie in de rol | ja |
| `src/lib/mastra/prompts.ts:45-47` | Persona geeft de verborgen onderlaag ongevraagd weg | ja |
| `src/lib/mastra/prompts.ts:140-142` | Idem in de openingszin — daar mag hooguit een subtiele hook | ja |
| `src/lib/mastra/prompts.ts:65-67` | Model stelt nog nieuwe vragen op de laatste beurt in plaats van af te ronden | ja |
| `src/lib/mastra/prompts.ts:208-213` | Beoordelaar rekent spelfouten en typefouten mee in de score | ja |
| `src/lib/mastra/prompts.ts:203-206` | Genderaannames over de deelnemer in de feedback | ja |
| `src/lib/mastra/prompts.ts:221-224` | Beoordelaar verzint verborgen informatie die er niet was | ja |
| `src/lib/mastra/prompts.ts:226-233` | Beoordelaar herformuleert rubriekvragen of verzint criteria | ja |
| `src/lib/mastra/prompts.ts:273-278` | Feedback doet alsof een afgebroken gesprek volledig was | ja |
| `src/lib/mastra/schemas.ts:16-20` | Score net buiten 0-10 laat de hele review falen; clampen in plaats van weigeren | ja |
| `src/lib/mastra/schemas.ts:71-174` | Model levert criteria in andere volgorde of met afwijkende vraagtekst | ja |
| `src/lib/mastra/schemas.ts:176-192` | Stille contractbreuk die pas in de UI zichtbaar wordt | ja |
| `src/lib/chat/process-review.ts:236-239` | Model bepaalt zelf geslaagd/gezakt; code herberekent gewogen en overschrijft | ja |
| `src/lib/chat/trigger-review.ts:166-172` | Leeg gesprek kreeg 8/10 omdat het model op persona + rubriek ging gokken | ja |
| `src/lib/chat/process-review.ts:192-194` | Tweede verdedigingslinie tegen diezelfde bug bij een toekomstige refactor | ja |
| `src/lib/chat/process-review.ts:22-23` | Gehallucineerde inhoudelijke feedback op een gesprek zonder inhoud | ja |
| `src/lib/mastra/agents/review-agent.ts:30-35` | Bij >30 berichten viel de opening buiten de beoordeling | ja |
| `src/lib/mastra/history.ts:47-53` | Laatste beurt van de deelnemer stond dubbel in de prompt | ja |
| `src/lib/mastra/history.ts:36-38` | Mislukte historie-load liet de hele beurt crashen | ja |
| `src/lib/chat/process-message.ts:91-99` | Beurt indienen op een gesprek dat al op max_turns zat | ja |
| `src/lib/chat/process-message.ts:101-116` | Twee parallelle tabbladen zagen dezelfde beurt N+1; teller verloor een beurt | ja |
| `src/lib/chat/process-message.ts:243-252` | Netwerk-hiccup kostte de deelnemer een beurt en liet een user-bericht zonder antwoord achter | ja |
| `src/lib/chat/process-message.ts:201-218` | Parallelle "Beëindig"-klik overschreef de `end_reason` van het andere pad | ja |
| `src/lib/chat/process-message.ts:220-228` | Browsercrash net na de laatste beurt = nooit een review | ja |
| `src/lib/chat/trigger-review.ts:109-117` | Race tussen bestaande-review-check en lock gaf de gebruiker een eeuwig hangende review-loop | ja |
| `src/lib/chat/trigger-review.ts:87-104` | Twee parallelle reviews op één gesprek | ja |
| `src/lib/chat/process-review.ts:120-130` | Duplicate-insert liet de hele review-pipeline crashen; nu upsert met ignoreDuplicates | ja |
| `src/app/api/conversations/review/route.ts:78-82` | Tijdelijke auth-storing brak de poll-loop af in plaats van te retryen | ja |
| `src/app/api/conversations/review/route.ts:124-126` | `.single()` produceerde logruis bij elke poll voordat de review bestond | ja |
| `src/hooks/use-conversation.ts:87-96` | Doorpollen op 401/403 → 40× hetzelfde antwoord en dan een generieke fout | ja |
| `src/hooks/use-conversation.ts:198-203` | UI sprong naar "afgerond" vóór de server bevestigde; bij netwerkfout geen weg terug | ja |
| `src/components/conversations/progress-segments.tsx:17-22` | `maxTurns <= 0` crashte de voortgangsbalk | ja |
| `src/lib/n8n/client.ts:271-282` | Retry na eigen timeout stapelde een tweede n8n-executie bovenop de eerste | nee (n8n-specifiek) |
| `src/lib/n8n/client.ts:260` | `data.output ?? data` — twee mogelijke responsevormen van n8n | nee |
| `src/app/api/conversations/start/route.ts:283`, `:318-320` | Mislukte openingsgeneratie liet het gesprek zonder eerste bericht; fallback `"Hallo!"` | ja |
| `src/app/api/conversations/start/route.ts:178-199` | Twee parallelle actieve sessies per deelnemer per scenario | ja |
| `src/app/api/roleplay/chat/route.ts:53-62` | Doorpraten in een gesprek waarvan de trainer het scenario archiveerde | platform |
| `src/app/api/conversations/end/route.ts:46-48`, `:72-75` | Client die zelf een willekeurige `end_reason` mag declareren | ja |
| `src/app/api/demo/chat/route.ts:68-78` | Backendfout op de publieke demo toonde een harde error; nu altijd 200 met vriendelijke tekst | ja |
| `src/lib/library/resolve-persona.ts:48-72` | Oude gestructureerde persona-blokken leverden lege prompts na het platslaan van het schema | ja |

**Niet gevonden** (gezocht in heel `src/` en `supabase/migrations/` op `injection`, `jailbreak`,
`moderation`, `sanitiz`, `strip`, `ongepast`):

- Geen runtime-strip van een `"Klant:"`-prefix uit de modeloutput — alleen de promptinstructie op
  `prompts.ts:72`.
- Geen expliciete prompt-injectie- of jailbreakfilter in code. De verdediging tegen "haal de
  persona uit zijn rol" is volledig prompt-gebaseerd (`prompts.ts:71-76`).
- Geen contentmoderatie op de invoer van de deelnemer in het tekstpad.
- Geen JSON-reparatie met markdown-fences; dat wordt afgevangen door Mastra's
  `structuredOutput` met `jsonPromptInjection: true`
  (`src/lib/mastra/agents/conversation-agent.ts:76-79`, `review-agent.ts:57-60`).

Voice-specifieke guards (`src/lib/voice/circuit-breaker.ts:38-46`,
`src/lib/voice/mistral-tts.ts:71-104`, `src/lib/voice/server/ws-handler.ts:857-860`) zijn buiten
scope voor fase 1 maar zijn wel bewijs dat het TTS-pad eigen randgevallen kent.

---

## Beschikbare transcripten

| Aantal | Scenario's | Periode | Met beoordeling |
|---|---|---|---|
| niet vastgesteld | niet vastgesteld | niet vastgesteld | niet vastgesteld |

Wat wel vaststaat, uit de structuur:

- Een transcript is reconstrueerbaar per gesprek: `messages` gefilterd op `conversation_id`,
  gesorteerd op `created_at` — `src/lib/mastra/history.ts:31-34`.
- De bijbehorende beoordeling zit op `reviews`, één rij per gesprek, met UNIQUE-constraint op
  `conversation_id` — `supabase/migrations/010_reviews.sql:1-8`, benoemd op
  `src/lib/chat/process-review.ts:125-126`.
- Gesprekken met een afgeronde beoordeling zijn te vinden op `conversations.status = 'reviewed'` —
  gezet op `src/lib/chat/process-review.ts:254`.
- Het scenario per gesprek is `conversations.conversation_template_id`, de periode
  `started_at` / `completed_at` — `src/types/database.ts:583-615`.
- Lege gesprekken zijn uitfilterbaar: die hebben `turns_used = 0` en een synthetische review met
  `feedback: []` — `src/lib/chat/process-review.ts:132-152`. Die tellen niet mee voor een gouden set.

**Waarom niet geteld:** de Supabase-host uit `.env.local` resolvet niet vanaf deze machine
(`curl` exit 6, DNS-resolutie mislukt). Er is geen lokale databasedump in de repo en de
`supabase`-CLI is niet geïnstalleerd (`which supabase` → niet gevonden). Een telling vereist
werkende netwerktoegang tot de Supabase-instantie of een export door iemand met toegang. De
query's die het antwoord geven zijn aggregaten en hoeven geen inhoud aan te raken:
`count(*) FROM reviews`, `count(DISTINCT conversation_template_id) FROM conversations WHERE
status='reviewed' AND turns_used > 0`, `min/max(completed_at)`.

Zonder dat getal is niet te zeggen of de gouden set van 30-50 items haalbaar is. `(aanname)` Gezien
het aantal migraties met productiedatafixes (058 raakt bestaande `conversations.persona_snapshot`,
`supabase/migrations/058_fix_persona_role_framing.sql:58-64`) is er reële productiedata geweest.

---

## Botsingen met Wunderstack-conventies

| Onderwerp | Qonvo (pad) | Wunderstack (pad) | Ernst |
|---|---|---|---|
| **Retrieval verplicht in het profieltype** | Rollenspel doet geen retrieval; de context komt uit persona/situatie/leerdoel (`src/lib/n8n/client.ts:101-136`) | `runRetrieval` is een verplicht veld op `AgentRuntimeProfile` (`packages/agents/src/runtime/profile.ts:28`) en wordt op elk normaal pad aangeroepen (`runtime/create-agent.ts:442`, `:559`) | **hoog** — het profieltype moet verbreed of de rollenspeler krijgt een eigen seam |
| **Citatiedwang / G4-koppeling** | Een rollenspelbeurt heeft per definitie geen bronvermelding | Een inhoudelijk antwoord zonder geverifieerd citaat wordt geweigerd (`runtime/create-agent.ts:177-189`); ongegronde getallen worden geweigerd (`:166-175`) | **hoog** — deze guards moeten uit voor dit agenttype, en dat is precies de guard die het CAO-product veilig maakt |
| **Gesprekstoestand in de database** | `conversations`, `messages`, `reviews`, `review_locks` (`supabase/migrations/008-010`, `060`) | Geen sessie-, gespreks- of berichttabel; alleen `documents`, `chunks`, `interaction_events` (`packages/db/src/schema/fund/index.ts:1-7`) | **hoog** — nieuw schema nodig; dit is het grootste stuk nieuw werk |
| **Multi-turn state** | Server is de bron van waarheid; historie uit de DB, venster van 30 (`src/lib/mastra/history.ts:4`, `:31-34`) | Stateless; de client stuurt maximaal 6 beurten mee (`packages/agents/src/types.ts:24`), gebruikt alleen om elliptische vervolgvragen te condenseren (`runtime/create-agent.ts:249-268`) | **hoog** — een rollenspel van 10-15 beurten past niet in een venster van 6 en mag niet client-gestuurd zijn |
| **Beurtenlimiet en einde-detectie** | `max_turns` + `conversationEnd` van het model (`src/lib/chat/process-message.ts:198-199`) | Bestaat niet; elke turn staat op zichzelf | middel — nieuw concept in de runtime |
| **Tweede LLM-rol (beoordelaar)** | Aparte agent met eigen model en eigen prompt (`src/lib/mastra/instance.ts:93-99`) | Eén agent per profiel; de enige tweede modelcall is de follow-upchips (`runtime/create-agent.ts:301-316`) | middel — pipeline kent geen post-sessie-analysefase |
| **Streamingformaat** | Geen streaming; één JSON per beurt (`src/app/api/roleplay/chat/route.ts:72`) | NDJSON-eventstroom met vaste volgorde `status → text → citations → [followups] → done` (`apps/runtime/app/api/chat/route.ts:241-247`, `packages/shared/src/contracts/chat.ts:47-80`) | middel — het contract kent geen "beurt zonder citaten"; het `citations`-event is verplicht |
| **Zod op de grens** | Geen enkele route valideert met Zod (`src/app/api/roleplay/chat/route.ts:24-31` en zeven andere routes) | Zod verplicht op elke grens, ook op uitgaande events (`apps/runtime/app/api/chat/route.ts:51-54`, `.cursor/rules/300-typescript.mdc`) | laag — mechanisch bij te werken, maar het is werk |
| **Tenancy** | `organization_id` per rij, runtime bedient alle organisaties; isolatie via applicatiechecks op service-role (`src/lib/chat/process-message.ts:34`) | D15: één runtimeproces = één tenant = één fonds, uit env (`packages/tenant/src/index.ts:52-55`, `:64-67`) | **hoog** — het multi-tenant model van Qonvo botst frontaal met D15; de mapping is niet 1-op-1 |
| **RLS omzeild via service role** | `adminClient` overal in de motor | `withFundContext` is alleen `search_path`, expliciet géén beveiligingsgrens (`packages/db/AGENTS.md`) | laag — beide leunen op de procesgrens, niet op de database |
| **Modelkeuze** | Mistral via eigen `provider.ts` met eigen env-vars (`src/lib/mastra/provider.ts:32-45`) | Alles via `@wunderstack/ai` met een registry die niet-soevereine modellen weigert (`packages/ai/src/models.ts:226-238`) | laag — beide zijn Mistral; alleen omleggen |
| **Langfuse-conventies** | `serviceName: "qonvo"`, tags `mastra`, `branch:*`, `modality:*`, `difficulty:*` (`src/lib/mastra/instance.ts:68`, `:147-149`) | `serviceName: "wunderstack-cao-agent"`, tags `<agentKey>-agent`, fund, agentKey, corpusVersion, environment, channel (`packages/agents/src/observability/langfuse.ts:14`, `observability/trace.ts:160-167`) | laag — hernoemen; `sessionId` = conversationId is in beide identiek (`instance.ts:153` versus `trace.ts:152`) |
| **Spanstructuur** | Één `agent.generate` per beurt, geen eigen root-span | Root `AGENT_RUN` + child `RAG_VECTOR_OPERATION` + `RAG_EMBEDDING`-event (`observability/trace.ts:139-141`, `:185-187`, `:212-214`) | laag — de retrieval-spans vervallen simpelweg |
| **Evalinfrastructuur** | Geen evals of gouden sets voor het rollenspel gevonden (gezocht in `src/`, geen `*.eval.ts`) | Gate-registry en gouden sets verplicht (`packages/agents/src/evals/gates.ts:45-89`, `evals/fixtures/golden-set.*.jsonl`) | middel — er moet iets nieuws komen; een LLM-judge op rubriekscores is een ander soort eval dan citaatverificatie |
| **Taal van de code** | Nederlandse comments, Engelse identifiers; bestandsnamen `n8n/*` terwijl het Mastra is | Engels verplicht, `@wunderstack/*`-scope (`.cursor/rules/000-core.mdc`) | laag — hernoemen bij de port |

### Wat gewoon past

- **Mastra achter een naad.** Qonvo verstopt Mastra al in `src/lib/mastra/*`
  (`instance.ts:17-21`); Wunderstack eist precies dat (`packages/agents/src/types.ts:5-7`).
- **Mistral als soeverein defaultmodel.** `src/lib/mastra/provider.ts:41` versus
  `packages/ai/src/models.ts:132`.
- **Langfuse EU met pseudonieme sessie-id.** Beide gebruiken conversation-id als `sessionId` en
  bewust geen persoonsidentifier — `src/lib/mastra/instance.ts:128-136` versus
  `packages/agents/src/types.ts:129`.
- **Gestructureerde LLM-output met Zod.** `src/lib/mastra/schemas.ts:7-37` versus
  `packages/agents/src/runtime/generation-schema.ts`.
- **Configuratie als data, code als agent.** Qonvo's scheiding template/bibliotheek versus
  promptcode is exact het control-plane/data-plane-principe uit `.cursor/rules/200-architecture.mdc`.
- **Geen persoonsgegevens in de modelpayload.** Zie V2 — dit past naadloos op
  `packages/db/src/schema/fund/interaction-events.ts:24-26`.
- **Snapshotten voor reproduceerbaarheid.** Qonvo's snapshots
  (`src/app/api/conversations/start/route.ts:169-176`) zijn conceptueel hetzelfde als
  `corpusVersion` in Wunderstack (`packages/agents/src/types.ts:136-140`).

---

## Wat ik NIET heb kunnen vaststellen

1. **Het bestand `claude/implementatieprompt-roleplay-fase1.md` bestaat niet op deze machine.**
   Gezocht met glob op `*roleplay*` en `*implementatieprompt*` in `/Users/jordylissenburg/qonvo`,
   `/Users/jordylissenburg/wunderstack`, `~/Desktop`, `~/Documents` en `~/Downloads`; er is geen
   `claude/`-map in beide repo's. Daardoor ken ik de inhoud van PR-0 t/m PR-5 niet, behalve wat de
   onderzoeksopdracht zelf over PR-2 zegt. De laatste sectie hieronder is navenant beperkt.
2. **Aantal, spreiding en periode van transcripten met beoordelingen.** Zie de sectie hierboven:
   DNS naar de Supabase-host resolvet niet en er is geen lokale dump.
3. **Of `AI_BACKEND` in productie op `mastra`, `n8n` of `shadow` staat.** De code-default is
   `mastra` (`src/lib/ai-backend/route-ai-call.ts:46`, `:117`), en `.env.local` zet de variabele,
   maar ik heb de waarde niet gelezen en ken de Scalingo-omgeving niet.
4. **Of de n8n-workflows nog draaien.** `N8N_CONVERSATION_WEBHOOK_URL` en
   `N8N_REVIEW_WEBHOOK_URL` staan in `.env.local`, maar of er iets achter zit is niet vast te
   stellen zonder netwerktoegang.
5. **De feitelijke kwaliteit van de rollenspelbeurten.** Er zijn geen evals of gouden sets voor het
   rollenspel in de repo (gezocht op `*.eval.ts` en `golden` in `/Users/jordylissenburg/qonvo`).
   Er is dus geen meetbare baseline om na de port tegen af te zetten.
6. **Of `users.full_name` ergens buiten de onderzochte motorbestanden alsnog in een prompt komt.**
   Ik heb het motorpad uitgekamd; een volledige repo-brede dataflow-analyse heb ik niet gedaan.
7. **Hoeveel scenario's er in productie bestaan en hoeveel daarvan actief gebruikt worden.**
   Zelfde reden als punt 2.

---

## Consequenties voor `implementatieprompt-roleplay-fase1.md`

**Waarschuwing bij deze sectie:** het planbestand is niet gevonden (zie punt 1 hierboven). Ik ken de
inhoud van de PR's niet, alleen de aanduiding van PR-2 uit de onderzoeksopdracht zelf. Wat volgt is
daarom impact per PR *voor zover verantwoord*, en expliciet leeg waar dat niet kan.

| PR | Oordeel | Waarom |
|---|---|---|
| **PR-0** | niet te beoordelen | Inhoud onbekend. Wat wel geldt: het fundament dat een fase-0 normaal legt — Mastra-naad, Mistral-provider, Langfuse-tracing, Zod-outputschema's — bestaat al in Qonvo (`src/lib/mastra/instance.ts`, `provider.ts`, `schemas.ts`) én in Wunderstack (`packages/agents/src/runtime/create-agent.ts`). `(aanname)` dat maakt PR-0 vermoedelijk kleiner. |
| **PR-1** | niet te beoordelen | Inhoud onbekend. |
| **PR-2** (promptontwerp / scenarioschema) | **wordt aanzienlijk kleiner, en verandert van aard** | De opdracht vermoedde dat dit reverse-engineeren uit de DB zou worden. Dat is niet zo: alle prompts staan in code op één plek (`src/lib/mastra/prompts.ts:24-365`) en het scenarioschema is een expliciet TypeScript-contract (`src/types/n8n.ts:1-42`, `src/types/library.ts:71-146`), met de veld-voor-veld-mapping in `src/lib/n8n/client.ts:101-136`. PR-2 wordt overnemen en vertalen, niet ontwerpen. Het schema in de tabel onder V3 vervangt elk zelfbedacht scenarioschema. |
| **PR-3** | niet te beoordelen | Inhoud onbekend. |
| **PR-4** | niet te beoordelen | Inhoud onbekend. |
| **PR-5** | niet te beoordelen | Inhoud onbekend. |

**Wat het plan sowieso moet verwerken, ongeacht de PR-indeling:**

1. De premisse "de rollenspellogica is een n8n-orkestratie" is onjuist en moet uit het plan.
   Bewijs: `src/lib/ai-backend/route-ai-call.ts:46`, `:117`.
2. Het zwaartepunt verschuift van *promptontwerp* naar *twee structurele gaten in Wunderstack*:
   een agenttype zonder verplichte retrieval (`packages/agents/src/runtime/profile.ts:28`) en
   server-side gesprekstoestand (`packages/db/src/schema/fund/index.ts:1-7`). Dat zijn de twee
   grootste posten, en geen van beide is promptwerk.
3. De randgevalpatchtabel hierboven is de checklist die een herbouw stilzwijgend zou weggooien.
   Vooral `supabase/migrations/058_fix_persona_role_framing.sql:4-15`, de lege-gesprekguard
   (`src/lib/chat/trigger-review.ts:166-172`) en de review-normalisatie
   (`src/lib/mastra/schemas.ts:71-174`) zijn niet af te leiden uit een ontwerpdocument.
4. Het D15-conflict verdient een eigen beslissing vóór de bouw: Qonvo is multi-tenant per rij,
   Wunderstack is één proces per fonds. Een rollenspelagent per fonds is D15-conform, een gedeelde
   rollenspelruntime over fondsen niet (`.cursor/rules/000-core.mdc`).
5. De gouden set is nog niet aantoonbaar haalbaar; dat hangt op de telling die hier niet lukte.
