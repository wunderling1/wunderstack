"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { Pill } from "@wunderstack/ui";
import type { StarterCategory } from "@/lib/fund-theme";
import { cn } from "@/lib/utils";

/**
 * Starter questions for the empty chat (Fase 12). They keep the empty state from feeling bare and
 * make the agent's scope immediately clear. Categories, title and intro come from GET /api/config
 * (tenant texts); fund-theme is only the fallback. A pill row switches the active category.
 *
 * Enter stagger (`.motion-enter`) runs on first paint only. Switching category must not re-stagger
 * the question list — that would feel like theatre. Answers/citations never use this class (decision D).
 */

interface StartersProps {
  categories: StarterCategory[];
  onPick: (question: string) => void;
  title?: string;
  intro?: string;
}

const DEFAULT_TITLE = "Heb je een vraag over de CAO? Stel hem hier.";
const DEFAULT_INTRO =
  "De AI-assistent geeft antwoord uit de CAO, met het artikel erbij. Staat het er niet in? Dan hoor je dat eerlijk.";

const I_TITLE = 0;
const I_INTRO = 1;
const I_HINT = 2;
const I_PILLS = 3;

function enterStyle(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

export function Starters({
  categories,
  onPick,
  title = DEFAULT_TITLE,
  intro = DEFAULT_INTRO,
}: StartersProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = categories[activeIndex] ?? categories[0];
  const isFirstPaint = useRef(true);

  useLayoutEffect(() => {
    isFirstPaint.current = false;
  }, []);

  const questionsStart = I_PILLS + categories.length;

  return (
    <div className="my-auto flex w-full flex-col items-center gap-6 py-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <h1 className="motion-enter text-2xl font-bold text-text" style={enterStyle(I_TITLE)}>
          {title}
        </h1>
        <p className="motion-enter text-base text-text-muted" style={enterStyle(I_INTRO)}>
          {intro}
        </p>
      </div>

      <div className="motion-enter flex flex-wrap justify-center gap-2" style={enterStyle(I_HINT)}>
        {categories.map((category, index) => {
          const isActive = index === activeIndex;
          return (
            <Pill
              key={category.label}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveIndex(index); } }}
              variant={isActive ? "selected" : "outline"}
              className={cn("motion-enter cursor-pointer px-4 py-1.5 text-sm shadow-[var(--elevation-card)]", !isActive && "hover:bg-surface-sunk")}
              style={enterStyle(I_PILLS + index)}
            >
              {category.label}
            </Pill>
          );
        })}
      </div>

      {active ? (
        <div className="flex w-full flex-col gap-3">
          {active.questions.map((question, index) => (
            <button
              key={question}
              type="button"
              onClick={() => onPick(question)}
              className={cn(
                "group flex items-center justify-between gap-4 rounded-[var(--radius-card)] bg-surface px-5 py-5 text-left text-base text-text",
                "shadow-[var(--elevation-card)] hover:shadow-[var(--elevation-raised)]",
                isFirstPaint.current && "motion-enter",
              )}
              style={isFirstPaint.current ? enterStyle(questionsStart + index) : undefined}
            >
              <span>{question}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-text-subtle group-hover:text-text-muted" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
