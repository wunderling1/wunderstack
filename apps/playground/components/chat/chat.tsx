"use client";

import { useRef } from "react";
import { DEFAULT_THEME, type StarterCategory } from "@/lib/fund-theme";
import type { PlaygroundAgent } from "@/lib/runtime-config";
import { useScrollAnchor } from "@wunderstack/ui";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { Starters } from "./starters";
import { ChatThread } from "./thread";
import { useChat, type ChatMessage } from "./use-chat";

function lastUserMessageId(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      return message.id;
    }
  }
  return undefined;
}

function lastAssistant(messages: ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
}

interface ChatProps {
  /** Restrict answers to one O&O fund's corpus. */
  fund?: string;
  /** Catalog agent instance (drives tenant-key header). */
  agent?: PlaygroundAgent;
  /** Compact chrome for the embeddable widget (no outer max-width / padding). */
  embedded?: boolean;
  /** Fund-configurable starter question categories (see lib/fund-theme.ts). */
  starterCategories?: StarterCategory[];
  /** Empty-state heading from GET /api/config. */
  starterTitle?: string;
  /** Empty-state supporting sentence from GET /api/config. */
  starterIntro?: string;
}

export function Chat({
  fund,
  agent = "cao",
  embedded = false,
  starterCategories,
  starterTitle,
  starterIntro,
}: ChatProps) {
  const { messages, isStreaming, send, sendFeedback } = useChat(fund, agent);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserId = lastUserMessageId(messages);
  const assistant = lastAssistant(messages);
  useScrollAnchor({
    containerRef: scrollRef,
    lastUserId,
    lastAssistantId: assistant?.id,
    assistantWaiting: assistant !== undefined && assistant.streaming && assistant.turnOutcome === null,
    assistantStreaming: assistant?.streaming === true,
  });

  const empty = messages.length === 0;

  return (
    <ChatThread
      className={embedded ? "" : "mx-auto w-full max-w-3xl"}
      scrollRef={scrollRef}
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
        <Starters
          categories={starterCategories ?? DEFAULT_THEME.starterCategories}
          onPick={send}
          {...(starterTitle ? { title: starterTitle } : {})}
          {...(starterIntro ? { intro: starterIntro } : {})}
        />
      ) : (
        <MessageList
          messages={messages}
          {...(fund ? { fund } : {})}
          agent={agent}
          onFeedback={sendFeedback}
          onFollowUp={send}
          followUpsDisabled={isStreaming}
        />
      )}
    </ChatThread>
  );
}
