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

export function Starters({
  categories,
  onPick,
}: {
  categories: StarterCategory[];
  onPick: (question: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = categories[activeIndex] ?? categories[0];

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-text">Heb je een vraag over de CAO?</p>
        <p className="text-xs text-text-muted">
          Antwoorden komen uit de CAO, met het artikel erbij. Staat het er niet in? Dan hoor je dat
          eerlijk.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((category, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={category.label}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveIndex(index)}
              className={
                isActive
                  ? "inline-flex items-center rounded-pill bg-primary-tint px-3 py-1 text-xs font-medium text-primary"
                  : "inline-flex items-center rounded-pill border border-border bg-surface px-3 py-1 text-xs font-medium text-text hover:bg-surface-sunk"
              }
            >
              {category.label}
            </button>
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
              className="group flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-3 py-2.5 text-left text-xs text-text hover:bg-surface-sunk"
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
