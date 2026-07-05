/**
 * One-off generator for eval fixtures. Run from repo root:
 *   pnpm exec tsx packages/agents/scripts/build-golden-fixtures.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { caoLabeledPassages as passages, caoLabeledQueries as queries } from "@wunderstack/shared";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../src/evals/fixtures");

function parseArticle(source: string): string | undefined {
  const match = /Artikel\s+(\d+)/i.exec(source);
  return match?.[1];
}

const extraPassages = [
  {
    id: "loonschaal-fg1",
    source: "CAO Voorbeeldsector — Bijlage 1 (Salarisschalen, functiegroep I)",
    content:
      "Salarisschaal functiegroep I (bruto maandsalaris bij 38 uur per week):\n" +
      "Trede 1: € 2.450\nTrede 2: € 2.580\nTrede 3: € 2.710\nTrede 4: € 2.840\nTrede 5: € 2.970",
    article: "Bijlage 1",
    lid: undefined,
    chunkType: "table" as const,
  },
  {
    id: "loonschaal-fg3",
    source: "CAO Voorbeeldsector — Bijlage 1 (Salarisschalen, functiegroep III)",
    content:
      "Salarisschaal functiegroep III (bruto maandsalaris bij 38 uur per week):\n" +
      "Trede 1: € 3.100\nTrede 2: € 3.280\nTrede 3: € 3.460\nTrede 4: € 3.640\nTrede 5: € 3.820",
    article: "Bijlage 1",
    lid: undefined,
    chunkType: "table" as const,
  },
  {
    id: "uurloon-fg2",
    source: "CAO Voorbeeldsector — Bijlage 2 (Uurloontabel functiegroep II)",
    content:
      "Uurloon functiegroep II:\nTrede 1: € 14,20 per uur\nTrede 2: € 14,85 per uur\n" +
      "Trede 3: € 15,50 per uur\nTrede 4: € 16,15 per uur",
    article: "Bijlage 2",
    lid: undefined,
    chunkType: "table" as const,
  },
  {
    id: "adv-dagen",
    source: "CAO Voorbeeldsector — Artikel 14 (ADV-dagen)",
    content:
      "De werknemer met een voltijd dienstverband heeft recht op 13 ADV-dagen per kalenderjaar " +
      "met behoud van salaris. ADV-dagen worden in overleg met de leidinggevende ingepland en " +
      "kunnen niet worden uitbetaald.",
    article: "14",
    lid: undefined,
    chunkType: "text" as const,
  },
  {
    id: "werktijdenverkorting",
    source: "CAO Voorbeeldsector — Artikel 7 (Werktijdenverkorting)",
    content:
      "De werknemer heeft recht op 96 uur werktijdenverkorting (WTW) per kalenderjaar bij een " +
      "voltijd dienstverband van 38 uur per week. WTW-uren worden in overleg ingepland en tellen " +
      "mee als gewerkte uren voor loon en vakantie-opbouw.",
    article: "7",
    lid: undefined,
    chunkType: "text" as const,
  },
];

const allPassages = [
  ...passages.map((p) => ({
    id: p.id,
    source: p.source,
    content: p.content,
    article: parseArticle(p.source),
    lid: undefined,
    chunkType: "text" as const,
  })),
  ...extraPassages,
];

function summarizeReference(content: string): string {
  const firstSentence = content.split(/(?<=[.!?])\s+/)[0] ?? content;
  return firstSentence.length > 200 ? `${firstSentence.slice(0, 197)}...` : firstSentence;
}

const inScopeCases = queries.map((q) => {
  const passage = allPassages.find((p) => q.relevantPassageIds.includes(p.id));
  return {
    id: q.id,
    question: q.question,
    expectedPassageIds: q.relevantPassageIds,
    expectedArticle: passage?.article,
    expectedLid: passage?.lid,
    referenceAnswer: passage ? summarizeReference(passage.content) : "",
    category: "in_scope" as const,
  };
});

const extraInScope = [
  {
    id: "q-adv-dagen",
    question: "Hoeveel ADV-dagen heb ik per jaar?",
    expectedPassageIds: ["adv-dagen"],
    expectedArticle: "14",
    referenceAnswer: summarizeReference(extraPassages[3]!.content),
    category: "in_scope" as const,
  },
  {
    id: "q-wtw",
    question: "Hoeveel uur werktijdenverkorting krijg ik?",
    expectedPassageIds: ["werktijdenverkorting"],
    expectedArticle: "7",
    referenceAnswer: summarizeReference(extraPassages[4]!.content),
    category: "in_scope" as const,
  },
  {
    id: "q-vakantie-deeltijd",
    question: "Worden vakantiedagen naar rato berekend bij deeltijd?",
    expectedPassageIds: ["vakantiedagen"],
    expectedArticle: "12",
    referenceAnswer: "Bij een deeltijd dienstverband worden de vakantiedagen naar rato toegekend.",
    category: "in_scope" as const,
  },
  {
    id: "q-ort-zaterdag",
    question: "Welke onregelmatigheidstoeslag geldt op zaterdag?",
    expectedPassageIds: ["onregelmatigheid"],
    expectedArticle: "11",
    referenceAnswer: "Op zaterdag geldt een onregelmatigheidstoeslag van 45% over het uurloon.",
    category: "in_scope" as const,
  },
  {
    id: "q-scholing-weigeren",
    question: "Mag mijn werkgever een opleidingsaanvraag weigeren?",
    expectedPassageIds: ["scholing"],
    expectedArticle: "26",
    referenceAnswer:
      "Aanvragen worden binnen vier weken beoordeeld en mogen niet zonder gegronde reden worden geweigerd.",
    category: "in_scope" as const,
  },
  {
    id: "q-pensioen-inhouding",
    question: "Wordt mijn pensioenbijdrage ingehouden op het salaris?",
    expectedPassageIds: ["pensioen"],
    expectedArticle: "24",
    referenceAnswer: "Het werknemersdeel wordt maandelijks op het salaris ingehouden.",
    category: "in_scope" as const,
  },
  {
    id: "q-jubileum-40",
    question: "Wat krijg ik bij 40 jaar dienstverband?",
    expectedPassageIds: ["jubileum"],
    expectedArticle: "15",
    referenceAnswer:
      "Bij een dienstverband van 40 jaar bedraagt de jubileumuitkering een volledig bruto maandsalaris.",
    category: "in_scope" as const,
  },
  {
    id: "q-thuiswerk-vs-reis",
    question: "Krijg ik thuiswerkvergoeding én reiskosten op dezelfde dag?",
    expectedPassageIds: ["thuiswerk"],
    expectedArticle: "19",
    referenceAnswer:
      "Op een dag wordt of de reiskostenvergoeding of de thuiswerkvergoeding toegekend, niet beide.",
    category: "in_scope" as const,
  },
  {
    id: "q-opzeg-einde-maand",
    question: "Wanneer gaat een opzegging in?",
    expectedPassageIds: ["opzegtermijn"],
    expectedArticle: "5",
    referenceAnswer: "Opzegging geschiedt tegen het einde van de kalendermaand.",
    category: "in_scope" as const,
  },
  {
    id: "q-oo-loopbaanscan",
    question: "Kan ik een loopbaanscan aanvragen via het O&O-fonds?",
    expectedPassageIds: ["oo-fonds"],
    expectedArticle: "27",
    referenceAnswer: "Werknemers kunnen bij het fonds een aanvraag indienen voor een loopbaanscan.",
    category: "in_scope" as const,
  },
];

const tableCases = [
  {
    id: "q-loon-fg1-trede3",
    question: "Wat verdient iemand in functiegroep I, trede 3?",
    expectedPassageIds: ["loonschaal-fg1"],
    expectedArticle: "Bijlage 1",
    referenceAnswer: "Trede 3 in functiegroep I: € 2.710 bruto per maand bij 38 uur per week.",
    category: "table" as const,
  },
  {
    id: "q-loon-fg1-trede5",
    question: "Hoeveel is het bruto maandsalaris in functiegroep I op de hoogste trede?",
    expectedPassageIds: ["loonschaal-fg1"],
    expectedArticle: "Bijlage 1",
    referenceAnswer: "Trede 5 in functiegroep I: € 2.970 bruto per maand.",
    category: "table" as const,
  },
  {
    id: "q-loon-fg3-trede2",
    question: "Wat is het salaris in functiegroep III, trede 2?",
    expectedPassageIds: ["loonschaal-fg3"],
    expectedArticle: "Bijlage 1",
    referenceAnswer: "Trede 2 in functiegroep III: € 3.280 bruto per maand.",
    category: "table" as const,
  },
  {
    id: "q-loon-fg3-trede4",
    question: "Hoeveel verdient functiegroep III op trede 4?",
    expectedPassageIds: ["loonschaal-fg3"],
    expectedArticle: "Bijlage 1",
    referenceAnswer: "Trede 4 in functiegroep III: € 3.640 bruto per maand.",
    category: "table" as const,
  },
  {
    id: "q-uurloon-fg2-trede3",
    question: "Wat is het uurloon in functiegroep II, trede 3?",
    expectedPassageIds: ["uurloon-fg2"],
    expectedArticle: "Bijlage 2",
    referenceAnswer: "Trede 3 in functiegroep II: € 15,50 per uur.",
    category: "table" as const,
  },
  {
    id: "q-uurloon-fg2-trede1",
    question: "Hoeveel verdien ik per uur in functiegroep II op de laagste trede?",
    expectedPassageIds: ["uurloon-fg2"],
    expectedArticle: "Bijlage 2",
    referenceAnswer: "Trede 1 in functiegroep II: € 14,20 per uur.",
    category: "table" as const,
  },
  {
    id: "q-loon-vergelijk-fg",
    question: "Wat is het verschil tussen trede 1 in functiegroep I en functiegroep III?",
    expectedPassageIds: ["loonschaal-fg1", "loonschaal-fg3"],
    expectedArticle: "Bijlage 1",
    referenceAnswer:
      "Trede 1 functiegroep I: € 2.450; trede 1 functiegroep III: € 3.100 bruto per maand.",
    category: "table" as const,
  },
];

const refusalCases = [
  {
    id: "q-refusal-bouw",
    question: "Hoeveel vakantiedagen gelden in de bouwsector?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-netto",
    question: "Wat is mijn nettoloon na belasting?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-juridisch",
    question: "Mag mijn werkgever mij ontslaan zonder reden?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-zzp",
    question: "Gelden deze CAO-regels ook voor zzp'ers?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-minloon",
    question: "Wat is het wettelijk minimumloon dit jaar?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-werkloosheid",
    question: "Hoeveel WW krijg ik als ik ontslagen word?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-cao-bouw",
    question: "Wat staat er in de CAO voor de metaalsector over ploegentoeslag?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-persoonlijk",
    question: "Heb ik recht op meer salaris gezien mijn persoonlijke situatie?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-verzekering",
    question: "Welke zorgverzekering moet ik afsluiten via mijn werkgever?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
  {
    id: "q-refusal-2028",
    question: "Wat verandert er in 2028 aan de CAO?",
    expectedPassageIds: [] as string[],
    referenceAnswer:
      "Ik kan dit niet terugvinden in de CAO-documenten waar ik toegang toe heb. Neem voor zekerheid contact op met je fonds.",
    category: "refusal" as const,
  },
];

const allCases = [...inScopeCases, ...extraInScope, ...tableCases, ...refusalCases];

writeFileSync(
  join(fixturesDir, "golden-passages.jsonl"),
  `${allPassages.map((p) => JSON.stringify(p)).join("\n")}\n`,
);
writeFileSync(
  join(fixturesDir, "golden-set.jsonl"),
  `${allCases.map((c) => JSON.stringify(c)).join("\n")}\n`,
);

console.log(`Wrote ${String(allPassages.length)} passages and ${String(allCases.length)} golden cases.`);
