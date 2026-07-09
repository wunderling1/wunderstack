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

/** Distance from the bottom (px) within which we consider the user "pinned" to the latest message. */
const NEAR_BOTTOM_THRESHOLD = 80;

export function Chat({ fund, embedded = false, starters, tagline }: ChatProps) {
  const { messages, isStreaming, send, sendFeedback } = useChat(fund);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user was at the bottom before the latest update. Only then do we auto-scroll, so
  // streaming text does not yank the viewport away from someone reading earlier content.
  const pinnedToBottom = useRef(true);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD;
  };

  useEffect(() => {
    if (!pinnedToBottom.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const empty = messages.length === 0;

  return (
    <div className={cn("flex h-full flex-col", embedded ? "" : "mx-auto w-full max-w-2xl")}>
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-6">
        {empty ? (
          <Starters
            tagline={tagline ?? DEFAULT_TAGLINE}
            starters={starters ?? DEFAULT_STARTERS}
            onPick={send}
          />
        ) : (
          <MessageList messages={messages} {...(fund ? { fund } : {})} onFeedback={sendFeedback} />
        )}
      </div>

      <div className="border-t border-border bg-background px-4 py-3">
        <Composer disabled={isStreaming} onSend={send} />
      </div>
    </div>
  );
}
