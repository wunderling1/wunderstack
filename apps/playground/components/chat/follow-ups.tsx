"use client";

import { CornerDownRight } from "lucide-react";

/**
 * Post-answer follow-up chips ("Handige vervolgvragen"). Grounded suggestions from the agent —
 * clicking one sends that question as the next turn so users type less and stay on-corpus.
 */

interface FollowUpsProps {
  questions: string[];
  onPick: (question: string) => void;
  disabled?: boolean;
}

export function FollowUps({ questions, onPick, disabled = false }: FollowUpsProps) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <CornerDownRight className="h-3.5 w-3.5" aria-hidden />
        Handige vervolgvragen
      </p>
      <div className="flex flex-wrap gap-2">
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            disabled={disabled}
            onClick={() => onPick(question)}
            className="inline-flex items-center rounded-[var(--radius-pill)] border border-primary/30 bg-primary-tint px-3 py-1.5 text-left text-sm text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
