/**
 * Bake-off dataset — representative Dutch CAO passages + a hand-labeled
 * question -> correct-passage set.
 *
 * IMPORTANT: these passages are representative, authentic-style CAO fragments written
 * as a *seed* so the bake-off harness is runnable and reproducible today. They are NOT a
 * specific fund's CAO. Before the bake-off result is treated as final for a fund, replace
 * or extend `passages` with that fund's real CAO text and expand `queries` accordingly.
 * The measured winner is only as representative as this corpus (see results.md).
 *
 * The labeled set doubles as the seed of the eval-suite (Fase 8), per PLAN.md.
 *
 * Language note: the CAO content and questions are Dutch on purpose — the whole point of
 * the bake-off is semantic recall on real Dutch legal/CAO phrasing. Code and identifiers
 * stay English per .cursor/rules/000-core.mdc.
 */

export interface CaoPassage {
  /** Stable id used as the label target in queries. */
  id: string;
  /** Human-readable source: (fictional but realistic) CAO name + article reference. */
  source: string;
  /** The CAO text fragment (Dutch). */
  content: string;
}

export interface LabeledQuery {
  id: string;
  /** A Dutch end-user question, deliberately paraphrased (not verbatim from the passage). */
  question: string;
  /** Ids of the passage(s) that actually answer the question. Usually exactly one. */
  relevantPassageIds: string[];
}

export const passages: CaoPassage[] = [
  {
    id: "proeftijd",
    source: "CAO Voorbeeldsector — Artikel 3 (Proeftijd)",
    content:
      "Bij een arbeidsovereenkomst voor bepaalde tijd van zes maanden of korter kan geen " +
      "proeftijd worden overeengekomen. Bij een contract van langer dan zes maanden en korter " +
      "dan twee jaar bedraagt de proeftijd maximaal één maand. Bij een arbeidsovereenkomst voor " +
      "onbepaalde tijd is de proeftijd ten hoogste twee maanden. De proeftijd wordt schriftelijk " +
      "vastgelegd en geldt voor beide partijen gelijk.",
  },
  {
    id: "opzegtermijn",
    source: "CAO Voorbeeldsector — Artikel 5 (Opzegtermijn)",
    content:
      "De werknemer neemt bij opzegging een opzegtermijn van één maand in acht. Voor de werkgever " +
      "geldt een opzegtermijn die afhankelijk is van de duur van het dienstverband: één maand bij " +
      "een dienstverband korter dan vijf jaar, twee maanden bij vijf tot tien jaar, drie maanden " +
      "bij tien tot vijftien jaar en vier maanden bij een dienstverband van vijftien jaar of langer. " +
      "Opzegging geschiedt tegen het einde van de kalendermaand.",
  },
  {
    id: "vakantiedagen",
    source: "CAO Voorbeeldsector — Artikel 12 (Vakantie)",
    content:
      "De werknemer met een voltijd dienstverband heeft per kalenderjaar recht op 25 vakantiedagen " +
      "met behoud van salaris, bestaande uit 20 wettelijke en 5 bovenwettelijke dagen. Bij een " +
      "deeltijd dienstverband worden de vakantiedagen naar rato toegekend. Niet-opgenomen " +
      "bovenwettelijke dagen kunnen tot maximaal het einde van het volgende kalenderjaar worden " +
      "meegenomen.",
  },
  {
    id: "vakantietoeslag",
    source: "CAO Voorbeeldsector — Artikel 13 (Vakantietoeslag)",
    content:
      "De werknemer ontvangt een vakantietoeslag van 8% van het over het vakantiejaar verdiende " +
      "brutosalaris. De vakantietoeslag wordt jaarlijks in de maand mei uitbetaald. Het vakantiejaar " +
      "loopt van 1 juni tot en met 31 mei.",
  },
  {
    id: "arbeidsduur",
    source: "CAO Voorbeeldsector — Artikel 8 (Arbeidsduur)",
    content:
      "De gemiddelde arbeidsduur bedraagt bij een voltijd dienstverband 38 uur per week, gerekend " +
      "over een periode van een jaar. De normale dagelijkse werktijd ligt tussen 07.00 en 19.00 uur. " +
      "Afwijkende werktijden worden in overleg met de ondernemingsraad vastgesteld.",
  },
  {
    id: "overwerk",
    source: "CAO Voorbeeldsector — Artikel 9 (Overwerk)",
    content:
      "Van overwerk is sprake wanneer in opdracht van de werkgever meer wordt gewerkt dan de " +
      "vastgestelde arbeidsduur. Over de eerste twee overuren per dag geldt een toeslag van 25% " +
      "op het uurloon; over de daaropvolgende uren en over overwerk op zaterdag geldt 50%. Voor " +
      "overwerk op zon- en feestdagen bedraagt de toeslag 100%.",
  },
  {
    id: "ploegentoeslag",
    source: "CAO Voorbeeldsector — Artikel 10 (Ploegendienst)",
    content:
      "De werknemer die in een tweeploegendienst werkt ontvangt een ploegentoeslag van 13% van het " +
      "maandsalaris. Bij een drieploegendienst bedraagt de toeslag 19%. De toeslag wordt maandelijks " +
      "samen met het salaris uitbetaald en telt mee voor de berekening van de vakantietoeslag.",
  },
  {
    id: "onregelmatigheid",
    source: "CAO Voorbeeldsector — Artikel 11 (Onregelmatige dienst)",
    content:
      "Voor werk op onregelmatige tijden geldt een onregelmatigheidstoeslag over het uurloon: 20% " +
      "voor uren op maandag tot en met vrijdag tussen 20.00 en 24.00 uur, 40% voor uren tussen 00.00 " +
      "en 07.00 uur, 45% op zaterdag en 60% op zon- en feestdagen. De toeslag wordt niet gestapeld " +
      "met de overwerktoeslag; het hoogste percentage is van toepassing.",
  },
  {
    id: "reiskosten",
    source: "CAO Voorbeeldsector — Artikel 18 (Reiskostenvergoeding)",
    content:
      "De werknemer ontvangt voor woon-werkverkeer een reiskostenvergoeding van € 0,23 per kilometer, " +
      "over de enkele reisafstand met een maximum van 40 kilometer per enkele reis. De vergoeding " +
      "wordt niet uitbetaald over dagen waarop thuis of op een andere locatie zonder reisbeweging " +
      "wordt gewerkt.",
  },
  {
    id: "thuiswerk",
    source: "CAO Voorbeeldsector — Artikel 19 (Thuiswerkvergoeding)",
    content:
      "Voor elke dag waarop de werknemer in overleg met de werkgever geheel of grotendeels thuiswerkt, " +
      "geldt een onbelaste thuiswerkvergoeding van € 2,35 per dag ter dekking van kosten voor koffie, " +
      "verwarming en elektriciteit. Op een dag wordt of de reiskostenvergoeding of de " +
      "thuiswerkvergoeding toegekend, niet beide.",
  },
  {
    id: "loondoorbetaling-ziekte",
    source: "CAO Voorbeeldsector — Artikel 22 (Loondoorbetaling bij ziekte)",
    content:
      "Bij arbeidsongeschiktheid wegens ziekte behoudt de werknemer gedurende de eerste 52 weken " +
      "100% van het salaris en gedurende de daaropvolgende 52 weken 70% van het salaris. Indien de " +
      "werknemer actief meewerkt aan re-integratie wordt het tweede ziektejaar aangevuld tot 85%. " +
      "De loondoorbetaling eindigt na maximaal 104 weken.",
  },
  {
    id: "scholing",
    source: "CAO Voorbeeldsector — Artikel 26 (Persoonlijk opleidingsbudget)",
    content:
      "Iedere werknemer heeft recht op een persoonlijk opleidingsbudget van € 750 per kalenderjaar " +
      "voor scholing die de duurzame inzetbaarheid vergroot. Niet-benut budget kan tot maximaal drie " +
      "jaar worden opgespaard tot een maximum van € 2.250. Aanvragen worden binnen vier weken door " +
      "de werkgever beoordeeld en mogen niet zonder gegronde reden worden geweigerd.",
  },
  {
    id: "oo-fonds",
    source: "CAO Voorbeeldsector — Artikel 27 (Bijdrage O&O-fonds)",
    content:
      "De werkgever draagt jaarlijks een premie van 0,6% van de loonsom af aan het Opleidings- en " +
      "Ontwikkelingsfonds van de sector. Het fonds financiert sectorale scholing, loopbaanadvies en " +
      "een jaarlijks ontwikkelingsgesprek waarop iedere werknemer recht heeft. Werknemers kunnen bij " +
      "het fonds een aanvraag indienen voor een loopbaanscan.",
  },
  {
    id: "jubileum",
    source: "CAO Voorbeeldsector — Artikel 15 (Jubileumuitkering)",
    content:
      "Bij een dienstverband van 25 jaar ontvangt de werknemer een eenmalige jubileumuitkering ter " +
      "hoogte van een half bruto maandsalaris. Bij een dienstverband van 40 jaar bedraagt de " +
      "jubileumuitkering een volledig bruto maandsalaris. De uitkering is voor zover fiscaal " +
      "toegestaan onbelast.",
  },
  {
    id: "pensioen",
    source: "CAO Voorbeeldsector — Artikel 24 (Pensioen)",
    content:
      "De werknemer neemt deel aan de bedrijfstakpensioenregeling die is ondergebracht bij het " +
      "pensioenfonds van de sector. Van de totale pensioenpremie draagt de werkgever twee derde en " +
      "de werknemer één derde. Het werknemersdeel wordt maandelijks op het salaris ingehouden.",
  },
  {
    id: "bijzonder-verlof",
    source: "CAO Voorbeeldsector — Artikel 16 (Buitengewoon verlof)",
    content:
      "De werknemer heeft recht op buitengewoon verlof met behoud van salaris: één dag bij het eigen " +
      "huwelijk of geregistreerd partnerschap, twee dagen bij het overlijden van een partner of kind, " +
      "en één dag bij de bevalling van de partner. Het verlof wordt opgenomen rond de gebeurtenis en " +
      "vooraf gemeld bij de leidinggevende.",
  },
  {
    id: "salarisschaal",
    source: "CAO Voorbeeldsector — Artikel 6 (Salaris en periodieken)",
    content:
      "Het salaris van de werknemer wordt vastgesteld conform de bij deze CAO behorende salarisschalen " +
      "in bijlage 1, op basis van de functie-indeling. Zolang het maximum van de schaal niet is " +
      "bereikt, ontvangt de werknemer bij goed functioneren jaarlijks per 1 januari een periodieke " +
      "verhoging van één periodiek binnen de eigen schaal.",
  },
  {
    id: "generatiepact",
    source: "CAO Voorbeeldsector — Artikel 28 (Seniorenregeling / generatiepact)",
    content:
      "De werknemer van 60 jaar of ouder kan deelnemen aan de seniorenregeling en 80% gaan werken " +
      "tegen 90% van het salaris met behoud van 100% pensioenopbouw. Deelname is vrijwillig en wordt " +
      "voor ten minste één jaar aangegaan. De vrijgekomen uren worden waar mogelijk ingezet voor de " +
      "begeleiding van jongere collega's.",
  },
];

export const queries: LabeledQuery[] = [
  {
    id: "q-proeftijd-onbepaald",
    question: "Hoe lang mag de proeftijd zijn bij een vast contract?",
    relevantPassageIds: ["proeftijd"],
  },
  {
    id: "q-proeftijd-kort",
    question: "Mag mijn werkgever een proeftijd afspreken bij een contract van een half jaar?",
    relevantPassageIds: ["proeftijd"],
  },
  {
    id: "q-opzeg-werknemer",
    question: "Welke opzegtermijn moet ik als werknemer aanhouden als ik ontslag neem?",
    relevantPassageIds: ["opzegtermijn"],
  },
  {
    id: "q-opzeg-werkgever",
    question: "Hoeveel maanden opzegtermijn geldt voor de werkgever na twaalf jaar in dienst?",
    relevantPassageIds: ["opzegtermijn"],
  },
  {
    id: "q-vakantiedagen-aantal",
    question: "Op hoeveel vrije dagen heb ik per jaar recht bij een fulltime baan?",
    relevantPassageIds: ["vakantiedagen"],
  },
  {
    id: "q-vakantiegeld",
    question: "Wanneer wordt het vakantiegeld uitgekeerd en hoeveel procent is het?",
    relevantPassageIds: ["vakantietoeslag"],
  },
  {
    id: "q-werkweek",
    question: "Hoeveel uur is een voltijd werkweek volgens de CAO?",
    relevantPassageIds: ["arbeidsduur"],
  },
  {
    id: "q-overwerk-zondag",
    question: "Welke toeslag krijg ik als ik op zondag moet overwerken?",
    relevantPassageIds: ["overwerk"],
  },
  {
    id: "q-overwerk-eerste-uren",
    question: "Wat is het toeslagpercentage voor de eerste twee overuren op een gewone dag?",
    relevantPassageIds: ["overwerk"],
  },
  {
    id: "q-ploegen",
    question: "Hoeveel toeslag staat er op werken in een drieploegendienst?",
    relevantPassageIds: ["ploegentoeslag"],
  },
  {
    id: "q-ort-nacht",
    question: "Krijg ik extra betaald voor uren die ik 's nachts werk?",
    relevantPassageIds: ["onregelmatigheid"],
  },
  {
    id: "q-reiskosten-km",
    question: "Wat is de kilometervergoeding voor mijn woon-werkverkeer?",
    relevantPassageIds: ["reiskosten"],
  },
  {
    id: "q-thuiswerk",
    question: "Krijg ik een vergoeding als ik vanuit huis werk?",
    relevantPassageIds: ["thuiswerk"],
  },
  {
    id: "q-ziekte-tweede-jaar",
    question: "Hoeveel salaris krijg ik doorbetaald in het tweede jaar dat ik ziek ben?",
    relevantPassageIds: ["loondoorbetaling-ziekte"],
  },
  {
    id: "q-scholingsbudget",
    question: "Hoeveel geld mag ik jaarlijks besteden aan een opleiding?",
    relevantPassageIds: ["scholing"],
  },
  {
    id: "q-scholing-opsparen",
    question: "Kan ik mijn opleidingsbudget meenemen naar een volgend jaar?",
    relevantPassageIds: ["scholing"],
  },
  {
    id: "q-oo-fonds-premie",
    question: "Welk percentage van de loonsom gaat naar het opleidings- en ontwikkelingsfonds?",
    relevantPassageIds: ["oo-fonds"],
  },
  {
    id: "q-ontwikkelgesprek",
    question: "Heb ik recht op een jaarlijks gesprek over mijn ontwikkeling?",
    relevantPassageIds: ["oo-fonds"],
  },
  {
    id: "q-jubileum",
    question: "Wat krijg ik als ik 25 jaar in dienst ben?",
    relevantPassageIds: ["jubileum"],
  },
  {
    id: "q-pensioen-verdeling",
    question: "Hoe is de verdeling van de pensioenpremie tussen werkgever en werknemer?",
    relevantPassageIds: ["pensioen"],
  },
  {
    id: "q-verlof-overlijden",
    question: "Hoeveel dagen vrij krijg ik bij het overlijden van mijn partner?",
    relevantPassageIds: ["bijzonder-verlof"],
  },
  {
    id: "q-periodiek",
    question: "Wanneer krijg ik een periodieke salarisverhoging binnen mijn schaal?",
    relevantPassageIds: ["salarisschaal"],
  },
  {
    id: "q-senioren",
    question: "Kan ik als oudere werknemer minder gaan werken met behoud van pensioenopbouw?",
    relevantPassageIds: ["generatiepact"],
  },
];
