"use client";

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./use-chat";

/** Renders the conversation: user/assistant bubbles, streaming caret, and cited sources. */
export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const showCaret = message.streaming && message.text.length === 0;

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

        {!isUser && message.sources.length > 0 ? <Sources message={message} /> : null}
      </div>
    </div>
  );
}

function Sources({ message }: { message: ChatMessage }) {
  return (
    <div className="mt-3 border-t border-border pt-2">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Bronnen</p>
      <ul className="flex flex-col gap-1">
        {message.sources.map((source) => (
          <li key={source.ref} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              [{source.ref}]
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3 shrink-0" />
              <span>
                {source.title}
                <span className="opacity-60">
                  {" "}
                  · {source.fund} · v{source.version}
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
