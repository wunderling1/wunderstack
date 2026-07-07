"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { Starters } from "./starters";
import { useChat } from "./use-chat";

interface ChatProps {
  /** Restrict answers to one O&O fund's CAO. */
  fund?: string;
  /** Compact chrome for the embeddable widget (no outer max-width / padding). */
  embedded?: boolean;
  /** Fund-configurable starter questions (see lib/fund-theme.ts). */
  starters?: string[];
  /** Fund-configurable tagline shown on the empty state. */
  tagline?: string;
}

const DEFAULT_STARTERS = [
  "Hoeveel vakantiedagen krijg ik volgens de CAO?",
  "Wat is de opzegtermijn bij ontslag?",
  "Heb ik recht op een reiskostenvergoeding?",
];

const DEFAULT_TAGLINE = "Stel een vraag over de CAO";

export function Chat({ fund, embedded = false, starters, tagline }: ChatProps) {
  const { messages, isStreaming, send, sendFeedback } = useChat(fund);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const empty = messages.length === 0;

  return (
    <div className={cn("flex h-full flex-col", embedded ? "" : "mx-auto w-full max-w-2xl")}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {empty ? (
          <Starters
            tagline={tagline ?? DEFAULT_TAGLINE}
            starters={starters ?? DEFAULT_STARTERS}
            onPick={send}
          />
        ) : (
          <MessageList messages={messages} onFeedback={sendFeedback} />
        )}
      </div>

      <div className="border-t border-border bg-background px-4 py-3">
        <Composer disabled={isStreaming} onSend={send} />
      </div>
    </div>
  );
}
