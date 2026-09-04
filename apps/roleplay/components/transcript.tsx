"use client";

import { AnswerCard } from "@wunderstack/ui";
import { Loader2 } from "lucide-react";

import type { TranscriptMessage } from "./use-roleplay";

export function Transcript({
  messages,
  partnerRole,
}: {
  messages: TranscriptMessage[];
  partnerRole: string;
}) {
  return (
    <div className="flex flex-col gap-6" data-message-list>
      {messages.map((message, index) => (
        <div
          key={message.id}
          data-message-id={message.id}
          className={index === messages.length - 1 ? "min-h-[var(--turn-min-height,0px)]" : undefined}
        >
          {message.role === "user" ? (
            <AnswerCard role="user">
              <p className="whitespace-pre-wrap">{message.text}</p>
            </AnswerCard>
          ) : (
            <AnswerCard role="agent" agentLabel={partnerRole}>
              {message.streaming && message.text.length === 0 ? (
                <p className="flex items-center gap-2 text-text-muted" aria-live="polite">
                  <Loader2 className="motion-spin h-4 w-4" aria-hidden />
                  Antwoordt…
                </p>
              ) : (
                <p className="whitespace-pre-wrap">{message.text}</p>
              )}
            </AnswerCard>
          )}
        </div>
      ))}
    </div>
  );
}
