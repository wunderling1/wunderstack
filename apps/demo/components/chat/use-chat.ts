"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatEventSchema,
  type ChatCitation,
  type ChatStatusPhase,
} from "@/app/api/chat/contract";

/**
 * Client-side chat state + the NDJSON stream reader. Talks only to `/api/chat`; it never touches the
 * agent or Mastra (that lives server-side behind the API). Each response line is validated against
 * the shared `chatEventSchema` before it mutates state.
 */

export type FeedbackRating = "up" | "down";
type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Verified, structure-aware citations (article/lid + quote + snippet); rendered by Citation.tsx. */
  citations: ChatCitation[];
  /** True when one or more model citations failed verbatim verification. */
  citationVerificationFailed: boolean;
  found: boolean | null;
  /** True when the assistant asked a clarifying question instead of answering. */
  needsClarification: boolean;
  /** Langfuse trace id for this answer (null when tracing is unconfigured); enables feedback. */
  traceId: string | null;
  /** The rating the user gave this answer, once submitted. */
  feedback: FeedbackRating | null;
  streaming: boolean;
  /** Current progress phase while waiting for the answer; drives the status line + skeleton. */
  phase: ChatStatusPhase | null;
  /** Number of retrieved passages (from the `retrieved` phase), for the status label. */
  retrievedCount: number | null;
}

const GENERIC_ERROR = "Er ging iets mis bij het beantwoorden van je vraag. Probeer het opnieuw.";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
}

function buildHistory(messages: ChatMessage[]): ChatHistoryMessage[] {
  return messages
    .filter((message) => message.text.trim().length > 0)
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: message.text.trim(),
    }));
}

export function useChat(fund?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror the latest messages so callbacks can read a message's traceId without stale closures.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

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
      const history = buildHistory(messagesRef.current);

      // Coalesce token deltas: with real streaming the answer arrives as many small chunks, and
      // re-parsing the growing Markdown on every token janks. Buffer incoming text and flush it to
      // state at most once per animation frame.
      let pendingText = "";
      let rafId: number | null = null;
      // When the closing `citations` event reconciles the answer (stripped markers), further token
      // deltas must not re-append to the corrected text.
      let reconciled = false;
      const applyPending = () => {
        rafId = null;
        if (pendingText.length === 0 || reconciled) {
          return;
        }
        const chunk = pendingText;
        pendingText = "";
        patchAssistant(assistantId, (m) => ({ ...m, text: m.text + chunk }));
      };
      const scheduleFlush = () => {
        rafId ??= requestAnimationFrame(applyPending);
      };
      const flushNow = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        applyPending();
      };

      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "user",
          text: trimmed,
          citations: [],
          citationVerificationFailed: false,
          found: null,
          needsClarification: false,
          traceId: null,
          feedback: null,
          streaming: false,
          phase: null,
          retrievedCount: null,
        },
        {
          id: assistantId,
          role: "assistant",
          text: "",
          citations: [],
          citationVerificationFailed: false,
          found: null,
          needsClarification: false,
          traceId: null,
          feedback: null,
          streaming: true,
          // Optimistic first phase so a named status shows <100ms after send, before any server event.
          phase: "searching",
          retrievedCount: null,
        },
      ]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: trimmed, history, ...(fund ? { fund } : {}) }),
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
          if (event.type === "status") {
            patchAssistant(assistantId, (m) => ({
              ...m,
              phase: event.phase,
              retrievedCount: event.count ?? m.retrievedCount,
            }));
          } else if (event.type === "citations") {
            // Reconcile: replace streamed text with the final answer (failed markers stripped),
            // and attach the verified citations. Stop any pending token flush from re-appending.
            reconciled = true;
            pendingText = "";
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            patchAssistant(assistantId, (m) => ({
              ...m,
              text: event.answer,
              citations: event.citations,
              citationVerificationFailed: event.citationVerificationFailed,
              found: event.found,
              needsClarification: event.needsClarification,
            }));
          } else if (event.type === "text") {
            pendingText += event.delta;
            scheduleFlush();
          } else if (event.type === "done") {
            patchAssistant(assistantId, (m) => ({ ...m, traceId: event.traceId }));
          } else if (event.type === "error") {
            pendingText = "";
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
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
        flushNow();
      } catch {
        // A deliberate abort (unmount) is not an error; leave the partial answer as-is.
        if (!controller.signal.aborted) {
          flushNow();
          patchAssistant(assistantId, (m) => ({
            ...m,
            text: m.text.length > 0 ? m.text : GENERIC_ERROR,
          }));
        } else if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
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

  const sendFeedback = useCallback(
    async (messageId: string, rating: FeedbackRating, reason?: string) => {
      const traceId = messagesRef.current.find((m) => m.id === messageId)?.traceId ?? null;
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m)));
      if (traceId === null) {
        return;
      }
      try {
        await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ traceId, rating, ...(reason ? { reason } : {}) }),
        });
      } catch {
        // Feedback is best-effort; a failed submit leaves the optimistic UI state as-is.
      }
    },
    [],
  );

  return { messages, isStreaming, send, sendFeedback };
}
