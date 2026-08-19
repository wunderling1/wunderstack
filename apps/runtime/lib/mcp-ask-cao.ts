import type { CaoAnswer, CaoCitation } from "@wunderstack/agents";
import { z } from "zod";

/**
 * ask_cao tool contracts and render helpers (PLAN-mcp-server M9).
 *
 * MCP hosts feed `content` to the model; `structuredContent` is machine-oriented and often NOT
 * forwarded. The rendered text block therefore includes the answer AND a sources list so `[n]`
 * markers remain meaningful after relay.
 */

export const ASK_CAO_TOOL_NAME = "ask_cao";

export const ASK_CAO_TOOL_DESCRIPTION =
  "Beantwoordt vragen over de CAO van deze fondsinstance op basis van de officiële CAO-tekst. " +
  "Roep de tool aan met alleen de gebruikersvraag — vraag de gebruiker niet welk fonds, " +
  "en verzin geen fondsnaam of fondsparameter. Het fonds is server-side al bepaald. " +
  "Geeft een compleet antwoord terug met bronverwijzingen [n] en bijbehorende citaten. " +
  "Geef het antwoord ongewijzigd weer aan de gebruiker: niet herschrijven, niet samenvatten, " +
  "geen bronverwijzingen weglaten en geen eigen kennis toevoegen.";

export const ASK_CAO_ERROR_MESSAGE =
  "De CAO-agent kon deze vraag nu niet beantwoorden door een technische fout. " +
  "Verzin geen antwoord uit eigen kennis en voeg geen CAO-inhoud toe. " +
  "Verwijs de gebruiker door naar het fonds voor zekerheid.";

/**
 * MCP input is question-only. Fund scope is resolved server-side from the instance allowlist /
 * tenant default — hosts invent wrong free-text fund names ("OFED", "elektronische detailhandel")
 * when the parameter is exposed.
 */
export const askCaoInputSchema = z.object({
  question: z.string().min(1).max(2000),
});

export type AskCaoInput = z.infer<typeof askCaoInputSchema>;

export const askCaoCitationSchema = z.object({
  ref: z.number().int().positive(),
  title: z.string(),
  sourceUri: z.string(),
  fund: z.string(),
  version: z.string(),
  quote: z.string(),
  sourceRef: z.string().nullable(),
  heading: z.string().nullable(),
});

export const askCaoOutputSchema = z.object({
  answer: z.string(),
  found: z.boolean(),
  citations: z.array(askCaoCitationSchema),
  /** Distinct document versions cited in this answer; empty on refusal. */
  corpus_versions: z.array(z.string()),
  trace_id: z.string().nullable(),
});

export type AskCaoOutput = z.infer<typeof askCaoOutputSchema>;

export function corpusVersionsFromCitations(citations: ReadonlyArray<{ version: string }>): string[] {
  return [...new Set(citations.map((citation) => citation.version))];
}

export function toAskCaoCitation(citation: CaoCitation): z.infer<typeof askCaoCitationSchema> {
  return {
    ref: citation.ref,
    title: citation.title,
    sourceUri: citation.sourceUri,
    fund: citation.fund,
    version: citation.version,
    quote: citation.quote,
    sourceRef: citation.sourceRef,
    heading: citation.heading,
  };
}

export function toAskCaoOutput(result: CaoAnswer): AskCaoOutput {
  const citations = result.citations.map(toAskCaoCitation);
  return askCaoOutputSchema.parse({
    answer: result.answer,
    found: result.found,
    citations,
    corpus_versions: corpusVersionsFromCitations(citations),
    trace_id: result.traceId,
  });
}

function formatSourceLine(citation: z.infer<typeof askCaoCitationSchema>): string {
  const anchor = citation.sourceRef ?? citation.heading ?? citation.title;
  return `[${String(citation.ref)}] ${anchor} (v${citation.version}): "${citation.quote}"`;
}

/**
 * Model-facing text: answer prose plus a rendered sources block so `[n]` markers stay grounded
 * after the host relays the tool output (M9).
 */
export function renderAskCaoText(output: AskCaoOutput): string {
  if (output.citations.length === 0) {
    return output.answer;
  }
  const sources = output.citations.map(formatSourceLine).join("\n");
  return `${output.answer}\n\nBronnen:\n${sources}`;
}

export function askCaoSuccessResult(output: AskCaoOutput): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: AskCaoOutput;
} {
  return {
    content: [{ type: "text", text: renderAskCaoText(output) }],
    structuredContent: output,
  };
}

export function askCaoErrorResult(message: string = ASK_CAO_ERROR_MESSAGE): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
