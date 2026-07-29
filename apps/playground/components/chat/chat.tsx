"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_THEME, type StarterCategory } from "@/lib/fund-theme";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { Starters } from "./starters";
import { ChatThread } from "./thread";
import { useChat } from "./use-chat";

interface ChatProps {
  /** Restrict answers to one O&O fund's CAO. */
  fund?: string;
  /** Compact chrome for the embeddable widget (no outer max-width / padding). */
  embedded?: boolean;
  /** Fund-configurable starter question categories (see lib/fund-theme.ts). */
  starterCategories?: StarterCategory[];
}

/** Distance from the bottom (px) within which we consider the user "pinned" to the latest message. */
const NEAR_BOTTOM_THRESHOLD = 80;

export function Chat({ fund, embedded = false, starterCategories }: ChatProps) {
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
    <ChatThread
      className={embedded ? "" : "mx-auto w-full max-w-2xl"}
      scrollRef={scrollRef}
      onScroll={onScroll}
      composer={
        <div className="flex flex-col gap-2">
          <Composer disabled={isStreaming} onSend={send} />
          <p className="px-3 text-center text-xs text-text-subtle">
            Je praat met een AI. Antwoorden zijn algemene uitleg, geen persoonlijk advies.
          </p>
        </div>
      }
    >
      {empty ? (
        <Starters categories={starterCategories ?? DEFAULT_THEME.starterCategories} onPick={send} />
      ) : (
        <MessageList
          messages={messages}
          {...(fund ? { fund } : {})}
          onFeedback={sendFeedback}
          onFollowUp={send}
          followUpsDisabled={isStreaming}
        />
      )}
    </ChatThread>
  );
}
