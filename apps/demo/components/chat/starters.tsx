"use client";

/**
 * Starter questions for the empty chat (Fase 12). They keep the empty state from feeling bare and
 * make the agent's scope immediately clear. The set is fund-configurable (see lib/fund-theme.ts).
 */

interface StartersProps {
  tagline: string;
  starters: string[];
  onPick: (question: string) => void;
}

export function Starters({ tagline, starters, onPick }: StartersProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-sm text-muted-foreground">{tagline}. Ik antwoord met bronvermelding en verzin niets.</p>
      <div className="flex flex-col gap-2">
        {starters.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onPick(question)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
