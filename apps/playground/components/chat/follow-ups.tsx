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
    <div className="border-t border-border px-8 py-5">
      <p className="mb-2 flex items-center gap-1.5 text-sm text-text-muted">
        <CornerDownRight className="h-4 w-4" aria-hidden />
        Handige vervolgvragen
      </p>
      <div className="flex flex-wrap gap-2">
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            disabled={disabled}
            onClick={() => onPick(question)}
            className="w-fit max-w-full rounded-[var(--radius-pill)] bg-primary-tint px-4 py-2.5 text-left text-base text-text hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
