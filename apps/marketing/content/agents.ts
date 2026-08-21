/**
 * Marketing catalog content (Fase 5). This is the CONTENT layer of the agent catalog — plain data,
 * curated by hand, deliberately DECOUPLED from the runtime agent registry (@wunderstack/agents).
 *
 * Why not import listAgents()? The arrow rule + the depcruise `no-marketing-to-agents` rule keep the
 * agent/model runtime (Mastra) out of this static content site's bundle. The marketing story ("the
 * catalog of fund-crossing agents") is broader than what is wired today, so it lives as content here
 * and is honest about what is live versus what is a scripted walkthrough.
 *
 * INVARIANT: exactly the agents with `status: "live"` get a real embedded demo (today: CAO only, per
 * the plan). Everything else is a scripted walkthrough — no live demo for a non-existent agent.
 */

export type AgentContentStatus = "live" | "binnenkort";

export interface AgentContent {
  /** URL slug + the runtime agent id for live agents (must match the catalog id, e.g. "cao"). */
  slug: string;
  name: string;
  /** One-line promise, shown on the card + detail hero. */
  tagline: string;
  /** Short paragraph for the detail page. */
  summary: string;
  status: AgentContentStatus;
  /** Bullet highlights shown on the detail page. */
  highlights: string[];
  /** Scripted walkthrough steps (used when there is no live demo). */
  walkthrough: string[];
}

export const AGENTS: AgentContent[] = [
  {
    slug: "cao",
    name: "CAO-agent",
    tagline: "Antwoorden met bronvermelding, rechtstreeks uit de CAO-teksten.",
    summary:
      "De CAO-agent beantwoordt vragen van werknemers en werkgevers over de cao. Elk antwoord is " +
      "gegrond in de brontekst met een verwijzing naar het artikel en lid, of de agent weigert " +
      "netjes wanneer het antwoord niet in de cao staat. Zo krijgt je achterban betrouwbare, " +
      "controleerbare informatie — zonder verzinsels.",
    status: "live",
    highlights: [
      "Bronvermelding per antwoord (artikel + lid), geverifieerd tegen de brontekst.",
      "Weigert expliciet wanneer het antwoord niet in de cao staat — geen gokwerk.",
      "Soeverein pad: EU-modellen en EU-opslag, fondsdata blijft binnen de EU.",
      "Insluitbaar op elke site met één scriptregel; theming per fonds.",
    ],
    walkthrough: [
      "Stel je cao-vraag in gewone taal.",
      "De agent zoekt de relevante passages in de cao.",
      "Je krijgt een antwoord met de bijbehorende artikel- en lidverwijzing.",
    ],
  },
  {
    slug: "arbo",
    name: "Arbocatalogus-agent",
    tagline: "Sectorale arbo-maatregelen met bronvermelding uit de catalogus.",
    summary:
      "De arbocatalogus-agent beantwoordt vragen over sectorale arbo-maatregelen en risico's. " +
      "Antwoorden komen uitsluitend uit de arbocatalogus van het fonds — niet uit de Arbowet of een CAO.",
    status: "binnenkort",
    highlights: [
      "Bronvermelding per antwoord, geverifieerd tegen de catalogus.",
      "Weigert vragen over Arbowet, CAO-recht en individueel advies — met route naar de juiste plek.",
      "Gescheiden corpus en embed-key naast de CAO-agent.",
    ],
    walkthrough: [
      "Stel je arbo-vraag (bijv. tillen, PBM of beeldschermwerk).",
      "De agent zoekt in de arbocatalogus.",
      "Je krijgt maatregelen en risico's met bronverwijzing.",
    ],
  },
  {
    slug: "subsidie",
    name: "Subsidie-agent",
    tagline: "Wegwijs in scholings- en ontwikkelsubsidies van het fonds.",
    summary:
      "De Subsidie-agent helpt werkgevers en werknemers de weg te vinden in de subsidieregelingen " +
      "van het fonds: welke regeling past, welke voorwaarden gelden en hoe je aanvraagt. Dezelfde " +
      "grounding-belofte als de CAO-agent, toegepast op regelingsteksten.",
    status: "binnenkort",
    highlights: [
      "Zelfde grounding-architectuur: antwoorden met bronverwijzing naar de regeling.",
      "Per fonds geconfigureerd op de eigen regelingen.",
    ],
    walkthrough: [
      "Beschrijf je situatie (bijv. omscholing van een medewerker).",
      "De agent wijst de passende regeling(en) aan met voorwaarden.",
      "Je krijgt de vervolgstappen voor de aanvraag, met bronverwijzing.",
    ],
  },
  {
    slug: "loopbaan",
    name: "Loopbaan-agent",
    tagline: "Loopbaan- en ontwikkelvragen, gegrond in het fondsaanbod.",
    summary:
      "De Loopbaan-agent beantwoordt vragen over loopbaanpaden, ontwikkelmogelijkheden en het " +
      "opleidingsaanbod van het fonds. Ook hier: één keer gebouwd, per fonds geconfigureerd op de " +
      "eigen content.",
    status: "binnenkort",
    highlights: [
      "Herbruikt de retrieval- en grounding-naden van het platform.",
      "Contentgestuurd per fonds, geen fonds-specifieke code.",
    ],
    walkthrough: [
      "Stel je loopbaan- of ontwikkelvraag.",
      "De agent koppelt je aan relevant aanbod van het fonds.",
      "Je krijgt concrete opties met verwijzing naar de bron.",
    ],
  },
];

export function agentBySlug(slug: string): AgentContent | undefined {
  return AGENTS.find((agent) => agent.slug === slug);
}
