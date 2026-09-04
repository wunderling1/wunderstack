# UI-AUDIT-v1 — read-only architectuur-audit t.b.v. CAO-agent UI v2

> **Scope & methode.** Read-only audit van de Wunderstack-monorepo op branch `main`
> (HEAD `7bfba95` — "feat(phase-13): UI fluency, eval gate hardening, and citation-verified
> answers"). Elke feitelijke claim draagt een pad + regelnummers. Niet-gevonden zaken staan als
> `OPEN` met de gebruikte zoekpoging. Types/contracten zijn verbatim overgenomen (ingekort met
> `// …` waar aangegeven). Er is **niets** gewijzigd behalve dit bestand (zie `git status` onderaan).
>
> **Belangrijke bevinding vooraf (leest de rest van het rapport):** de UI-map heet
> `apps/demo/components/chat/`, niet `packages/web/src/components/` zoals in de voorbeeld-prompt.
> De componenten zijn kleine-letter-bestanden (`chat.tsx`, `citation.tsx`), geen `Chat.tsx`.

---

## A. Frontend-stack en componentinventaris

### A.1 Framework + versies (verbatim, `apps/demo/package.json:12-36`)

```json
"dependencies": {
    "@wunderstack/agents": "workspace:*",
    "@wunderstack/shared": "workspace:*",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.23.0",
    "next": "16.2.9",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "tailwind-merge": "^3.6.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.2",
    // …
    "tailwindcss": "^4.3.2",
    "tw-animate-css": "^1.4.0",
    "typescript": "6.0.3"
  }
```

- **Framework:** Next.js 16 (App Router), React 19.2.7 (`apps/demo/package.json:18-19`).
- **Styling:** Tailwind CSS v4 (CSS-first, géén `tailwind.config.js`) — tokens in
  `apps/demo/app/globals.css:10-25` (`@theme inline { … }`); `tw-animate-css` voor `animate-pulse`.
  `class-variance-authority` + `clsx` + `tailwind-merge` (via `cn`, `apps/demo/lib/utils.ts`).
- **Iconen:** `lucide-react` (`ChevronRight`, `FileText`, `ThumbsUp/Down`, `SendHorizontal`).
- **Markdown-rendering:** `react-markdown` + `remark-gfm` (`apps/demo/components/chat/markdown.tsx:4-5`).
- **State management:** géén externe library. Alleen React-hooks; alle chat-state leeft in één
  custom hook `useChat` (`apps/demo/components/chat/use-chat.ts:57-275`).
- **Build:** `next build --webpack` (`apps/demo/package.json:7`) — expliciet Webpack voor de
  *build*; `next dev` draait wel op Turbopack (zie `.cursor/rules/100-stack.mdc`, "Bundler");
  workspace-packages worden getranspileerd (`apps/demo/next.config.mjs`, `transpilePackages`).
- **Deploy-target binnen Scalingo:** `OPEN` — zie OPEN-lijst #1.

### A.2 Componentboom van de chat-UI (pad → verantwoordelijkheid, één regel)

| Bestand | Verantwoordelijkheid |
|---|---|
| `apps/demo/app/(demo)/page.tsx:14-50` | Server-component: fund uit `?fund=`, `header` (logo/label/tagline + `FundSelector`), theme-CSS-vars, rendert `<Chat>`. |
| `apps/demo/app/widget/page.tsx:14-34` | Embeddable variant (`<Chat embedded>`), minimale chrome voor iframe. |
| `apps/demo/app/layout.tsx:19-25` | Root-layout, Inter-font, `lang="nl"`, `export const dynamic = "force-dynamic"` (nonce-CSP). |
| `apps/demo/components/chat/chat.tsx:32-71` | Container: kiest `Starters` (leeg) vs `MessageList`, autoscroll, rendert `Composer`. |
| `apps/demo/components/chat/starters.tsx:14-32` | Empty-state: tagline + drie startvraag-knoppen (`onPick → send`). |
| `apps/demo/components/chat/fund-selector.tsx:12-35` | `<select>` dat naar `?fund=<key>` navigeert; verborgen bij ≤1 fund. |
| `apps/demo/components/chat/message-list.tsx:18-119` | Berichtenlijst, user/assistant-bubbels, skeleton/statuslabel, delegeert naar `Markdown`/`Citations`/`Feedback`. |
| `apps/demo/components/chat/markdown.tsx:74-137` | Rendert antwoord als Markdown + zet inline `[n]`-markers om in klikbare knoppen. |
| `apps/demo/components/chat/citation.tsx:45-198` | Ingeklapte bronkaarten per `[ref]`, quote-highlight, lazy "Toon volledige passage". |
| `apps/demo/components/chat/feedback.tsx:22-117` | Duim omhoog/omlaag + reden-chips + vrij tekstveld per antwoord. |
| `apps/demo/components/chat/composer.tsx:13-58` | Textarea + verzendknop, Enter-submit, disabled tijdens streamen. |
| `apps/demo/components/chat/use-chat.ts:57-275` | Client-state + NDJSON-streamreader + feedback-submit; enige plek die `/api/chat` en `/api/feedback` aanroept. |
| `apps/demo/components/ui/button.tsx:6-33` | shadcn-stijl `Button` (cva-varianten), enige gedeelde UI-primitive. |

Ondersteunend (server-lib, geen render): `apps/demo/lib/agent.ts` (agent-singleton),
`apps/demo/lib/fund-scope.ts` (fund-autorisatie), `apps/demo/lib/fund-theme.ts` (per-fonds theming),
`apps/demo/lib/http.ts`, `apps/demo/lib/rate-limit.ts`, `apps/demo/lib/webhook-auth.ts`,
`apps/demo/proxy.ts` (CSP/auth-naad).

### A.3 Design tokens / theme-systeem (per tenant?)

- **Er is een tokensysteem.** OKLCH-tokens (light + `.dark`) in `apps/demo/app/globals.css:27-51`,
  gemapt op Tailwind-utilities via `@theme inline` (`globals.css:10-25`). Radius/font-tokens aanwezig.
- **Per-tenant theming bestaat**, maar CSS-first en beperkt tot **kleur** (plus label/tagline/starters).
  `apps/demo/lib/fund-theme.ts:32-69` levert een resolved `FundTheme`; `page.tsx:27` zet alleen
  `--primary` en `--ring` als inline CSS-var per fonds:

```ts
// apps/demo/app/(demo)/page.tsx:27
const themeVars = { "--primary": theme.primary, "--ring": theme.primary } as CSSProperties;
```

- `FundTheme` verbatim (`apps/demo/lib/fund-theme.ts:11-24`):

```ts
export interface FundTheme {
  key: string;
  logoText: string;
  label: string;
  tagline: string;
  primary: string;   // CSS-kleur, toegewezen aan --primary/--ring
  starters: string[];
}
```

- **Conclusie:** géén volledig per-tenant theme-token-systeem (alleen `--primary`/`--ring`); logo is
  een tekst-badge (`theme.logoText`), geen asset. `.dark` is gedefinieerd maar er is **geen
  dark-mode-toggle of `.dark`-class-setter** in de UI — zie OPEN #12.

---

## B. Render-flow van één bericht

### B.1 End-to-end bij submit

1. `Composer.submit()` roept `onSend(trimmed)` (`apps/demo/components/chat/composer.tsx:16-23`), dat
   is `send` uit `useChat` (via `chat.tsx:33,67`).
2. `useChat.send` (`use-chat.ts:73-252`): voegt optimistisch een user-bubble **en** een
   assistant-bubble (`streaming: true`, `phase: "searching"`) toe (`use-chat.ts:117-148`), bouwt
   `history` uit de laatste 6 non-lege berichten (`use-chat.ts:47-55, 87`).
3. `fetch("/api/chat", { method: "POST", … body: { question, history, fund? } })`
   (`use-chat.ts:151-156`).
4. Route `apps/demo/app/api/chat/route.ts:30-119`: rate-limit → bounded body → Zod-parse →
   `resolveFundScope` → `agent.answerStream(...)`; elk agent-event wordt als één NDJSON-regel
   ge-enqueued (`route.ts:83-90`).
5. Response = `content-type: application/x-ndjson` stream (`route.ts:112-118`).
6. `useChat` leest de stream regel-voor-regel, valideert elke regel met `chatEventSchema.safeParse`
   (`use-chat.ts:162-228`) en muteert de assistant-bubble per event-type (`use-chat.ts:176-211`).
7. Render: `MessageList` → `MessageBubble` (`message-list.tsx:60-119`) rendert user als
   `whitespace-pre-wrap`-`<p>` en assistant via `<Markdown>` (`message-list.tsx:94-98`), plus
   `<Citations>` en `<Feedback>`.

### B.2 Streaming — bestaat het al?

**Ja, volledig.** De keten streamt NDJSON én token-voor-token:

- **Transport:** `fetch`-body-reader met `TextDecoder`, split op `\n` (`use-chat.ts:162-229`). Géén
  SSE, géén AI-SDK `useChat`. NDJSON is bewust gekozen (`PLAN-ui-fluency.md:183`).
- **Echte token-streaming is aangesloten.** `answerStream` leest `output.textStream` in een
  reader-loop en yield't `text`-deltas (`packages/agents/src/cao/agent.ts:312-337`). De sovereign
  model-adapter `doStream` consumeert een echte `streamText` (`packages/agents/src/model/sovereign-model.ts:122-163`),
  die `@wunderstack/ai` importeert (`sovereign-model.ts:1`). Dit is Fase 13.3 uit
  `PLAN-ui-fluency.md:146-170` — **al geïmplementeerd** (de "gefakete één-delta" uit dat plan is weg).
- **Mastra/AI SDK versie:** `@mastra/core ^1.48.0`, `@ai-sdk/provider 2.0.3`
  (`packages/agents/package.json:27-29`). De agent-adapter implementeert `LanguageModelV2`
  (`sovereign-model.ts:82-165`), dus streaming werkt zónder architectuurwijziging.
- **Plek waar streaming al is aangesloten** (voor v2-uitbreidingen zoals "zichtbare verificatie-stappen"):
  de yield-punten in `packages/agents/src/cao/agent.ts:276-362` (`status` → `text` → `citations` →
  `done`) en de client-handler `use-chat.ts:176-211`.

### B.3 Typing/loading-indicator

- Er is **geen kale spinner meer**; in plaats daarvan een **shimmer-skeleton + statuslabel**:
  `AnswerSkeleton` (`message-list.tsx:44-57`) toont een `aria-live="polite"`-statusregel plus
  `animate-pulse`-balken. Conditie: `waiting = message.streaming && message.text.length === 0`
  (`message-list.tsx:70,92-93`).
- Statuslabels via `phaseLabel` (`message-list.tsx:29-41`): "CAO doorzoeken…" / "N passages gevonden"
  / "Antwoord formuleren…". De `phase` wordt geseed op de client (<100ms, `use-chat.ts:145`) en
  bijgewerkt door `status`-events (`use-chat.ts:176-181`).

---

## C. API-contract chat-endpoint

### C.1 Endpoint + method

- `POST /api/chat` — `runtime = "nodejs"` (`apps/demo/app/api/chat/route.ts:19,30`).
- Nevenendpoints: `POST /api/passage` (`app/api/passage/route.ts:17`), `POST /api/feedback`
  (`app/api/feedback/route.ts:18`), `POST /api/webhook` (buiten chat-scope).

### C.2 Request-type (verbatim, `apps/demo/app/api/chat/contract.ts:11-24`)

```ts
export const chatHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  question: z.string().min(1, "Stel een vraag.").max(2000, "Vraag is te lang."),
  /** Optional O&O fund key to restrict the CAO to a single fund. */
  fund: z.string().min(1).max(200).optional(),
  /** Recent turns to condense elliptical follow-up questions into a standalone retrieval query. */
  history: z.array(chatHistoryMessageSchema).max(6).default([]),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
```

**Conversatiegeschiedenis** wordt dus meegestuurd als `history` (max 6 turns) en client-side gebouwd
in `buildHistory` (`use-chat.ts:47-55`). Server-side wordt `history` **uitsluitend** gebruikt om
elliptische vervolgvragen te condenseren tot een standalone retrieval-query
(`packages/agents/src/cao/agent.ts:130-143`, `condense.ts:48-85`) — **niet** als volledige
multi-turn context voor de generatie. De query-rewriting-lacune: condensatie draait alleen als
`isElliptical` true is (`condense.ts:30-46`), een heuristiek; anders gaat de rauwe vraag door.

### C.3 Response-type (verbatim, NDJSON `ChatEvent`, `apps/demo/app/api/chat/contract.ts:31-67`)

```ts
export const chatStatusPhases = ["searching", "retrieved", "generating"] as const;
export type ChatStatusPhase = (typeof chatStatusPhases)[number];

export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    phase: z.enum(chatStatusPhases),
    count: z.number().int().nonnegative().optional(),
  }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({
    type: z.literal("citations"),
    found: z.boolean(),
    needsClarification: z.boolean(),
    citations: z.array(citation),               // citation = citationSchema uit @wunderstack/shared
    citationVerificationFailed: z.boolean(),
    /** Final reconciled answer text (failed markers stripped); the client replaces streamed text. */
    answer: z.string(),
  }),
  z.object({
    type: z.literal("done"),
    usage: z.object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    }),
    /** Langfuse trace id (null when tracing is unconfigured); used to attach user feedback. */
    traceId: z.string().nullable(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
```

De agent-zijde spiegelt dit als `CaoStreamEvent` (`packages/agents/src/types.ts:85-98`) — geen
`error`-variant daar (die wordt in de route toegevoegd, `route.ts:93-95`).

### C.4 Error- en refusal-shapes

- **HTTP-fouten (vóór de stream):** JSON, geen NDJSON — `rate_limited` (429), `invalid_request`
  (400), `fund_required`/`fund_not_allowed` (400/403), `server_busy` (503)
  (`route.ts:32-67`). De client behandelt een niet-`ok` response generiek: gooit een error en toont
  `GENERIC_ERROR` (`use-chat.ts:158-160, 230-237, 41`).
- **Stream-fout:** `{ type: "error", message }` (`route.ts:93-95`) → client vervangt de tekst
  (`use-chat.ts:204-211`).
- **Refusal ("niet gevonden"):** **géén apart HTTP-signaal.** Het is een normaal antwoord met
  `found: false` en de vaste `NOT_FOUND_MESSAGE` als tekst (`packages/agents/src/cao/agent.ts:281-293`;
  bericht in `packages/agents/src/cao/prompt.ts:12-14`). De frontend onderscheidt een refusal van een
  normaal antwoord **alleen** via `found` (opgeslagen als `ChatMessage.found`, `use-chat.ts:27,197`).
  Dit veld wordt momenteel **alleen** gebruikt om feedback te tonen (`showFeedback = … message.found
  === true`, `message-list.tsx:71`); de refusal krijgt géén eigen UI-behandeling.
- **Clarification:** `needsClarification: true` (`agent.ts:259-273`), opgeslagen in
  `ChatMessage.needsClarification` (`use-chat.ts:29,198`) maar **nergens in de UI gebruikt** (geen
  reader van dat veld in de componenten).

### C.5 Metadata die al meereist per antwoord

- `traceId` (Langfuse) via het `done`-event (`contract.ts:61-62`, `use-chat.ts:202-203`).
- `usage` (prompt/completion/total tokens) via `done` (`contract.ts:55-60`) — **wordt client-side
  genegeerd** (geen veld op `ChatMessage`; `use-chat.ts:202-203` leest alleen `traceId`).
- `citationVerificationFailed` (bool) via `citations`-event (`use-chat.ts:195`).
- `found`, `needsClarification`, `citations` via `citations`-event.
- **Niet aanwezig in de payload:** model-id, timings (retrieval-latency zit wél op de Langfuse-trace
  maar niet in de response), tenant/fund-echo, confidence.

---

## D. Citaties en bronnen

### D.1 Hoe citaties in de payload zitten

Twee-delig: **inline `[n]`-markers in de antwoordtekst** (platte tekst, geparset op de client) **plus
een aparte `citations`-array** per antwoord (`contract.ts:48`). Er zijn **geen offsets** in de
payload. Verbatim `citationSchema` (bron van waarheid, `packages/shared/src/contracts/citation.ts:37-54`):

```ts
export const citationSchema = citationSourceSchema.extend({
  chunkId: z.string().uuid(),
  quote: z.string(),          // verbatim, server-side geverifieerd
  chapter: z.string().nullable(),
  article: z.string().nullable(),
  lid: z.string().nullable(),
  sourceRef: z.string().nullable(),  // "Artikel 5, lid 2"
  heading: z.string().nullable(),    // "Artikel 12 — Vakantie"
  snippet: z.string(),               // kort excerpt rond `quote`
});
export type Citation = z.infer<typeof citationSchema>;
```

`citationSourceSchema` (`citation.ts:9-16`) levert `ref` (1-based), `title`, `sourceUri`, `fund`,
`version`. De koppeling marker↔kaart is `[ref]` → één kaart (`markdown.tsx:37-72` matcht `\[(\d+)\]`;
`message-list.tsx:76-82` bouwt `quoteByRef`).

### D.2 Regressie-forensiek (git history)

De drie in het voorstel beschreven regressies zijn **op de huidige `main` (HEAD `7bfba95`) grotendeels
NIET reproduceerbaar**; de code doet nu juist het gewenste gedrag. De git-history verklaart dit.

Relevante commits (`git log --oneline -- apps/demo/components/chat/{markdown,citation,message-list,use-chat}`):

```
7bfba95 feat(phase-13): UI fluency, eval gate hardening, and citation-verified answers   (= HEAD/main)
d5a5622 feat(phase-12): trust-showing UI + feedback loop
61a7ee9 feat(phase-11): grounding & agent behavior — citations, clarify, scope guard
```

`markdown.tsx` is voor het eerst toegevoegd in `7bfba95`
(`git log --diff-filter=A -- apps/demo/components/chat/markdown.tsx`).

**Regressie 1 — "inline citation markers verdwenen uit de gerenderde tekst".**
- **NIET aanwezig op main.** `markdown.tsx:37-72` (`splitMarkers`) rendert elke `[n]` die een
  bijbehorende quote heeft als klikbare knop; onbekende markers vallen terug op platte tekst
  (`markdown.tsx:61-64`). In `d5a5622` bestond `markdown.tsx` nog niet en toonde de bubble rauwe
  tekst via `<p className="whitespace-pre-wrap">{message.text}</p>`
  (`git show d5a5622:apps/demo/components/chat/message-list.tsx`, functie `MessageBubble`) — markers
  wáren toen zichtbaar maar níet klikbaar. `7bfba95` maakte ze klikbaar; er is dus geen "verdwijning",
  eerder een upgrade.
- **Reëel mechanisme dat markers wél kan laten verdwijnen (geïntroduceerd in `7bfba95`):** de agent
  strípt server-side markers waarvan de citatie de verbatim-verificatie niet haalt
  (`stripFailedMarkers` + `stripUnverifiedMarkers`, `packages/agents/src/cao/verify-citations.ts:51-75`),
  bedraad in `verifyAndBuild` (`packages/agents/src/cao/agent.ts:113-128`). De client vervangt vervolgens
  de gestreamde tekst door het gereconcilieerde `event.answer` (`use-chat.ts:182-198`). Als verificatie
  faalt, verdwijnen die specifieke `[n]` dus uit de zichtbare tekst — by design, maar dit is de meest
  waarschijnlijke bron van de waargenomen klacht. Oorzaak: verbatim-verificatiedrempel, niet een
  render-bug.

**Regressie 2 — "volledige passages staan standaard uitgeklapt".**
- **NIET aanwezig op main.** Bronkaarten zijn standaard ingeklapt: `const [open, setOpen] =
  useState(false)` (`apps/demo/components/chat/citation.tsx:56`); "Toon volledige passage" is een
  aparte lazy fetch (`citation.tsx:132-148`). Ook in `d5a5622` was `open` default `false`
  (`git show d5a5622:apps/demo/components/chat/citation.tsx`). `OPEN` #2: kon geen commit vinden waar
  passages default uitgeklapt stonden voor deze bestanden. Zoekpoging: `git log -p` op de vier
  chat-bestanden + `git show d5a5622:…/citation.tsx` + `git show 61a7ee9:…` (citation.tsx bestond
  daar nog niet).

**Regressie 3 — "rauwe line breaks in de tekst".**
- **NIET aanwezig op main.** Assistant-tekst gaat door `<Markdown>` (CommonMark via `react-markdown`,
  `markdown.tsx:125-137`), dat enkele newlines als spatie behandelt (geen `remark-breaks`); rauwe HTML
  is bewust uit (`markdown.tsx:10-11`, geen `rehype-raw`). In `d5a5622` werd de tekst nog rauw met
  `whitespace-pre-wrap` gerenderd (zie Regressie 1) — dáár waren bronnewlines zichtbaar. `7bfba95`
  heeft dit dus juist opgelost. **Let op:** de user-bubble gebruikt nog steeds `whitespace-pre-wrap`
  (`message-list.tsx:95`) — dat is correct (gebruikersinvoer), geen regressie.

**Netto conclusie D.2:** het voorstel beschrijft een oudere waargenomen toestand (waarschijnlijk
Fase-12, `d5a5622`, of een lokale werkkopie). `7bfba95` op `main` bevat al: klikbare inline markers,
default-ingeklapte kaarten, Markdown-rendering zonder rauwe newlines, én quote-highlight. Het
resterende reële risico is markers die verdwijnen bij falende verbatim-verificatie.

### D.3 Bereikt de citatie-verificatie de frontend?

**Deels — als één boolean per antwoord, niet per claim.** `citationVerificationFailed` (per antwoord)
reist mee in het `citations`-event (`contract.ts:50`, `agent.ts:344-351`) en landt op
`ChatMessage.citationVerificationFailed` (`use-chat.ts:26,195`). **Maar dit veld wordt nergens in de
UI gerenderd** (geen reader in de componenten — `grep` op `citationVerificationFailed` levert alleen
`use-chat.ts`, `contract.ts`, `types.ts`, `agent.ts`, `parse-generation.ts`). Per-claim-verificatie
bestaat server-side (`verifyCitations` geeft `verified[]` + `strippedMarkers[]`,
`verify-citations.ts:22-49`) maar wordt **niet** naar de payload doorgezet: alleen de overlevende,
geverifieerde citaties komen in `citations[]` (`build-citations.ts:11-53`).

**Kortste pad naar een "verified"-signaal in de payload:** het bestaat al deels — elke aanwezige
`citation` in `citations[]` is per definitie geverifieerd, en `citationVerificationFailed` is de
antwoord-brede vlag. Voor een per-claim badge zou `verifyCitations`' resultaat (`verified`/
`strippedMarkers`) in `verifyAndBuild` (`agent.ts:113-128`) mee-geëmit moeten worden op het
`citations`-event — één extra veld, geen nieuwe LLM-call.

### D.4 Genoeg voor passage-highlighting?

**Ja.** Elke citatie draagt `quote` (verbatim substring) + `snippet` (excerpt rond de quote)
(`citation.ts:41,53`). De highlight werkt met substring-match, geen offsets:
`HighlightedSnippet` (`apps/demo/components/chat/citation.tsx:27-43`) doet `snippet.indexOf(quote)`
en wrapt in `<mark>`. Snippet wordt server-side rond de quote gecentreerd
(`packages/agents/src/cao/snippet.ts:12-44`).

**"Toon volledige passage" werkt** via `POST /api/passage` (`citation.tsx:70-92`), Zod-contract
`apps/demo/app/api/passage/contract.ts:7-27`, server `fetchParentPassage`
(`packages/rag/src/passage.ts:48-111`): merged het artikel-unit (alle chunks met hetzelfde `article`)
of, zonder artikel, een ordinal-venster van ±2 chunks (`passage.ts:46,98-110`); `approximate` markeert
het laatste. Er zijn dus **twee highlight-niveaus** mogelijk (snippet-quote nu; volledige passage
zonder highlight, `citation.tsx:132-138`).

---

## E. Startvragen en tenant-configuratie

### E.1 Waar komen de drie startvragen vandaan

**Hardcoded config-in-code, per fonds.** Twee lagen:
- Component-defaults: `DEFAULT_STARTERS` in `apps/demo/components/chat/chat.tsx:21-25` én in
  `apps/demo/lib/fund-theme.ts:26-30` (duplicaat).
- Per-fonds override: `FUND_THEMES` in `apps/demo/lib/fund-theme.ts:45-57` (nu alleen
  `"elektronische-detailhandel"` met drie eigen `starters`).
- Doorgifte: `page.tsx:46` (`<Chat … starters={theme.starters} tagline={theme.tagline} />`) →
  `chat.tsx:56-60` → `starters.tsx:14-32`.

Er is **geen database- of config-file-bron**; het is TypeScript. `agent_config`-tabel bestaat wel
(zie E.2) maar wordt niet gebruikt voor starters.

### E.2 Tenant/fonds-configuratiemodel

- **Runtime-allowlist:** `CAO_FUNDS` (comma-separated env, `packages/shared/src/env.ts:48`),
  geparset door `parseCaoFunds` (`packages/shared/src/config/funds.ts:6-15`) en geautoriseerd in
  `resolveFundScope` (`apps/demo/lib/fund-scope.ts:35-57`). `availableFunds` voedt de selector
  (`fund-scope.ts:30-33`).
- **Theming = data-in-code:** `FUND_THEMES` (`fund-theme.ts:45-57`).
- **DB-model voor per-fonds config bestaat, ongebruikt voor UI:** `agentConfig`-tabel, verbatim
  (`packages/db/src/schema.ts:84-92`):

```ts
export const agentConfig = pgTable(
  "agent_config",
  {
    agentKey: text("agent_key").notNull(),
    fundKey: text("fund_key").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [primaryKey({ columns: [table.agentKey, table.fundKey] })],
);
```

**Logische plek voor per-tenant `suggestedQuestions` + thema's:** twee opties, beide bestaand:
(a) uitbreiden van `FundTheme`/`FUND_THEMES` (`fund-theme.ts:11-57`) — snelst, blijft "config = data
in code"; (b) de `agentConfig.config` JSONB-kolom (`schema.ts:89`) vullen — past bij de control-plane
vs data-plane-regel (`.cursor/rules/200-architecture.mdc`), maar vergt een lees-naad die nu niet
bestaat.

**Koppeling startvraag ↔ golden-set-entry:** er **bestaat een golden-set-ID** om naar te refereren.
Elke case heeft `id: z.string().min(1)` (`packages/agents/src/evals/golden-set.ts:40`), b.v. gebruikt
als `expectedPassageIds`/`distractorPassageIds`. De golden set leeft in
`packages/agents/src/evals/fixtures/golden-set.jsonl` (+ `golden-passages.jsonl`), handmatig gecureerd,
gepind op `GOLDEN_CORPUS_VERSION = "3"` (`golden-set.ts:90`). Er is **nu geen enkele koppeling** tussen
een startvraag en een golden-case-id; die zou nieuw gelegd moeten worden (b.v.
`{ question, goldenId }` in de theme-config). `OPEN` #3.

---

## F. Retrieval-metadata en haalbaarheid follow-up chips

### F.1 Beschikbare chunk-metadata op het moment van generatie

Volledig aanwezig binnen de agent (server-side), verbatim `RetrievedChunk`
(`packages/rag/src/retrieve.ts:47-65`):

```ts
export interface RetrievedChunkStructure {
  chapter: string | null;
  article: string | null;
  lid: string | null;
  sourceRef: string | null;
  chunkType: string;
}
export interface RetrievedChunk {
  chunkId: string;
  ordinal: number;
  content: string;
  score: number;   // cosine in [0,1]
  source: RetrievedChunkSource;      // documentId, title, sourceUri, fund, version
  structure: RetrievedChunkStructure;
  metadata: Record<string, unknown>;
}
```

De agent heeft na retrieval: `hits` (chunkId + ordinal + score + title,
`packages/agents/src/cao/tools.ts:26-31`), volledige `chunks[]`, `fullChunkContent`
(`tools.ts:57-61`), `context`-string en `timings` (`tools.ts:41-47`). **K** = `topK` default 5
(`packages/agents/src/types.ts:26`), candidate-pool `candidateK` 15
(`packages/shared/src/config/rerank.ts:37`). **Artikelnummers** en **retrieval-scores** zijn dus
beschikbaar; **buur-chunks** niet direct in de retrieval-output, maar wel opvraagbaar via
`fetchParentPassage` (`packages/rag/src/passage.ts:48-111`, ordinal-venster).

### F.2 Assemble/answer-stap + plek voor een chip-generator

- **Assemble:** `packages/rag/src/assemble.ts:42-71` (context + placeholder-citaties).
- **Answer/orchestratie:** `packages/agents/src/cao/agent.ts` — `answer` (`:177-246`) en
  `answerStream` (`:248-372`). De verified-citation-bouw zit in `verifyAndBuild` (`agent.ts:113-128`).
- **Passende plek voor een chip-generator-stap:** ná `verifyAndBuild` en vóór/na het
  `citations`-event in `answerStream` (`agent.ts:339-351`), of als aparte functie in
  `packages/agents/src/cao/`. Let op het Supervisor-patroon-voorbehoud: er is **nog geen Supervisor**
  — bewust één enkele `Agent` (`agent.ts:27-29,159-165`), Supervisor komt pas met de tweede agent
  (comment `agent.ts:28`). Een chip-generator zou nu dus een gewone deterministische of losse
  LLM-stap in dit package zijn, geen Mastra-Supervisor-node.

### F.3 Reist retrieval-context nu mee naar de frontend?

**Nee — de payload is answer-only + geverifieerde citaties.** De `hits`/scores/`context` blijven
binnen de agent en gaan naar de Langfuse-trace (`agent.ts:44-106`), niet naar de client. De client
ziet alleen wat in `citations[]` en de antwoordtekst zit. `retrievalReport`/timings zijn eval- en
tracing-only.

### F.4 Kan een chip-generator draaien zónder de answer-generatie te wijzigen?

**Ja.** Reden: (1) de volledige retrieval-context (`retrieval.chunks`, `hits`, `context`) is nog in
scope ná de generatie in `answerStream`/`answer` (`agent.ts:279,296` resp. `:199`), dus een
losse stap kan die hergebruiken zonder de prompt of `registered.stream(...)`-call
(`agent.ts:299-309`) aan te raken; (2) chips zijn puur additief in de payload (een nieuw veld op het
`citations`- of een nieuw event), wat de bestaande answer-baseline-metrieken (faithfulness,
citation-correctness, refusal) niet raakt zolang de antwoordtekst ongemoeid blijft. Een deterministische
variant (chips uit `article`/`sourceRef` van buur-chunks) vergt zelfs geen extra LLM-call en blijft
soeverein by design.

---

## G. Intent router en confidence

### G.1 Status van de geplande intent router

**Bestaat niet — geen code, geen branch, geen plan-document.** Zoekpoging (`grep -i` op
`intent|out-of-scope|out_of_scope|router|confidence|meta`): treffers zijn uitsluitend niet-relevant
(`clarify.ts` heeft `SALARY_INTENT` als regex-naam; `rerank.ts`/`passage.ts` "confidence" over
vector-scores; `fund-selector.ts` "meta" is een woorddeel; audits/plannen). Geen
corpus/meta/clarification/out-of-scope-router. `OPEN` #6.

Wat er **wel** is als routing/confidence-vervangers:
- **Clarification-branch (deterministisch):** `detectClarification` (`packages/agents/src/cao/clarify.ts:43-56`)
  — vuurt alleen op onderspecificeerde salarisvragen. Bewust smal (`clarify.ts:10-13`).
- **Refusal-drempel (deterministisch):** de retrieval-drempel. Als geen chunk `minScore` haalt →
  `NOT_FOUND_MESSAGE` zonder LLM-call (`agent.ts:201-211, 281-294`).

### G.2 Waar wordt de refusal-drempel beslist en met welke waarde?

`minScore` default **0.35** in `caoQuestionSchema` (`packages/agents/src/types.ts:31`):

```ts
minScore: z.number().min(0).max(1).default(0.35),
```

Doorgegeven aan retrieval (`agent.ts:199,279` → `tools.ts:66-73` → `retrieve.ts:169` filtert
`hit.score >= minScore`). Let op: de retrieval-tool zelf heeft default `minScore: 0`
(`tools.ts:22`); de effectieve drempel voor de chat komt van de agent-input (0.35). `topK` default 5
(`types.ts:26`). Deze waarden zijn niet per fonds configureerbaar (hardcoded defaults).

### G.3 Minimale payload-wijziging voor confidence-banden

- **Nieuw veld op het `citations`-event** (`contract.ts:45-53` + `types.ts:88-97`), b.v.
  `confidence: z.enum(["high","medium","low"])` + `reason: z.string().optional()`. Eén bron van
  waarheid: uitbreiden in `chatEventSchema` én `CaoStreamEvent` (types afgeleid, `300-typescript.mdc`).
- **Herbruikbare bestaande velden:** `found` (`contract.ts:47`) → recovery/`low`; `citations.length`
  + `citationVerificationFailed` (`contract.ts:50`) → `high` (geverifieerde bron) vs `medium`
  (verificatie faalde); `needsClarification` (`contract.ts:48`) → hedge/clarify. De top-`score` uit
  `retrieval.hits` (`tools.ts:29`, nu server-only) kan een confidence-band voeden zonder nieuwe
  berekening. De drie confidence-UI-states uit het voorstel (verified badge / hedge banner / recovery
  card) mappen dus grotendeels op **bestaande** signalen; alleen "hedge" (medium) heeft geen eigen
  signaal en zou een drempel op de retrieval-score of een nieuwe agent-uitkomst vergen.

---

## H. Feedback en harvest-koppeling

### H.1 Huidige thumbs-implementatie

- **Component:** `apps/demo/components/chat/feedback.tsx:22-117` — duim omhoog/omlaag; bij "down" een
  set reden-chips (`REASON_CHIPS = ["bron klopt niet", "antwoord onvolledig", "verkeerde CAO"]`,
  `feedback.tsx:20`) + vrij tekstveld. Alleen getoond als `found === true && traceId !== null`
  (`message-list.tsx:71`).
- **Client-submit:** `useChat.sendFeedback` (`use-chat.ts:254-272`) → `POST /api/feedback` met
  `{ traceId, rating, reason? }`. Optimistische UI; best-effort (`use-chat.ts:257,267-269`).
- **Endpoint:** `apps/demo/app/api/feedback/route.ts:18-57`, Zod-contract
  (`apps/demo/app/api/feedback/contract.ts:8-17`, verbatim):

```ts
export const feedbackRequestSchema = z.object({
  traceId: z.string().min(1).max(200),
  rating: z.enum(["up", "down"]),
  reason: z.string().max(2000).optional(),
});
```

- **Opslag:** **géén eigen DB-tabel.** Feedback wordt als **Langfuse-score** op de trace geschreven
  (`route.ts:47-52` → `recordFeedbackScore`, `packages/agents/src/observability/feedback.ts:41-56`),
  via `POST /api/public/scores` (Basic auth, `feedback.ts:90-125`). Score-shape verbatim
  (`feedback.ts:20-29`):

```ts
export const feedbackScoreSchema = z.object({
  traceId: z.string().min(1),
  value: z.union([z.literal(0), z.literal(1)]),  // up=1, down=0 (BOOLEAN)
  comment: z.string().max(2000).optional(),
  name: z.string().min(1).max(200).default("user-feedback"),
});
```

  De tabel-schema's die wél bestaan (`documents`, `chunks`, `agentConfig`, `evalCases`,
  `packages/db/src/schema.ts`) bevatten géén feedback-tabel — bewust: feedback = Langfuse-data-plane.

### H.2 Voedt dit de harvest-feedback-pipeline?

**Ja.** `scripts/eval/harvest-feedback.ts:90-134` leest `name = "user-feedback"`-scores via de
Langfuse public API, houdt de thumbs-down (`value <= 0`, `:100`), haalt per trace de vraag+antwoord op
en schrijft `Candidate`-JSONL (`:38-45, 148-156`) voor **handmatige** review vóór opname in de golden
set (`:14-18, 156`). De reden-tekst uit de UI landt als `score.comment` → `Candidate.reason`
(`:131`). De lus (gebruik → data → eval → betere agent) is dus gesloten, met mens-in-de-loop.

### H.3 Wat is nodig voor de tweede dimensie (incorrect vs. incompleet) + escalatie-event

- **Tweede dimensie:** nu is er één binaire `rating` + vrije `reason`. De chips (`feedback.tsx:20`)
  benaderen dimensies al maar worden als vrije `reason` platgeslagen. Nodig:
  (a) `feedbackRequestSchema` (`contract.ts:8-17`) uitbreiden met b.v.
  `category: z.enum(["incorrect","incomplete"]).optional()`;
  (b) `feedbackScoreSchema` (`feedback.ts:20-29`) + `recordFeedbackScore` een tweede Langfuse-score
  laten schrijven (b.v. `name: "feedback-category"`), zodat harvest erop kan filteren;
  (c) `harvest-feedback.ts` (`SCORE_NAME`, `:21`) uitbreiden om de categorie mee te oogsten.
- **Escalatie-event ("stel deze vraag aan het fonds") als fixture-kandidaat:** past op dezelfde naad —
  een aparte score/naam (b.v. `"escalation"`) op de trace, of een nieuw veld in het harvested
  `Candidate`-record (`harvest-feedback.ts:38-45`). Er bestaat **nog geen** UI of endpoint voor
  escalatie; dit is nieuw, maar landt logisch op de bestaande feedback-endpoint + harvest-JSONL.
  `OPEN` #7.

---

## I. Eval-koppeling en baseline-risico

### I.1 Classificatie per voorstel-onderdeel (pipeline-touching vs. presentational)

| # | Onderdeel | Klasse | Bewijs-plek |
|---|---|---|---|
| 1 | Empty state: per-tenant startvragen + thema's | **Presentational** (config-data) | `fund-theme.ts:45-57`, `starters.tsx:14-32` — geen agent-output |
| 2 | Grounded follow-up chips uit retrieval-context | **Pipeline-touching**, maar **niet answer-baseline** (aparte post-answer-stap mogelijk, zie F.4) | `agent.ts:339-351`, `tools.ts:57-61` |
| 3 | Streaming met zichtbare verificatie-stappen | Grotendeels **presentational** + klein seam-veld; streaming bestaat al | `agent.ts:276-362`, `use-chat.ts:176-211` |
| 4 | Inline markers + ingeklapte bronkaarten + highlight | **Presentational** (bestaat al) | `markdown.tsx:37-72`, `citation.tsx:27-43,56` |
| 5 | Drie confidence-UI-states | **Pipeline-touching** (nieuw payload-veld) — hergebruikt bestaande signalen | `contract.ts:45-53`, `types.ts:88-97` |
| 6 | Deterministisch UI-pad voor derived calculations + escalatie | **Pipeline-touching** (nieuwe agent-branch, à la clarify) | `clarify.ts:43-56`, `agent.ts:184-196` |
| 7 | Tweetraps feedback + harvest-koppeling | **Presentational** + kleine backend (feedback-contract/observability), **niet answer-baseline** | `contract.ts:8-17`, `feedback.ts:20-29`, `harvest-feedback.ts` |

"Pipeline-touching maar niet answer-baseline" betekent: raakt de agent-seam/payload, maar verandert de
antwoordtekst/citaties niet, dus de Gate C-metrieken (faithfulness, citation-correctness, refusal)
bewegen niet zolang de generatie ongemoeid blijft.

### I.2 Welke gates toetsen de response-shape/citatie-payload, en breekt een payload-uitbreiding een gate?

De eval-gates leven in `packages/agents/src/evals/cao.eval.ts` (Gate A–D, `:887-943`):
- **Gate A** — prompt & clarify **contract** (offline, `:158-214`). Toetst prompt-strings + clarify;
  raakt de response-shape niet.
- **Gate B / B2** — retrieval recall + rerank + condensatie (`:329-583`). Geen response-shape.
- **Gate C** — answer-level (`:719-770`): o.a. `citationVerification ≥ 0.98`, `maxOrphanRate = 0`,
  `maxDanglingMarkerRate = 0` (`:112-117`). Deze toetsen **citatie-consistentie in de antwoordtekst**
  (markers ↔ geverifieerde citaties, via `orphanSourceRate`/`extractCitationMarkers`,
  `build-citations.ts:98-117`), niet het JSON-schema van de payload.
- **Gate D** — corpus-isolatie (`:779-819`).

**Breekt een payload-uitbreiding een gate?** Een **additief, optioneel** veld op `chatEventSchema`/
`CaoStreamEvent` (confidence, chips, verified-per-claim) breekt **geen** eval-gate: de gates draaien
op de agent-generatie en de citatie-logica, niet op het NDJSON-schema van `apps/demo`. Risico's:
(1) `chatEventSchema.parse` in de route (`route.ts:27`) faalt als een veld wordt ge-emit dat níet in
het schema staat — dus contract eerst uitbreiden; (2) een chip-generator die de antwoordtekst zou
herschrijven zou wél Gate C raken (vermijden: aparte stap). Er zijn **geen** frontend-/contract-tests
die op de exacte payload-shape asserten (zie J).

### I.3 E0 (branch protection) en E1 (temperature pin)

De terminologie "E0/E1" komt in de repo niet letterlijk voor als gate-namen (`grep` op `\bE0\b`/`\bE1\b`
levert alleen `EVAL_JUDGE_SAMPLES`/`EVAL_*`-env-namen). De bedoelde items staan in
`PLAN-eval-gates.md` als **P1** en **P3a**:
- **Branch protection / merge queue (P1):** de CI-kant staat (`merge_group`-trigger + `EVAL_REQUIRE_ALL`
  gezet op merge/push/nightly, `.github/workflows/ci.yml:9,63`), maar de **repo-setting is nog OPEN**:
  `PLAN-eval-gates.md:8-10,192-193` — "**Nog te doen in repo-settings:** `verify` als required check +
  merge queue aanzetten." Niet verifieerbaar vanuit de repo (`OPEN` #9).
- **Temperature/model pin (P3a):** temperature is gepind op **0** in één bron van waarheid
  (`packages/shared/src/config/generation.ts:17-20`, `GENERATION_CONFIG.temperature = 0`), gedeeld door
  productie (`agent.ts:214,301`) en eval (`cao.eval.ts:738`). Modellen zijn gepind
  (generator `mistral-small-2603`, `cao.eval.ts:78`; judge `mistral-large-2512`,
  `PLAN-eval-gates.md:199`). **Status: gedaan.**

---

## J. Constraints en conventies

- **`.cursor/rules` (relevant):** `000-core.mdc` (alle code Engels, `@wunderstack/*`, walking skeleton,
  soeverein-by-default, ask-before-adding), `100-stack.mdc` (Next 16, Mastra via naad, Mistral EU),
  `200-architecture.mdc` (pijl-regel apps→packages CI-afgedwongen; route-handlers dun; control-plane
  code vs data-plane data), `300-typescript.mdc` (strict, Zod op elke grens, types afleiden),
  `400-data-rag.mdc` (Drizzle enige DB-toegang; embeddings gepind), `500-agents.mdc` (Mastra achter
  naad; Supervisor niet AgentNetwork; Langfuse verplicht), `600-connectors.mdc` (airlock).
- **Lint/format:** ESLint 10 flat config (`eslint.config.mjs`), `typescript-eslint`; CI draait
  `typecheck`, `lint`, `depcruise` (arrow-rule, `.dependency-cruiser.cjs`), `test:unit`, `test`
  (`.github/workflows/ci.yml:36-64`). Root-scripts `package.json:9-14`.
- **Frontend-teststack:** **afwezig.** Er zijn géén component-/e2e-tests. De enige testbestanden zijn
  unit-tests in packages (`packages/agents/src/**/*.test.ts`, `packages/rag/src/rerank.test.ts` —
  gevonden via `find … -name '*.test.ts*'`). Geen Vitest/Jest/Playwright/Testing-Library in
  `apps/demo/package.json`. `OPEN` #10.
- **i18n:** géén i18n-framework; user-facing tekst is hardcoded Nederlands in componenten
  (`starters.tsx:17`, `message-list.tsx:29-41`, `composer.tsx:47`, `feedback.tsx`), agent-tekst in
  `prompt.ts`. `lang="nl"` op `<html>` (`layout.tsx:21`). Conform `000-core.mdc` (code Engels, UI-tekst
  Nederlands).
- **Responsive/mobile:** container `max-w-2xl`, `h-dvh`, bubbles `max-w-[85%]`
  (`chat.tsx:53`, `page.tsx:30`, `message-list.tsx:88`). Basaal responsive; geen aparte breakpoints.
- **A11y (aangetroffen):** focus-ring op `Button` (`button.tsx:7`, `focus-visible:ring-2`); `aria-live`
  op statusregel (`message-list.tsx:47`); `aria-expanded` op bronkaart-toggle (`citation.tsx:106`);
  `aria-label`/`aria-pressed` op feedback-knoppen (`feedback.tsx:55-72`); `aria-label` op verzendknop
  (`composer.tsx:53`); `sr-only` label op selector (`fund-selector.tsx:21`). **Gaten:** de inline
  marker-knoppen (`markdown.tsx:51-59`) hebben `title` maar geen `aria-label`; de textarea
  (`composer.tsx:42`) heeft geen zichtbaar/gekoppeld label (alleen placeholder); geen skip-links;
  contrast van `muted-foreground` niet geverifieerd. `OPEN` #11.
- **Security-context (voor v2 relevant):** nonce-CSP + `X-Frame-Options` per request in
  `apps/demo/proxy.ts:34-80` (widget mag framen via `WIDGET_ALLOWED_ORIGINS`); Markdown rendert geen
  rauwe HTML (`markdown.tsx:10-11`). Nieuwe UI mag geen inline `<script>` toevoegen buiten de nonce.

---

## K. Gereedheidsmatrix

Impact-inschatting is voor de UI-v2-implementatie (S = klein/lokaal, M = meerdere bestanden/naad,
L = nieuwe agent-/pipeline-stap of DB-lees-naad).

| # | Onderdeel | Bestaat al | Ontbreekt (concreet) | Impact | Pipeline-touching | Afhankelijkheden | Open vragen |
|---|---|---|---|---|---|---|---|
| 1 | Empty state: per-tenant startvragen + thema's | Starters + per-fonds theme (kleur/label/tagline/starters) — `starters.tsx`, `fund-theme.ts:45-57` | Curatie-bron los van code; koppeling startvraag→golden-id; rijkere thema's dan alleen `--primary` | S–M | Nee | `fund-theme.ts` of `agentConfig.config`; golden-ids (`golden-set.ts:40`) | #3 |
| 2 | Grounded follow-up chips | Volledige retrieval-metadata server-side (`tools.ts:57-61`) | Chip-generatiestap + payload-veld/event; client-render | M | Ja (niet answer-baseline) | `agent.ts:339-351`; contract-uitbreiding | #4, #5 |
| 3 | Streaming + zichtbare verificatie-stappen | Token-streaming + `status`-fasen + skeleton (`agent.ts:276-362`, `message-list.tsx:44-57`) | "verificatie"-fase als event; per-claim verified-signaal | S–M | Ja (klein seam-veld) | verify-resultaat uit `verifyAndBuild` (`agent.ts:113-128`) | — |
| 4 | Inline markers + ingeklapte kaarten + highlight | **Alles aanwezig** (`markdown.tsx:37-72`, `citation.tsx:27-43,56,132-148`) | Niets functioneels; evt. UX-polish | S | Nee | — | #2 (markers verdwijnen bij falende verificatie) |
| 5 | Drie confidence-UI-states | Signalen aanwezig: `found`, `citationVerificationFailed`, `needsClarification` (`contract.ts:47-50`) | `confidence`-veld in payload; UI-componenten (badge/banner/card); "medium/hedge" heeft geen bron | M | Ja | contract + `types.ts` uitbreiden; evt. score-drempel | #6, #8 |
| 6 | Deterministisch pad derived calculations + escalatie | Clarify-precedent (`clarify.ts`), tabellen als `chunkType="table"` (`schema.ts:65-67`) | Reken-/derivatie-branch + escalatie-endpoint/event | L | Ja | agent-branch; feedback/escalatie-naad | #7, #13 |
| 7 | Tweetraps feedback + harvest | Thumbs+reason → Langfuse-score → harvest (`feedback.tsx`, `feedback.ts`, `harvest-feedback.ts`) | `category`-dimensie + escalatie-score; harvest-uitbreiding | M | Nee (niet answer-baseline) | feedback-contract; `SCORE_NAME` in harvest | #7 |

### K.1 Genummerde OPEN-lijst

1. **Deploy-target binnen Scalingo.** Geen `Procfile`/`nixpacks`/`app.json` in de repo
   (`find -iname 'procfile*' …` → niets); wel een branch `fix/scalingo-deploy-boot`. *Vraag:* hoe/waar
   wordt `apps/demo` op Scalingo gebooten (buildpack, start-command, env), en staat de deploy-config in
   die branch of buiten de repo?
2. **"Default-uitgeklapte passages"-regressie niet reproduceerbaar.** `citation.tsx:56` is `useState(false)`
   in zowel `d5a5622` als `7bfba95`. *Vraag:* op welke branch/commit of lokale kopie is dit waargenomen —
   klopt de aanname nog, of is die al opgelost?
3. **Koppeling startvraag ↔ golden-set-entry.** Bestaat nu niet. *Vraag:* moet elke startvraag hard
   aan een `golden-set.jsonl`-`id` (`golden-set.ts:40`) gekoppeld worden, en zo ja: in de theme-config
   of in `agentConfig.config`?
4. **Chip-payload-vorm.** *Vraag:* worden chips een nieuw veld op het `citations`-event of een nieuw
   `chips`-event, en zijn ze deterministisch (uit `article`/`sourceRef`) of LLM-gegenereerd?
5. **Chip-bron.** *Vraag:* mogen chips uit buur-chunks komen (`fetchParentPassage`-window) of alleen uit
   de top-K getoonde citaties?
6. **Confidence-bandbepaling.** *Vraag:* welke drempels definiëren high/medium/low — hergebruik van
   `found`/`citationVerificationFailed`, of een expliciete retrieval-score-drempel (top-`hit.score`)?
7. **Escalatie-event.** Er is geen UI/endpoint voor "stel deze vraag aan het fonds". *Vraag:* landt dit
   als Langfuse-score op de bestaande trace, of als apart record — en wie reviewt de fixture-kandidaat?
8. **Rendering van `citationVerificationFailed`.** Signaal reist mee maar wordt nergens getoond
   (alleen `use-chat.ts:195`). *Vraag:* moet dit in v2 de "hedge banner" voeden?
9. **Branch protection / merge queue (P1).** CI-yaml staat klaar (`ci.yml:9,63`) maar de repo-setting
   ("`verify` required + merge queue aan") is niet vanuit de repo verifieerbaar
   (`PLAN-eval-gates.md:192-193`). *Vraag:* is dit inmiddels aangezet in GitHub?
10. **Frontend-teststack ontbreekt.** Geen component-/e2e-infra in `apps/demo`. *Vraag:* mag v2 een
    testrunner (Vitest + Testing-Library / Playwright) toevoegen — dit valt onder ask-before-adding
    (`000-core.mdc`)?
11. **A11y-gaten.** Marker-knoppen zonder `aria-label` (`markdown.tsx:51-59`), textarea zonder gekoppeld
    label (`composer.tsx:42`), contrast ongeverifieerd. *Vraag:* is er een a11y-lat (WCAG-niveau) voor v2?
12. **Dark mode.** `.dark`-tokens bestaan (`globals.css:40-51`) maar er is geen toggle/class-setter.
    *Vraag:* moet v2 dark mode activeren, en per-tenant?
13. **Derived calculations scope.** Tabellen worden als `chunkType="table"` bewaard (`schema.ts:65-67`)
    maar er is geen reken-/derivatie-logica. *Vraag:* welke berekeningen (loonschaal-lookup? pro-rata?)
    moeten deterministisch worden, en wat is de escalatie-drempel naar het fonds?

---

## Verificatie: `git status` (na aanmaken van dit rapport)

Uitsluitend `docs/audit/UI-AUDIT-v1.md` is toegevoegd; geen bestaand bestand gewijzigd.

```
On branch main
Your branch is up to date with 'origin/feat/phase-13-eval-rag-topk5'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	docs/audit/

nothing added to commit but untracked files present (use "git add" to track)
```

`git status --porcelain docs/` → `?? docs/audit/` (alleen de nieuwe map/rapport).
