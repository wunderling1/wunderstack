"use client";

import { memo, useMemo, useState } from "react";
import type { ChatStatusPhase } from "@/app/api/chat/contract";
import { cn } from "@/lib/utils";
import { Citations } from "./citation";
import { Feedback } from "./feedback";
import { Markdown, type CitationMarkerMeta } from "./markdown";
import type { ChatMessage, FeedbackRating } from "./use-chat";

interface MessageListProps {
  messages: ChatMessage[];
  fund?: string;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
}

/** Renders the conversation: user/assistant bubbles, streaming caret, citations and feedback. */
export function MessageList({ messages, fund, onFeedback }: MessageListProps) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} fund={fund} onFeedback={onFeedback} />
      ))}
    </div>
  );
}

/** Map a language-neutral progress phase to a user-facing Dutch status label. */
function phaseLabel(phase: ChatStatusPhase | null, count: number | null): string {
  switch (phase) {
    case "retrieved": {
      if (count === null) return "Passages gevonden";
      return count === 1 ? "1 passage gevonden" : `${String(count)} passages gevonden`;
    }
    case "generating":
      return "Antwoord formuleren…";
    case "searching":
    default:
      return "CAO doorzoeken…";
  }
}

/** Shimmer placeholder that reads as "text is being written", unlike static dots. */
function AnswerSkeleton({ phase, count }: { phase: ChatStatusPhase | null; count: number | null }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
        {phaseLabel(phase, count)}
      </p>
      <div className="flex flex-col gap-1.5" aria-hidden>
        <span className="h-3 w-[90%] animate-pulse rounded bg-muted" />
        <span className="h-3 w-full animate-pulse rounded bg-muted [animation-delay:150ms]" />
        <span className="h-3 w-[75%] animate-pulse rounded bg-muted [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// Memoized so streaming updates to one message don't re-render (and re-parse Markdown for) the rest.
const MessageBubble = memo(function MessageBubble({
  message,
  fund,
  onFeedback,
}: {
  message: ChatMessage;
  fund?: string;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
}) {
  const isUser = message.role === "user";
  const waiting = message.streaming && message.text.length === 0;
  const showFeedback = !isUser && !message.streaming && message.found === true && message.traceId !== null;

  // Which source card is currently highlighted (from a clicked `[n]` marker).
  const [activeRef, setActiveRef] = useState<number | null>(null);

  const citationMarkers = useMemo<CitationMarkerMeta>(
    () => ({
      quoteByRef: new Map(message.citations.map((c) => [c.ref, c.quote])),
      onMarkerClick: setActiveRef,
    }),
    [message.citations],
  );

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "border border-border bg-card",
        )}
      >
        {waiting ? (
          <AnswerSkeleton phase={message.phase} count={message.retrievedCount} />
        ) : isUser ? (
          <p className="whitespace-pre-wrap">{message.text}</p>
        ) : (
          <Markdown citationMarkers={citationMarkers}>{message.text}</Markdown>
        )}

        {!isUser ? (
          <Citations
            citations={message.citations}
            messageId={message.id}
            {...(fund ? { fund } : {})}
            activeRef={activeRef}
            candidate={waiting}
          />
        ) : null}

        {showFeedback ? (
          <Feedback
            submitted={message.feedback}
            onSubmit={(rating, reason) => onFeedback(message.id, rating, reason)}
          />
        ) : null}
      </div>
    </div>
  );
});
