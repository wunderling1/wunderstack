import type { CaoAnswer } from "@wunderstack/agents";

import {
  askCaoCitationSchema,
  askCaoInputSchema,
  askCaoOutputSchema,
  corpusVersionsFromCitations,
  toAskCaoCitation,
  type AskCaoInput,
  type AskCaoOutput,
} from "./mcp-ask-cao.js";

export const ASK_ARBO_TOOL_NAME = "ask_arbo";

export const ASK_ARBO_TOOL_DESCRIPTION =
  "Beantwoordt vragen over de sectorale arbocatalogus van deze fondsinstance. " +
  "Roep de tool aan met alleen de gebruikersvraag — het fonds en de agent zijn server-side bepaald. " +
  "Geeft een compleet antwoord met bronverwijzingen [n]. Geef het antwoord ongewijzigd door aan de gebruiker.";

export const ASK_ARBO_ERROR_MESSAGE =
  "De arbocatalogus-agent kon deze vraag nu niet beantwoorden door een technische fout. " +
  "Verzin geen antwoord uit eigen kennis. Verwijs de gebruiker door naar het fonds.";

export const askArboInputSchema = askCaoInputSchema;
export type AskArboInput = AskCaoInput;
export const askArboOutputSchema = askCaoOutputSchema;
export type AskArboOutput = AskCaoOutput;

export function toAskArboOutput(result: CaoAnswer): AskArboOutput {
  const citations = result.citations.map(toAskCaoCitation);
  return askArboOutputSchema.parse({
    answer: result.answer,
    found: result.found,
    citations,
    corpus_versions: corpusVersionsFromCitations(citations),
    trace_id: result.traceId,
  });
}

export function askArboSuccessResult(output: AskArboOutput) {
  return {
    content: [{ type: "text" as const, text: output.answer }],
    structuredContent: output,
  };
}

export function askArboErrorResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
    structuredContent: askArboOutputSchema.parse({
      answer: message,
      found: false,
      citations: [],
      corpus_versions: [],
      trace_id: null,
    }),
  };
}

export { askCaoCitationSchema as askArboCitationSchema };
