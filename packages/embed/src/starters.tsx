import { Pill } from "@wunderstack/ui";
import { useState } from "react";
import type { EmbedTexts, StarterCategory } from "./types";

/**
 * Empty-chat starters (Fase 5). Mirrors the playground category pills so the marketing demo and a
 * fund's dedicated page feel like the same agent. Categories come from GET /config when a tenant
 * overrides them; otherwise the default set below.
 */

const TOPIC_STARTER_CATEGORIES: StarterCategory[] = [
  {
    label: "Verlof",
    questions: [
      "Hoeveel vakantiedagen krijg ik bij een fulltime contract?",
      "Welk verlof krijg ik bij een huwelijk of verhuizing?",
      "Bouw ik vakantiedagen op als ik ziek ben?",
    ],
  },
  {
    label: "Salaris",
    questions: [
      "Hoe werken de loonschalen en functiegroepen?",
      "Wanneer krijg ik een stap (periodiek) in mijn loonschaal?",
      "Welke toeslag geldt er voor overwerk?",
    ],
  },
  {
    label: "Contract & opzegging",
    questions: [
      "Welke opzegtermijnen staan er in de cao?",
      "Welke regels gelden er voor een tijdelijk contract?",
      "Wat gebeurt er met mijn vakantiedagen als ik uit dienst ga?",
    ],
  },
  {
    label: "Werktijden",
    questions: [
      "Hoeveel uur is een volledige werkweek?",
      "Welke regels gelden er voor pauzes?",
      "Welke regels gelden er voor werken op zaterdag of op feestdagen?",
    ],
  },
];

export const DEFAULT_STARTER_CATEGORIES: StarterCategory[] = [
  {
    label: "Veelgestelde vragen",
    questions: [
      "Hoeveel vakantiedagen krijg ik bij een fulltime contract?",
      "Welke opzegtermijnen staan er in de cao?",
      "Hoe werken de loonschalen en functiegroepen?",
    ],
  },
  ...TOPIC_STARTER_CATEGORIES,
];

/** Prefer tenant categories; fall back to a legacy flat list, then the defaults. */
export function resolveStarterCategories(texts: EmbedTexts | undefined): StarterCategory[] {
  if (texts?.starterCategories && texts.starterCategories.length > 0) {
    return texts.starterCategories;
  }
  if (texts?.starters && texts.starters.length > 0) {
    return [{ label: "Veelgestelde vragen", questions: texts.starters }];
  }
  return DEFAULT_STARTER_CATEGORIES;
}

const DEFAULT_TITLE = "Heb je een vraag over de CAO?";
const DEFAULT_INTRO =
  "Antwoorden komen uit de CAO, met het artikel erbij. Staat het er niet in? Dan hoor je dat eerlijk.";

export function Starters({
  categories,
  onPick,
  title = DEFAULT_TITLE,
  intro = DEFAULT_INTRO,
}: {
  categories: StarterCategory[];
  onPick: (question: string) => void;
  title?: string;
  intro?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = categories[activeIndex] ?? categories[0];

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-text">{title}</p>
        <p className="text-xs text-text-muted">{intro}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((category, index) => {
          const isActive = index === activeIndex;
          return (
            <Pill
              key={category.label}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveIndex(index); } }}
              variant={isActive ? "selected" : "outline"}
              className="cursor-pointer shadow-[var(--elevation-card)]"
            >
              {category.label}
            </Pill>
          );
        })}
      </div>

      {active ? (
        <div className="flex flex-col gap-2">
          {active.questions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onPick(question)}
              className="group flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface px-3 py-2.5 text-left text-xs text-text shadow-[var(--elevation-card)] hover:shadow-[var(--elevation-raised)]"
            >
              <span>{question}</span>
              <span aria-hidden className="shrink-0 text-text-subtle group-hover:text-text-muted">
                →
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
