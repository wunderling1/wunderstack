"use client";

import { AnswerCard } from "@wunderstack/ui";
import { Check, ListChecks, Loader2, type LucideIcon, Search, ShieldCheck } from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { ChatStatusPhase } from "@/app/api/chat/contract";
import type { TenantPublicConfig } from "@wunderstack/shared";
import type { PlaygroundAgent } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";
import { Citations } from "./citation";
import { Feedback } from "./feedback";
import { FollowUps } from "./follow-ups";
import { Markdown, type CitationMarkerMeta } from "./markdown";
import type { ChatMessage, FeedbackRating } from "./use-chat";

const AGENT_LABEL = "AI-assistent";

const AGENT_SUB_LABEL: Record<PlaygroundAgent, string> = {
  cao: "CAO-agent",
  arbo: "Arbocatalogus",
};

interface MessageListProps {
  messages: ChatMessage[];
  fund?: string;
  agent?: PlaygroundAgent;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
  onFollowUp: (question: string) => void;
  /** True while a turn is in flight — disables follow-up chips so they don't double-send. */
  followUpsDisabled?: boolean;
  statusLabels?: TenantPublicConfig["statusLabels"];
}

/** Renders the conversation: user/assistant bubbles, streaming caret, citations and feedback. */
export function MessageList({
  messages,
  fund,
  agent = "cao",
  onFeedback,
  onFollowUp,
  followUpsDisabled = false,
  statusLabels,
}: MessageListProps) {
  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          fund={fund}
          agent={agent}
          onFeedback={onFeedback}
          onFollowUp={onFollowUp}
          followUpsDisabled={followUpsDisabled}
          statusLabels={statusLabels ?? DEFAULT_PROGRESS_STEPS}
        />
      ))}
    </div>
  );
}

// Ordered checklist steps, mapped onto the server's progress phases.
const DEFAULT_PROGRESS_STEPS: TenantPublicConfig["statusLabels"] = {
  searching: "CAO doorzoeken",
  retrieved: "Passages beoordelen",
  generating: "Bronvermelding controleren",
};

function progressSteps(labels: TenantPublicConfig["statusLabels"]): {
  phase: ChatStatusPhase;
  label: string;
  icon: LucideIcon;
}[] {
  return [
    { phase: "searching", label: labels.searching, icon: Search },
    { phase: "retrieved", label: labels.retrieved, icon: ListChecks },
    { phase: "generating", label: labels.generating, icon: ShieldCheck },
  ];
}

/** Index of the currently active step; defaults to the first (optimistic "searching"). */
function activeStepIndex(phase: ChatStatusPhase | null, steps: ReturnType<typeof progressSteps>): number {
  const i = steps.findIndex((s) => s.phase === phase);
  return i === -1 ? 0 : i;
}

/**
 * Vertical timeline showing retrieval/answer progress.
 * Done = green circle (state-verified), active = spinning primary, pending = muted icon in sunk circle.
 */
function AnswerSkeleton({
  phase,
  statusLabels,
}: {
  phase: ChatStatusPhase | null;
  statusLabels: TenantPublicConfig["statusLabels"];
}) {
  const steps = progressSteps(statusLabels);
  const current = activeStepIndex(phase, steps);

  return (
    <div className="flex flex-col gap-5">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "active" : "pending";
        const StepIcon = step.icon;

        return (
          <div key={step.phase} className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                state === "done" && "bg-state-verified-bg",
                state === "active" && "bg-primary-tint",
                state === "pending" && "bg-surface-sunk",
              )}
              {...(state === "active" ? { "aria-live": "polite" as const } : {})}
            >
              {state === "done" ? (
                <Check className="h-4 w-4 text-state-verified-fg" />
              ) : state === "active" ? (
                <Loader2 className="motion-spin h-4 w-4 text-primary" aria-hidden />
              ) : (
                <StepIcon className="h-4 w-4 text-text-subtle" />
              )}
            </span>

            <p
              className={cn(
                "text-base",
                state === "pending" ? "text-text-subtle" : "text-text",
              )}
            >
              {step.label}
              {state === "active" ? "…" : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// Memoized so streaming updates to one message don't re-render (and re-parse Markdown for) the rest.
const MessageBubble = memo(function MessageBubble({
  message,
  fund,
  agent,
  onFeedback,
  onFollowUp,
  followUpsDisabled,
  statusLabels,
}: {
  message: ChatMessage;
  fund?: string;
  agent: PlaygroundAgent;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
  onFollowUp: (question: string) => void;
  followUpsDisabled: boolean;
  statusLabels: TenantPublicConfig["statusLabels"];
}) {
  const isUser = message.role === "user";
  const waiting = message.streaming && message.text.length === 0;
  const showFeedback = !isUser && !message.streaming && message.traceId !== null;
  const showFollowUps =
    !isUser &&
    !message.streaming &&
    message.found === true &&
    message.followUpQuestions.length > 0;

  const [activeRef, setActiveRef] = useState<number | null>(null);

  const citationMarkers = useMemo<CitationMarkerMeta>(
    () => ({
      quoteByRef: new Map(message.citations.map((c) => [c.ref, c.quote])),
      onMarkerClick: setActiveRef,
    }),
    [message.citations],
  );

  if (isUser) {
    return (
      <AnswerCard role="user">
        <p className="whitespace-pre-wrap">{message.text}</p>
      </AnswerCard>
    );
  }

  // Agent turn — refused: same card chrome as a regular answer, no chip (grounding bar comes later)
  if (message.found === false && !message.streaming) {
    return (
      <AnswerCard
        role="agent"
        agentLabel={AGENT_LABEL}
        agentSubLabel={AGENT_SUB_LABEL[agent]}
        footer={
          showFeedback ? (
            <Feedback
              submitted={message.feedback}
              onSubmit={(rating, reason) => onFeedback(message.id, rating, reason)}
            />
          ) : undefined
        }
      >
        {message.text}
      </AnswerCard>
    );
  }

  // Agent turn — answer (including while streaming)
  return (
    <AnswerCard
      role="agent"
      agentLabel={AGENT_LABEL}
      agentSubLabel={AGENT_SUB_LABEL[agent]}
      footer={
        <>
          <Citations
            citations={message.citations}
            messageId={message.id}
            {...(fund ? { fund } : {})}
            agent={agent}
            activeRef={activeRef}
            candidate={waiting}
          />
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
        </>
      }
    >
      {waiting ? (
        <AnswerSkeleton phase={message.phase} statusLabels={statusLabels} />
      ) : (
        <Markdown citationMarkers={citationMarkers}>{message.text}</Markdown>
      )}
    </AnswerCard>
  );
});
