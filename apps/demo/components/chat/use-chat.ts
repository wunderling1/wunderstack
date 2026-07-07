"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chatEventSchema, type ChatCitation, type ChatSource } from "@/app/api/chat/contract";

/**
 * Client-side chat state + the NDJSON stream reader. Talks only to `/api/chat`; it never touches the
 * agent or Mastra (that lives server-side behind the API). Each response line is validated against
 * the shared `chatEventSchema` before it mutates state.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: ChatSource[];
  /** Structure-aware citations (article/lid + snippet); rendered by Citation.tsx (Fase 12). */
  citations: ChatCitation[];
  found: boolean | null;
  /** True when the assistant asked a clarifying question instead of answering. */
  needsClarification: boolean;
  streaming: boolean;
}

const GENERIC_ERROR = "Er ging iets mis bij het beantwoorden van je vraag. Probeer het opnieuw.";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
}

export function useChat(fund?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cancel any in-flight request when the component unmounts, so the server stops generating.
  useEffect(() => () => abortRef.current?.abort(), []);

  const patchAssistant = useCallback((id: string, patch: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? patch(m) : m)));
  }, []);

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (trimmed.length === 0 || streamingRef.current) {
        return;
      }

      streamingRef.current = true;
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const assistantId = newId();
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "user",
          text: trimmed,
          sources: [],
          citations: [],
          found: null,
          needsClarification: false,
          streaming: false,
        },
        {
          id: assistantId,
          role: "assistant",
          text: "",
          sources: [],
          citations: [],
          found: null,
          needsClarification: false,
          streaming: true,
        },
      ]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: trimmed, ...(fund ? { fund } : {}) }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`chat request failed: ${String(response.status)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        const handleLine = (raw: string) => {
          const trimmedLine = raw.trim();
          if (trimmedLine.length === 0) {
            return;
          }
          const parsed = chatEventSchema.safeParse(JSON.parse(trimmedLine));
          if (!parsed.success) {
            return;
          }
          const event = parsed.data;
          if (event.type === "sources") {
            patchAssistant(assistantId, (m) => ({
              ...m,
              sources: event.sources,
              citations: event.citations,
              found: event.found,
              needsClarification: event.needsClarification,
            }));
          } else if (event.type === "text") {
            patchAssistant(assistantId, (m) => ({ ...m, text: m.text + event.delta }));
          } else if (event.type === "error") {
            patchAssistant(assistantId, (m) => ({ ...m, text: event.message }));
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const l of lines) {
            handleLine(l);
          }
        }
        if (buffer.length > 0) {
          handleLine(buffer);
        }
      } catch {
        // A deliberate abort (unmount) is not an error; leave the partial answer as-is.
        if (!controller.signal.aborted) {
          patchAssistant(assistantId, (m) => ({
            ...m,
            text: m.text.length > 0 ? m.text : GENERIC_ERROR,
          }));
        }
      } finally {
        patchAssistant(assistantId, (m) => ({ ...m, streaming: false }));
        streamingRef.current = false;
        setIsStreaming(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [fund, patchAssistant],
  );

  return { messages, isStreaming, send };
}
