"use client";

import { AnswerCard } from "@wunderstack/ui";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import type { TranscriptMessage } from "./use-roleplay";

export function Transcript({
  messages,
  partnerRole,
}: {
  messages: TranscriptMessage[];
  partnerRole: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div className="flex flex-col gap-6">
      {messages.map((message) =>
        message.role === "user" ? (
          <AnswerCard key={message.id} role="user">
            <p className="whitespace-pre-wrap">{message.text}</p>
          </AnswerCard>
        ) : (
          <AnswerCard key={message.id} role="agent" agentLabel={partnerRole}>
            {message.streaming && message.text.length === 0 ? (
              <p className="flex items-center gap-2 text-text-muted" aria-live="polite">
                <Loader2 className="motion-spin h-4 w-4" aria-hidden />
                Antwoordt…
              </p>
            ) : (
              <p className="whitespace-pre-wrap">{message.text}</p>
            )}
          </AnswerCard>
        ),
      )}
      <div ref={endRef} />
    </div>
  );
}
