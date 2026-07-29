"use client";

import { Check, ListChecks, Loader2, type LucideIcon, Search, ShieldCheck } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ChatStatusPhase } from "@/app/api/chat/contract";
import { cn } from "@/lib/utils";
import { Citations } from "./citation";
import { Feedback } from "./feedback";
import { FollowUps } from "./follow-ups";
import { Markdown, type CitationMarkerMeta } from "./markdown";
import type { ChatMessage, FeedbackRating } from "./use-chat";

interface MessageListProps {
  messages: ChatMessage[];
  fund?: string;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
  onFollowUp: (question: string) => void;
  /** True while a turn is in flight — disables follow-up chips so they don't double-send. */
  followUpsDisabled?: boolean;
}

/** Renders the conversation: user/assistant bubbles, streaming caret, citations and feedback. */
export function MessageList({
  messages,
  fund,
  onFeedback,
  onFollowUp,
  followUpsDisabled = false,
}: MessageListProps) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          fund={fund}
          onFeedback={onFeedback}
          onFollowUp={onFollowUp}
          followUpsDisabled={followUpsDisabled}
        />
      ))}
    </div>
  );
}

// Ordered checklist steps, mapped onto the server's progress phases. "Bronvermelding controleren" is
// cosmetic: the real citation verification happens inside the `generating` phase (buffer-to-verify).
const PROGRESS_STEPS: { phase: ChatStatusPhase; label: string; icon: LucideIcon }[] = [
  { phase: "searching", label: "CAO doorzoeken", icon: Search },
  { phase: "retrieved", label: "Passages beoordelen", icon: ListChecks },
  { phase: "generating", label: "Bronvermelding controleren", icon: ShieldCheck },
];

/** Index of the currently active step; defaults to the first (optimistic "searching"). */
function activeStepIndex(phase: ChatStatusPhase | null): number {
  const i = PROGRESS_STEPS.findIndex((s) => s.phase === phase);
  return i === -1 ? 0 : i;
}

/** Checklist that shows retrieval/answer progress, so waiting reads as "work is happening". */
function AnswerSkeleton({ phase }: { phase: ChatStatusPhase | null }) {
  const current = activeStepIndex(phase);

  return (
    <ul className="flex flex-col gap-2.5">
      {PROGRESS_STEPS.map((step, index) => {
        const state = index < current ? "done" : index === current ? "active" : "pending";
        const StepIcon = step.icon;
        return (
          <li
            key={step.phase}
            className={cn(
              "flex items-center gap-2 text-sm",
              state === "pending" ? "text-text-subtle" : "text-text",
            )}
            {...(state === "active" ? { "aria-live": "polite" as const } : {})}
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {state === "done" ? (
                <Check className="h-4 w-4 text-primary" />
              ) : state === "active" ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <StepIcon className="h-4 w-4" />
              )}
            </span>
            <span>
              {step.label}
              {state === "active" ? "…" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// Memoized so streaming updates to one message don't re-render (and re-parse Markdown for) the rest.
const MessageBubble = memo(function MessageBubble({
  message,
  fund,
  onFeedback,
  onFollowUp,
  followUpsDisabled,
}: {
  message: ChatMessage;
  fund?: string;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
  onFollowUp: (question: string) => void;
  followUpsDisabled: boolean;
}) {
  const isUser = message.role === "user";
  const waiting = message.streaming && message.text.length === 0;
  const showFeedback = !isUser && !message.streaming && message.found === true && message.traceId !== null;
  const showFollowUps =
    !isUser &&
    !message.streaming &&
    message.found === true &&
    message.followUpQuestions.length > 0;

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
          "rounded-lg px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "max-w-[85%] rounded-br-none bg-primary text-on-primary"
            : "w-full border border-border bg-surface",
        )}
      >
        {waiting ? (
          <AnswerSkeleton phase={message.phase} />
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

        {showFollowUps ? (
          <FollowUps
            questions={message.followUpQuestions}
            onPick={onFollowUp}
            disabled={followUpsDisabled}
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
