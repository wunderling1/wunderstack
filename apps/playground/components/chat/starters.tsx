"use client";

import { useState } from "react";
import type { StarterCategory } from "@/lib/fund-theme";

/**
 * Starter questions for the empty chat (Fase 12). They keep the empty state from feeling bare and
 * make the agent's scope immediately clear. Questions are grouped into fund-configurable categories
 * (see lib/fund-theme.ts); a pill row switches the active category.
 */

interface StartersProps {
  categories: StarterCategory[];
  onPick: (question: string) => void;
}

export function Starters({ categories, onPick }: StartersProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = categories[activeIndex] ?? categories[0];

  return (
    <div className="flex flex-col items-center gap-6 py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-xl font-semibold text-text">Heb je een vraag over de CAO? Stel hem hier.</h1>
        <p className="text-sm text-text-muted">
          De AI-assistent geeft antwoord uit de CAO, met het artikel erbij. Staat het er niet in? Dan hoor je dat
          eerlijk.
        </p>
      </div>

      <p className="text-sm text-text-muted">Klik op een vraag om die direct te stellen.</p>

      <div className="flex flex-wrap justify-center gap-2">
        {categories.map((category, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={category.label}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActiveIndex(index)}
              className={`inline-flex items-center rounded-[var(--radius-pill)] px-4 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-tint text-primary"
                  : "border border-border bg-surface text-text hover:bg-surface-sunk"
              }`}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      {active ? (
        <div className="flex w-full flex-col gap-3">
          {active.questions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onPick(question)}
              className="group flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-4 text-left text-sm text-text transition-colors hover:bg-surface-sunk"
            >
              <span>{question}</span>
              <span aria-hidden className="text-text-subtle transition-colors group-hover:text-text-muted">
                &rarr;
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
