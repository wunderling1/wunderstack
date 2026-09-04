"use client";

import {
  AnswerCard,
  AnswerTrace,
  accumulateTraceItems,
  traceSummaryLabel,
  usePacedTrace,
} from "@wunderstack/ui";
import { memo, useMemo, useState } from "react";
import type { PlaygroundAgent } from "@/lib/runtime-config";
import { isRefusedTurn } from "@/lib/turn-outcome";
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

/** Head line of the progress trace — what the agent is doing, before any event has landed. */
const AGENT_TRACE_HEAD: Record<PlaygroundAgent, string> = {
  cao: "Zoeken in de CAO",
  arbo: "Zoeken in de Arbocatalogus",
};

/** Corpus wording for the finished summary line ("Gezocht in de CAO · …"). */
const AGENT_SEARCHED_LABEL: Record<PlaygroundAgent, string> = {
  cao: "Gezocht in de CAO",
  arbo: "Gezocht in de Arbocatalogus",
};

interface MessageListProps {
  messages: ChatMessage[];
  fund?: string;
  agent?: PlaygroundAgent;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
  onFollowUp: (question: string) => void;
  /** True while a turn is in flight — disables follow-up chips so they don't double-send. */
  followUpsDisabled?: boolean;
}

/** Renders the conversation: user/assistant bubbles, streaming caret, citations and feedback. */
export function MessageList({
  messages,
  fund,
  agent = "cao",
  onFeedback,
  onFollowUp,
  followUpsDisabled = false,
}: MessageListProps) {
  return (
    <div className="flex flex-col gap-6" data-message-list>
      {messages.map((message, index) => (
        <div
          key={message.id}
          data-message-id={message.id}
          className={index === messages.length - 1 ? "min-h-[var(--turn-min-height,0px)]" : undefined}
        >
          <MessageBubble
            message={message}
            fund={fund}
            agent={agent}
            onFeedback={onFeedback}
            onFollowUp={onFollowUp}
            followUpsDisabled={followUpsDisabled}
          />
        </div>
      ))}
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
}: {
  message: ChatMessage;
  fund?: string;
  agent: PlaygroundAgent;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
  onFollowUp: (question: string) => void;
  followUpsDisabled: boolean;
}) {
  const isUser = message.role === "user";
  // Buffer-to-verify emits text before the citations event that carries the outcome. Keep the live
  // trace up until that outcome lands, so the summary and the card appear together above the fold.
  const waiting = message.streaming && message.turnOutcome === null;
  // Paced here rather than in `useChat`: the rhythm is a property of the view, and a message that
  // is re-mounted (scrolled back into view) should not replay its trace.
  const pacedTrace = usePacedTrace(message.trace);
  const traceSteps = useMemo(() => accumulateTraceItems(pacedTrace), [pacedTrace]);
  // Once the verdict is in the trace is history, so it is shown whole rather than at the paced
  // tempo — the reader opens it to check what happened, not to watch it happen again.
  const finishedSteps = useMemo(() => accumulateTraceItems(message.trace), [message.trace]);
  const summary = useMemo(() => {
    if (message.turnOutcome === null) {
      return null;
    }
    return traceSummaryLabel({
      outcome: message.turnOutcome.outcome,
      searchedLabel: AGENT_SEARCHED_LABEL[agent],
      considered: message.retrieval?.considered ?? 0,
      aboveThreshold: message.retrieval?.aboveThreshold ?? 0,
      used: message.retrieval?.used ?? 0,
    });
  }, [message.turnOutcome, message.retrieval, agent]);
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

  /*
   * A2: the timeline and the summary live in the same slot above the answer card, so nothing
   * jumps under the reader's eye when the turn settles. While waiting there is no card chrome.
   */
  const traceBlock = waiting ? (
    <AnswerTrace head={AGENT_TRACE_HEAD[agent]} steps={traceSteps} inFlight />
  ) : summary !== null && finishedSteps.length > 0 ? (
    <AnswerTrace
      head={AGENT_TRACE_HEAD[agent]}
      steps={finishedSteps}
      inFlight={false}
      summary={summary}
      className="mb-3"
    />
  ) : null;

  if (waiting) {
    return traceBlock;
  }

  // Agent turn — refused only. Clarify (`found: false`, outcome clarified) uses the answer path.
  if (isRefusedTurn(message.turnOutcome ?? undefined)) {
    return (
      <div className="flex flex-col">
        {traceBlock}
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
      </div>
    );
  }

  // Agent turn — answer (including while streaming text after the wait)
  return (
    <div className="flex flex-col">
      {traceBlock}
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
              candidate={false}
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
        <Markdown citationMarkers={citationMarkers}>{message.text}</Markdown>
      </AnswerCard>
    </div>
  );
});
