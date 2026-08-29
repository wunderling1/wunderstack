"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_THEME, type StarterCategory } from "@/lib/fund-theme";
import type { TenantPublicConfig } from "@wunderstack/shared";
import type { PlaygroundAgent } from "@/lib/runtime-config";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { Starters } from "./starters";
import { ChatThread } from "./thread";
import { useChat, type ChatMessage } from "./use-chat";

/** Align a new turn to the top of the thread so the answer is readable from the start. */
function scrollChildToStart(container: HTMLElement, child: HTMLElement): void {
  const nextTop =
    container.scrollTop + (child.getBoundingClientRect().top - container.getBoundingClientRect().top);
  container.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
}

function lastUserMessageId(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      return message.id;
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
  /** Progress phase labels from GET /api/config. */
  statusLabels?: TenantPublicConfig["statusLabels"];
}

export function Chat({
  fund,
  agent = "cao",
  embedded = false,
  starterCategories,
  starterTitle,
  starterIntro,
  statusLabels,
}: ChatProps) {
  const { messages, isStreaming, send, sendFeedback } = useChat(fund, agent);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserId = lastUserMessageId(messages);

  // Scroll only when a new user turn starts. Stick-to-bottom would land on follow-up chips once the
  // answer footer grows, so the user never sees the start of the reply they just got.
  useEffect(() => {
    if (lastUserId === undefined) return;
    const container = scrollRef.current;
    const target = container?.querySelector(`[data-message-id="${lastUserId}"]`);
    if (!container || !(target instanceof HTMLElement)) return;
    scrollChildToStart(container, target);
  }, [lastUserId]);

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
          {...(statusLabels ? { statusLabels } : {})}
          onFeedback={sendFeedback}
          onFollowUp={send}
          followUpsDisabled={isStreaming}
        />
      )}
    </ChatThread>
  );
}
