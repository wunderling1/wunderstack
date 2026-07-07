"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { useChat } from "./use-chat";

interface ChatProps {
  /** Restrict answers to one O&O fund's CAO. */
  fund?: string;
  /** Compact chrome for the embeddable widget (no outer max-width / padding). */
  embedded?: boolean;
}

const SUGGESTIONS = [
  "Hoeveel vakantiedagen krijg ik volgens de CAO?",
  "Wat is de opzegtermijn bij ontslag?",
  "Heb ik recht op een reiskostenvergoeding?",
];

export function Chat({ fund, embedded = false }: ChatProps) {
  const { messages, isStreaming, send } = useChat(fund);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const empty = messages.length === 0;

  return (
    <div className={cn("flex h-full flex-col", embedded ? "" : "mx-auto w-full max-w-2xl")}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {empty ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Stel een vraag over de CAO. Ik antwoord met bronvermelding en verzin niets.
            </p>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </div>

      <div className="border-t border-border bg-background px-4 py-3">
        <Composer disabled={isStreaming} onSend={send} />
      </div>
    </div>
  );
}
