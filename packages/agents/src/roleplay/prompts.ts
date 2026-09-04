import type { RoleplayEndReason } from "@wunderstack/shared";

import type { RoleplayScenarioPrompt } from "./types";

/**
 * Roleplay prompts, ported from Qonvo (`src/lib/mastra/prompts.ts`), which in turn descend from its
 * n8n workflow. The Dutch text is the product; the structure is the tuning. Both are carried over
 * near-verbatim, because the wording is the accumulated result of real sessions and rewriting it for
 * style would silently discard that.
 *
 * Three deliberate departures, each because carrying the original over would import a defect:
 *
 * 1. **No voice block.** Qonvo appends text-to-speech formatting rules when `modality === "voice"`.
 *    v1 is text only, so the block is absent rather than dead. It returns with turn-based voice,
 *    where it belongs to the branch that can actually be heard.
 *
 * 2. **No didactic sections.** Qonvo feeds a learner's previous attempts back into both the persona
 *    and the reviewer. That needs a stable pseudonym per participant, which v1 does not have
 *    (DECISION-roleplay-agent.md, R3). Critically, Qonvo's review summary MANDATES a section headed
 *    "Hoe heeft de leerling vooruitgang geboekt ten opzichte van vorige pogingen?" — keeping that
 *    heading while supplying no history would force the model to invent progress. The section is
 *    removed, not left empty.
 *
 * 3. **The model no longer states the total.** Qonvo asks the model to compute `Σ(score × weight)`
 *    and to name that number in the summary. We compute the total ourselves (`rubric.ts`), so a
 *    model-computed figure in the prose would sooner or later contradict the grade sent to the
 *    customer's LMS. The model scores each criterion — a judgement — and is told not to quote a
 *    numeric total. Its holistic `isPassed` is still requested, but only as a second opinion; the
 *    stored pass/fail comes from the threshold.
 *
 * Any edit here needs a `ROLEPLAY_PROMPT_VERSION` bump (version.ts).
 */

const DEFAULT_END_CONDITION = "Als het gesprek klaar is";

function joinList(values: string[]): string {
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => `- ${value}`)
    .join("\n");
}

function section(value: string | undefined): string {
  return value?.trim() ? value.trim() : "";
}

function assemble(parts: string[]): string {
  return parts.filter((part) => part.length > 0).join("\n\n");
}

/** Shared language rules. Split out so the opening and the turn cannot drift apart. */
const DUTCH_LANGUAGE_RULES = [
  "- Spreek met Nederlands taalniveau 2F.",
  "- Schrijf grammaticaal correct en natuurlijk Nederlands. Let in het bijzonder op het verschil tussen 'hebben' en 'zijn', juiste werkwoordvervoegingen en lidwoorden. Geen letterlijke vertalingen uit andere talen.",
];

/* ------------------------------------------------------------------ opening */

/**
 * System prompt for the opening line. A lighter instruction set than a turn: no pitfalls, no
 * secondary objective, no closing logic — there is no conversation to steer yet.
 *
 * The hidden-information rule is stricter here than mid-conversation. An opening line that leaks the
 * subtext removes the entire exercise: the learner has nothing left to uncover.
 */
export function buildOpeningSystemPrompt(scenario: RoleplayScenarioPrompt): string {
  const hidden = section(scenario.hiddenInformation)
    ? `# Verborgen informatie\nDe volgende onderliggende informatie ken je wél, maar deel je NIET in je openingszin. De gebruiker moet hier zelf via doorvragen achter komen tijdens het gesprek. Houd de openingszin neutraal en realistisch — geef hooguit een subtiele hook dat er meer speelt, zonder de werkelijke reden prijs te geven:\n\n${scenario.hiddenInformation.trim()}`
    : "";

  const learning = section(scenario.learningObjective)
    ? `# Leerdoel van de gebruiker\nDe gebruiker gaat in dit gesprek oefenen met:\n${scenario.learningObjective.trim()}\n\nZorg dat je openingszin een natuurlijke situatie schetst waarin dit leerdoel geoefend kan worden.`
    : "";

  const instructions = [
    "# Instructies",
    "- Genereer een openingszin waarmee jij het gesprek start.",
    "- De zin moet passen bij jouw rol, de context, en jouw persona.",
    ...(section(scenario.openingLine)
      ? [`- Gebruik deze richtlijn als basis: ${scenario.openingLine.trim()}`]
      : []),
    "- Maak de zin natuurlijk en passend bij het scenario.",
    ...DUTCH_LANGUAGE_RULES,
    "- Antwoord alleen met wat de persoon uit het Persona zou zeggen.",
    "- Hallucineer niet.",
  ].join("\n");

  return assemble([
    `# Rol\nJij bent ${scenario.partnerRole}.`,
    section(scenario.contextDescription)
      ? `# Context\n${scenario.contextDescription.trim()}`
      : "",
    hidden,
    learning,
    instructions,
    section(scenario.persona) ? `## Persona\n${scenario.persona.trim()}` : "",
    section(scenario.difficulty?.conversationPrompt)
      ? `## Moeilijkheidsgraad\n${scenario.difficulty?.conversationPrompt.trim() ?? ""}`
      : "",
    `# Output\nGeef je openingszin terug als JSON:\n{ "text": "Je openingszin hier." }`,
  ]);
}

export function buildOpeningUserMessage(scenario: RoleplayScenarioPrompt): string {
  return `Genereer je openingszin als ${scenario.partnerRole}.`;
}

/* --------------------------------------------------------------------- turn */

/**
 * System prompt for one conversation turn.
 *
 * `isClosingTurn` flips the persona from "keep the conversation going" to "wrap it up and commit to
 * an outcome". Without it a session that hits its turn budget simply stops mid-exchange, which reads
 * as a bug to the learner and gives the reviewer no ending to judge.
 */
export function buildTurnSystemPrompt(
  scenario: RoleplayScenarioPrompt,
  isClosingTurn: boolean,
): string {
  const hidden = section(scenario.hiddenInformation)
    ? `# Verborgen informatie\nDe volgende onderliggende informatie ken je wél, maar deel je NIET ongevraagd. Wacht tot de gebruiker er gericht naar doorvraagt of het zelf ontdekt. Houd je antwoorden consistent met deze waarheid zonder hem prijs te geven:\n\n${scenario.hiddenInformation.trim()}`
    : "";

  const learning = section(scenario.learningObjective)
    ? `# Leerdoel van de gebruiker\nDe gebruiker oefent in dit gesprek het volgende leerdoel:\n${scenario.learningObjective.trim()}${
        section(scenario.secondaryObjective)
          ? `\n\nSubdoel: ${scenario.secondaryObjective.trim()}`
          : ""
      }\n\nSpeel het gesprek zo dat de gebruiker natuurlijk de kans krijgt om dit leerdoel te oefenen. Dwing geen onnatuurlijke situaties af, maar creëer wel ruimte waarin dit gedrag relevant wordt.`
    : "";

  const pitfalls = joinList(scenario.commonPitfalls);
  const pitfallsBlock = pitfalls
    ? `# Valkuilen om uit te lokken\nDe onderstaande veelgemaakte fouten zijn typisch voor dit leerdoel. Reageer op zo'n manier dat de gebruiker uitgedaagd wordt om deze valkuilen te vermijden (maar benoem ze niet expliciet):\n${pitfalls}`
    : "";

  const instructions = [
    "# Instructies",
    "- Leef je in in jouw rol zoals beschreven in het onderstaande Persona.",
    `- Antwoord alleen met wat de persoon uit het Persona zou zeggen. Dus zonder "Klant: " of andere toevoegingen!`,
    ...DUTCH_LANGUAGE_RULES,
    `- ${section(scenario.endCondition) || DEFAULT_END_CONDITION}, beeindig je het gesprek met "conversationEnd": true.`,
    "- Hallucineer niet.",
    ...(section(scenario.instructions) ? [scenario.instructions.trim()] : []),
  ].join("\n");

  const closing = isClosingTurn
    ? `## Jouw taak nu: het gesprek beëindigen!\n**Belangrijk:** Het gesprek is NU afgelopen. Je stelt dus geen nieuwe vragen meer!\nEvalueer het gesprek en kies een passende manier om het gesprek mee af te sluiten:\n- Je gaat ervoor.\n- Je geeft aan dat je er nog over moet nadenken en later terugkomt.\n- Je doet het niet.\n\nBeëindig dus het gesprek met 'conversationEnd: true'. Daarbij geef je jouw laatste reactie om het gesprek op een passende manier mee af te ronden.`
    : "";

  return assemble([
    `# Rol\nJij bent ${scenario.partnerRole}. De gebruiker is ${scenario.userRole}.`,
    section(scenario.contextDescription)
      ? `# Context van dit gesprek\n${scenario.contextDescription.trim()}`
      : "",
    hidden,
    learning,
    pitfallsBlock,
    instructions,
    closing,
    section(scenario.persona) ? `## Persona\n${scenario.persona.trim()}` : "",
    section(scenario.difficulty?.conversationPrompt)
      ? `## Moeilijkheidsgraad\n${scenario.difficulty?.conversationPrompt.trim() ?? ""}`
      : "",
    `# Output\nJouw output is een JSON met twee variabelen:\n1. "text": Dit is de tekst van jouw reactie als ${scenario.partnerRole}.\n2. "conversationEnd": boolean (false tijdens gesprek, true bij laatste bericht).`,
  ]);
}

/** The learner's line, labelled and quoted so the persona cannot mistake it for an instruction. */
export function buildTurnUserMessage(
  scenario: RoleplayScenarioPrompt,
  message: string,
  formattedHistory: string,
): string {
  const current = `${scenario.userTitle}: "${message}"`;
  return formattedHistory
    ? `Gesprekshistorie (laatste beurten):\n${formattedHistory}\n\n${current}`
    : current;
}

/* ------------------------------------------------------------------- review */

/**
 * The invariant half of the reviewer's instructions. Never assembled from scenario data, so a
 * scenario author cannot weaken the scoring contract from the authoring UI.
 */
const REVIEW_FIXED_INSTRUCTIONS = `## Schrijfstijl
- Schrijf ALLE feedback in genderneutrale taal.
- Gebruik GEEN voornaamwoorden zoals "hij", "zij", "hem", "haar" of "zijn/haar" om de gebruiker aan te duiden.
- Spreek de gebruiker direct aan met "je" of verwijs naar de rol.
- Vermijd ook geslachtsgebonden aannames in beschrijvingen.

## Te negeren aspecten (verplicht)
- Beoordeel **niet** op grammatica, spelling, interpunctie of typefouten.
- Negeer ook hoofdlettergebruik, autocorrect-fouten en stijl-/taalfouten in het taalgebruik van de gebruiker.
- Deze aspecten tellen op géén enkele manier mee in de score, in het oordeel per criterium, of in de \`feedbackSummary\`.
- Benoem taalfouten ook niet als verbeterpunt of opmerking in de feedback.
- Beoordeel uitsluitend op de inhoud, gespreksvaardigheid en de meegegeven rubric-criteria.

## Leerdoel en observeerbaar gedrag (verplicht meewegen)
- Als er een leerdoel is meegegeven (zie user message), is dat het primaire referentiepunt voor je beoordeling.
- Weeg expliciet mee of de deelnemer het gedrag heeft laten zien dat bij dit leerdoel past. Verwijs in je feedback naar de observeerbare gedragingen per criterium en benoem welke wel/niet zichtbaar waren in het transcript.
- Als één of meer van de valkuilen zichtbaar zijn in het gesprek, benoem deze expliciet met een voorbeeld uit het transcript en leg kort uit hoe het anders kon.
- Laat dit leerdoel terugkomen in zowel \`feedbackSummary\` als in de relevante \`feedback\`-items, maar verzin geen extra rubric-criteria.

## Verborgen informatie (alleen meewegen als aangeleverd)
- Wanneer de user message een sectie "Verborgen informatie die de persona kende" bevat, is dat onderliggende kennis die de leerling alléén via gericht doorvragen kon ontdekken.
- Beoordeel of de leerling deze onderlaag heeft blootgelegd. Concrete signalen: open vragen die naar de werkelijke reden peilen, doorvragen op weerstand, samenvattingen die het verborgen probleem benoemen.
- Verzin geen verborgen informatie als die niet expliciet is meegegeven — laat dit punt dan volledig buiten de feedback.

## Rubric-criteria (verplicht te volgen)
- Beoordeel het gesprek UITSLUITEND aan de hand van de criteria in de user message.
- Je \`feedback\` array MOET exact evenveel items bevatten als er criteria zijn.
- Voor elke index \`i\`: \`feedback[i].question\` MOET WOORD-VOOR-WOORD gelijk zijn aan het i-de criterium.
- \`feedback[i].answer\` bevat de inhoudelijke feedback op dat specifieke criterium, met concrete voorbeelden uit het gesprek.
- Behandel de criteria in dezelfde volgorde als in de user message.
- Gebruik de toelichting per criterium alleen als interpretatiehulp (niet als \`question\`).
- Gebruik de meegegeven gedragsindicatoren per criterium als concreet referentiekader voor het beoordelen.

## Scores per criterium (verplicht)
- Geef voor elk criterium een score tussen 0 en 10 in \`feedback[i].score\` EN in \`scores[i].score\`, gebaseerd op hoe goed de deelnemer dit criterium heeft gedemonstreerd (0 = helemaal niet, 10 = uitmuntend).
- Weeg observeerbare gedragingen (als die zijn meegegeven) expliciet mee in de score.
- Vul ook een top-level \`scores\` array: één object per criterium met \`{ "criterion": "<letterlijke question>", "score": <0-10> }\`, in dezelfde volgorde als de criteria.

## Totaalscore — NIET zelf berekenen
- Bereken GEEN gewogen totaalscore en noem GEEN cijfermatig eindcijfer in je antwoord.
- De weging wordt buiten dit model toegepast; een door jou berekend totaal zou daarmee in tegenspraak kunnen raken.
- Noem in \`feedbackSummary\` dus geen getal als eindoordeel. Beschrijf het niveau in woorden.
- Geef in \`isPassed\` wél je eigen inhoudelijke oordeel of de deelnemer geslaagd is. Dit telt als tweede mening naast de gewogen score en bepaalt niet zelf de uitslag.

## Samenvatting (\`feedbackSummary\`) — VERPLICHT
\`feedbackSummary\` is een markdown-string met een algemene beoordeling BOVEN de criteria. Dit veld MAG NOOIT leeg zijn.

Gebruik exact de volgende twee secties, in deze volgorde:
1. Een openingsparagraaf van 2-5 zinnen met de algemene indruk van het gesprek (zonder kopje erboven). Koppel dit aan het leerdoel als dat is meegegeven. Geen cijfers.
2. Een sectie met kop \`### Was dit een goed gesprek of niet?\` gevolgd door 2-4 zinnen met expliciet oordeel, onderbouwd met de zwaarst wegende criteria.

Regels voor \`feedbackSummary\`:
- Gebruik alleen \`### \` (H3) kopjes voor de vaste sectie. Geen bullets of nummering.
- Spreek de deelnemer consequent aan met "je".
- Scheid secties binnen de string met \`\\n\\n\` (dubbele newline).

# Output
Geef de feedback terug in het onderstaande JSON-format:
{"feedback":[{"question":"Letterlijke rubric-vraag","answer":"Feedback op dat criterium","score":7}],"feedbackSummary":"...","scores":[{"criterion":"Letterlijke rubric-vraag","score":7}],"isPassed":true}

## Output regels:
- Genereer ALLEEN de onbewerkte (raw) JSON-string.
- Gebruik GEEN markdown-opmaak BUITEN het \`feedbackSummary\`-veld.
- Voeg geen extra tekst, uitleg of verontschuldigingen toe.`;

/**
 * How the conversation ended changes what a fair judgement looks like. A learner who ran out of
 * turns did not choose to stop, and scoring an unfinished conversation as if it were finished
 * punishes them for the budget.
 */
function endReasonNote(endReason: RoleplayEndReason): string {
  switch (endReason) {
    case "abandoned":
      return "**Let op:** Het gesprek is voortijdig afgebroken. Begin de `feedbackSummary` met erkenning daarvan en beoordeel alleen wat tot nu toe zichtbaar was.";
    case "max_turns_reached":
      return "**Let op:** Het gesprek eindigde door het maximum aantal beurten te bereiken. Reken het de deelnemer niet aan dat het gesprek niet is uitgepraat.";
    case "completed":
      return "";
  }
}

export function buildReviewSystemPrompt(
  scenario: RoleplayScenarioPrompt,
  endReason: RoleplayEndReason,
): string {
  const note = endReasonNote(endReason);
  const difficulty = section(scenario.difficulty?.reviewPrompt);

  return assemble([
    section(scenario.rubric.reviewPrompt),
    difficulty ? `## Moeilijkheidsgraad\n${difficulty}` : "",
    note,
    REVIEW_FIXED_INSTRUCTIONS,
  ]);
}

/**
 * The corrective turn after a response that would not parse. All three branches use it.
 *
 * Measured need, not defensive habit. Two nulmeting runs produced two different failures: a review
 * that came back as malformed JSON (at 968-1254 output tokens against a 4000 ceiling, so the model
 * mis-emitting rather than the ceiling truncating) and a turn that came back empty. Both cost a
 * learner something real — R4's outbox retries delivery, not generation, and under R9 a turn is
 * already spent when the claim succeeds, so a failed generation is a beurt the learner paid for and
 * did not get.
 *
 * The ORIGINAL user message is repeated in full. An earlier version sent only the correction, which
 * silently dropped the transcript from the reviewer's context — a model asked to "give the same
 * judgement again" without the conversation in front of it will invent one.
 */
export function buildJsonRetryUserMessage(
  originalUser: string,
  previous: string,
  reason: string,
): string {
  const trimmed = previous.trim();
  return [
    originalUser,
    "",
    "---",
    "",
    "Je vorige antwoord kon niet worden gelezen als JSON.",
    `Reden: ${reason}`,
    trimmed.length === 0 ? "Je vorige antwoord was leeg." : `Je vorige antwoord was:\n${trimmed}`,
    "",
    "Geef exact hetzelfde antwoord opnieuw, nu als één geldig JSON-object volgens het afgesproken",
    "format hierboven. Geen markdown-codeblok, geen tekst ervoor of erna. Verander de inhoud van je",
    "antwoord niet — alleen de opmaak.",
  ].join("\n");
}

/**
 * Criteria, context and transcript for the reviewer.
 *
 * Weights are stated as percentages so the model can prioritise its attention, even though it is
 * told not to compute the total: knowing which criterion carries 40% and which carries 5% changes
 * how carefully each is judged.
 */
export function buildReviewUserMessage(
  scenario: RoleplayScenarioPrompt,
  transcriptJson: string,
): string {
  const criteria = scenario.rubric.criteria
    .map((criterion, index) => {
      const indicators =
        criterion.behavioralIndicators.length > 0
          ? `\n   Gedragsindicatoren om op te letten:\n     - ${criterion.behavioralIndicators.join("\n     - ")}`
          : "";
      return (
        `${String(index + 1)}. "${criterion.question}" (weging: ${String(criterion.weight)}%)\n` +
        `   Toelichting: ${criterion.description || "(geen toelichting)"}${indicators}`
      );
    })
    .join("\n\n");

  const pitfalls = joinList(scenario.commonPitfalls);

  return assemble([
    `# Te beoordelen rubric-criteria (gebruik deze \`question\`-strings letterlijk en in deze volgorde)\n${criteria}`,
    `# Geslaagd-drempel\nEen deelnemer is geslaagd bij een gewogen totaalscore van minimaal ${String(scenario.rubric.passThreshold)} / 10. Deze drempel wordt buiten dit model toegepast; gebruik hem alleen als ijkpunt voor je eigen inhoudelijke oordeel in \`isPassed\`.`,
    section(scenario.learningObjective)
      ? `# Leerdoel van deze oefening\n${scenario.learningObjective.trim()}${
          section(scenario.secondaryObjective)
            ? `\n\nSubdoel: ${scenario.secondaryObjective.trim()}`
            : ""
        }`
      : "",
    pitfalls
      ? `# Veelgemaakte fouten bij dit leerdoel (benoem expliciet in de feedback als ze voorkomen)\n${pitfalls}`
      : "",
    section(scenario.hiddenInformation)
      ? `# Verborgen informatie die de persona kende\nTijdens het gesprek had de persona deze onderliggende informatie die alleen via gericht doorvragen ontdekt kon worden:\n\n${scenario.hiddenInformation.trim()}\n\nWeeg expliciet mee of de leerling deze onderlaag heeft blootgelegd. Een leerling die hier nooit naar heeft doorgevraagd verdient op criteria rond doorvragen, empathie en analyseren een lagere score, ook als het gesprek oppervlakkig vlot verliep.`
      : "",
    `# Gesprek transcript ("human" = gebruiker, "ai" = ${scenario.partnerRole})\n${transcriptJson}`,
  ]);
}
