"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createStreamWatchdog,
  traceItemsFromEvent,
  type AnswerTraceItem,
} from "@wunderstack/ui";
import {
  chatEventSchema,
  errored,
  type ChatCitation,
  type WritableTurnOutcome,
} from "@/app/api/chat/contract";
import { readChatInactivityMs } from "@/lib/public-env";
import { runtimeApiHeaders } from "@/lib/runtime-api";
import type { PlaygroundAgent } from "@/lib/runtime-config";

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
  /** Pipeline outcome from the citations event (B5 — same value analytics writes). */
  turnOutcome: WritableTurnOutcome | null;
  /** Langfuse trace id for this answer (null when tracing is unconfigured); enables feedback. */
  traceId: string | null;
  /** The rating the user gave this answer, once submitted. */
  feedback: FeedbackRating | null;
  /** Grounded follow-up question chips (empty until a `followups` event arrives). */
  followUpQuestions: string[];
  streaming: boolean;
  /**
   * What the runtime reported doing this turn, in arrival order — the source for `AnswerTrace`.
   * Only measured events land here; the client adds nothing of its own.
   */
  trace: AnswerTraceItem[];
  /**
   * Measured retrieval totals for the summary line. Null until a `retrieval` event arrives
   * (clarify turns never search, so they stay null).
   */
  retrieval: {
    considered: number;
    aboveThreshold: number;
    used: number;
  } | null;
}

const GENERIC_ERROR = "Er ging iets mis bij het beantwoorden van je vraag. Probeer het opnieuw.";
const INACTIVITY_ERROR =
  "De verbinding met de assistent viel stil. Probeer je vraag opnieuw te stellen.";
const SESSION_STORAGE_KEY = "wunderstack-session-id";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
}

/**
 * A stable id for this browser session, shared with the Langfuse trace + interaction event-log
 * (one identity model, Fase 1). Persisted in sessionStorage so it survives re-renders and reloads
 * within the tab. SSR-safe: storage access is guarded and falls back to a fresh id.
 */
function readOrCreateSessionId(): string {
  try {
    const existing = globalThis.sessionStorage?.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }
  } catch {
    /* storage unavailable (SSR / privacy mode) — fall through to a fresh id */
  }
  const id = newId();
  try {
    globalThis.sessionStorage?.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    /* best-effort */
  }
  return id;
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

export function useChat(fund?: string, agent: PlaygroundAgent = "cao") {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror the latest messages so callbacks can read a message's traceId without stale closures.
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  // One stable session id per hook instance (lazily resolved on first send, SSR-safe).
  const sessionIdRef = useRef<string | null>(null);

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
      sessionIdRef.current ??= readOrCreateSessionId();
      const sessionId = sessionIdRef.current;

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
          turnOutcome: null,
          traceId: null,
          feedback: null,
          followUpQuestions: [],
          streaming: false,
          trace: [],
          retrieval: null,
        },
        {
          id: assistantId,
          role: "assistant",
          text: "",
          citations: [],
          citationVerificationFailed: false,
          found: null,
          needsClarification: false,
          turnOutcome: null,
          traceId: null,
          feedback: null,
          followUpQuestions: [],
          streaming: true,
          // Empty: the trace only shows measured events. Until the first one lands, the wait UI is
          // its head line ("Zoeken in de CAO") — true from the moment the question is sent (B1).
          trace: [],
          retrieval: null,
        },
      ]);

      // Declared outside try so the catch can distinguish inactivity abort from unmount abort.
      let abortedForInactivity = false;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: runtimeApiHeaders(agent),
          body: JSON.stringify({
            question: trimmed,
            history,
            sessionId,
            channel: "playground",
            ...(fund ? { fund } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`chat request failed: ${String(response.status)}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Liveness watchdog: signalled on every byte (status, heartbeats, text, …). If the stream
        // goes fully silent (server crash mid-buffer, dropped connection without abort), abort and
        // surface a retryable error instead of spinning forever on "Bronvermelding controleren…".
        // Time the tab spends hidden or suspended does not count — see createStreamWatchdog.
        const watchdog = createStreamWatchdog({
          timeoutMs: readChatInactivityMs(),
          onTimeout: () => {
            abortedForInactivity = true;
            controller.abort();
          },
        });

        const handleLine = (raw: string) => {
          const trimmedLine = raw.trim();
          if (trimmedLine.length === 0) {
            return;
          }
          let json: unknown;
          try {
            json = JSON.parse(trimmedLine);
          } catch {
            return; /* ignore a partial/garbled line */
          }
          const parsed = chatEventSchema.safeParse(json);
          if (!parsed.success) {
            return;
          }
          const event = parsed.data;
          if (event.type === "status" || event.type === "retrieval") {
            const items = traceItemsFromEvent(event);
            patchAssistant(assistantId, (m) => ({
              ...m,
              ...(items.length > 0 ? { trace: [...m.trace, ...items] } : {}),
              ...(event.type === "retrieval"
                ? {
                    retrieval: {
                      considered: event.considered,
                      aboveThreshold: event.aboveThreshold,
                      used: event.used,
                    },
                  }
                : {}),
            }));
          } else if (event.type === "citations") {
            // Reconcile: replace streamed text with the final answer (failed markers stripped),
            // and attach the verified citations. Stop any pending token flush from re-appending.
            // Clarify turns also feed the trace here (one "read" step, no search — A2).
            reconciled = true;
            pendingText = "";
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            const clarifyItems = traceItemsFromEvent(event);
            patchAssistant(assistantId, (m) => ({
              ...m,
              text: event.answer,
              citations: event.citations,
              citationVerificationFailed: event.citationVerificationFailed,
              found: event.found,
              needsClarification: event.needsClarification,
              turnOutcome: event.turnOutcome,
              ...(clarifyItems.length > 0 ? { trace: [...m.trace, ...clarifyItems] } : {}),
            }));
          } else if (event.type === "text") {
            pendingText += event.delta;
            scheduleFlush();
          } else if (event.type === "followups") {
            patchAssistant(assistantId, (m) => ({ ...m, followUpQuestions: event.questions }));
          } else if (event.type === "done") {
            patchAssistant(assistantId, (m) => ({ ...m, traceId: event.traceId }));
          } else if (event.type === "error") {
            pendingText = "";
            if (rafId !== null) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            patchAssistant(assistantId, (m) => ({
              ...m,
              text: event.message,
              turnOutcome: errored("provider_error"),
            }));
          }
        };

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            watchdog.signal();
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
        } finally {
          watchdog.stop();
        }
      } catch {
        // Liveness watchdog: show a retryable error. Unmount abort: leave partial answer as-is.
        // Any other failure: generic error when the bubble is still empty.
        if (abortedForInactivity) {
          flushNow();
          patchAssistant(assistantId, (m) => ({
            ...m,
            text: m.text.length > 0 ? m.text : INACTIVITY_ERROR,
            turnOutcome: m.turnOutcome ?? errored("timeout"),
          }));
        } else if (!controller.signal.aborted) {
          flushNow();
          patchAssistant(assistantId, (m) => ({
            ...m,
            text: m.text.length > 0 ? m.text : GENERIC_ERROR,
            turnOutcome: m.turnOutcome ?? errored("provider_error"),
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
    [fund, agent, patchAssistant],
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
