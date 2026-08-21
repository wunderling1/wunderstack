"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FeedbackRating } from "./use-chat";

/**
 * Per-answer feedback (Fase 12 feedback loop): a thumbs up/down, plus an optional reason on a thumbs
 * down. The rating is scored onto the answer's Langfuse trace (via /api/feedback), turning user
 * judgements into proprietary eval data. Only shown once an answer has a trace to attach to.
 */

interface FeedbackProps {
  submitted: FeedbackRating | null;
  onSubmit: (rating: FeedbackRating, reason?: string) => void;
}

/** Quick reason chips for a thumbs-down; feed Fase 9 eval data + golden-set co-creation. */
const REASON_CHIPS = ["bron klopt niet", "antwoord onvolledig", "verkeerde CAO"] as const;

export function Feedback({ submitted, onSubmit }: FeedbackProps) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  if (submitted !== null && !showReason) {
    return <p className="border-t border-border px-8 py-4 text-sm text-text-muted">Bedankt voor je feedback.</p>;
  }

  const rate = (rating: FeedbackRating) => {
    if (rating === "down") {
      setShowReason(true);
      onSubmit("down");
      return;
    }
    onSubmit("up");
  };

  const submitReason = () => {
    onSubmit("down", reason.trim() || undefined);
    setShowReason(false);
  };

  const submitChip = (chip: string) => {
    onSubmit("down", chip);
    setShowReason(false);
  };

  return (
    <div className="border-t border-border px-8 py-4">
      <div className="flex items-center justify-between text-text-muted">
        <span className="text-sm">Klopt dit antwoord?</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Nuttig"
            aria-pressed={submitted === "up"}
            onClick={() => rate("up")}
            className={cn(
              "rounded p-1 hover:bg-surface-sunk",
              submitted === "up" && "text-primary",
            )}
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Niet nuttig"
            aria-pressed={submitted === "down"}
            onClick={() => rate("down")}
            className={cn(
              "rounded p-1 hover:bg-surface-sunk",
              submitted === "down" && "text-primary",
            )}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showReason ? (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {REASON_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => submitChip(chip)}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-text-muted hover:bg-surface-sunk hover:text-text"
              >
                {chip}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitReason();
              }}
              maxLength={2000}
              placeholder="Wat klopte er niet? (optioneel)"
              className="flex-1 rounded-md border border-border bg-page px-2 py-1 text-xs outline-none placeholder:text-text-muted"
            />
            <button
              type="button"
              onClick={submitReason}
              className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-on-primary hover:opacity-90"
            >
              Versturen
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
