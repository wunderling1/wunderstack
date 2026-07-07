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

export function Feedback({ submitted, onSubmit }: FeedbackProps) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  if (submitted !== null && !showReason) {
    return <p className="mt-2 text-xs text-muted-foreground">Bedankt voor je feedback.</p>;
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

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        <span className="mr-1 text-xs">Was dit nuttig?</span>
        <button
          type="button"
          aria-label="Nuttig"
          aria-pressed={submitted === "up"}
          onClick={() => rate("up")}
          className={cn(
            "rounded p-1 transition-colors hover:bg-muted",
            submitted === "up" && "text-primary",
          )}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Niet nuttig"
          aria-pressed={submitted === "down"}
          onClick={() => rate("down")}
          className={cn(
            "rounded p-1 transition-colors hover:bg-muted",
            submitted === "down" && "text-primary",
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {showReason ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitReason();
            }}
            maxLength={2000}
            placeholder="Wat klopte er niet? (optioneel)"
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={submitReason}
            className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Versturen
          </button>
        </div>
      ) : null}
    </div>
  );
}
