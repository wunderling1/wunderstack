"use client";

import { cn } from "@/lib/utils";
import { Citations } from "./citation";
import { Feedback } from "./feedback";
import type { ChatMessage, FeedbackRating } from "./use-chat";

interface MessageListProps {
  messages: ChatMessage[];
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
}

/** Renders the conversation: user/assistant bubbles, streaming caret, citations and feedback. */
export function MessageList({ messages, onFeedback }: MessageListProps) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} onFeedback={onFeedback} />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  onFeedback,
}: {
  message: ChatMessage;
  onFeedback: (messageId: string, rating: FeedbackRating, reason?: string) => void;
}) {
  const isUser = message.role === "user";
  const showCaret = message.streaming && message.text.length === 0;
  const showFeedback = !isUser && !message.streaming && message.found === true && message.traceId !== null;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-primary-foreground" : "border border-border bg-card",
        )}
      >
        {showCaret ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
          </span>
        ) : (
          <p className="whitespace-pre-wrap">{message.text}</p>
        )}

        {!isUser ? <Citations citations={message.citations} /> : null}

        {showFeedback ? (
          <Feedback
            submitted={message.feedback}
            onSubmit={(rating, reason) => onFeedback(message.id, rating, reason)}
          />
        ) : null}
      </div>
    </div>
  );
}
