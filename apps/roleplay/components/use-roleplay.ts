"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RoleplayDifficulty,
  RoleplayReviewPayload,
  RoleplayStartResponse,
} from "@wunderstack/shared/browser";

import { roleplayErrorMessage } from "@/lib/errors";
import { readRoleplayInactivityMs, REVIEW_POLL_BUDGET_MS, REVIEW_POLL_MS } from "@/lib/public-env";
import {
  pollRoleplayReview,
  requestRoleplayReview,
  RoleplayApiError,
  startRoleplaySession,
  streamRoleplayTurn,
} from "@/lib/roleplay-api";

export type TranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming: boolean;
};

export type SessionPhase = "briefing" | "playing" | "reviewing" | "reviewed";

export interface RoleplaySessionState {
  phase: SessionPhase;
  starting: boolean;
  sending: boolean;
  error: string | null;
  started: RoleplayStartResponse | null;
  messages: TranscriptMessage[];
  turnsUsed: number;
  maxTurns: number;
  conversationEnded: boolean;
  review: RoleplayReviewPayload | null;
  start: () => Promise<void>;
  beginConversation: () => void;
  send: (message: string) => Promise<void>;
  finish: () => Promise<void>;
  /** Re-run review after a timeout or request failure. Conversation stays ended. */
  retryReview: () => Promise<void>;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random());
}

export function useRoleplaySession(
  scenarioSlug: string,
  difficulty?: RoleplayDifficulty,
): RoleplaySessionState {
  const [phase, setPhase] = useState<SessionPhase>("briefing");
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<RoleplayStartResponse | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [turnsUsed, setTurnsUsed] = useState(0);
  const [maxTurns, setMaxTurns] = useState(1);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [review, setReview] = useState<RoleplayReviewPayload | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const sendingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const reviewedRef = useRef(false);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(async () => {
    if (startingRef.current || sessionIdRef.current) {
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await startRoleplaySession({
        scenarioSlug,
        ...(difficulty === undefined ? {} : { difficulty }),
        signal: controller.signal,
      });
      sessionIdRef.current = result.sessionId;
      setStarted(result);
      setTurnsUsed(result.turnsUsed);
      setMaxTurns(result.maxTurns);
      setPhase("briefing");
    } catch (caught) {
      if (controller.signal.aborted) {
        return;
      }
      setError(caught instanceof RoleplayApiError ? caught.message : roleplayErrorMessage("start_failed"));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [difficulty, scenarioSlug]);

  const beginConversation = useCallback(() => {
    if (!started) {
      return;
    }
    setMessages([
      {
        id: newId(),
        role: "assistant",
        text: started.opening,
        streaming: false,
      },
    ]);
    setPhase("playing");
  }, [started]);

  const runReview = useCallback(async (endReason?: "abandoned") => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || reviewedRef.current) {
      return;
    }
    reviewedRef.current = true;
    setPhase("reviewing");
    setConversationEnded(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const first = await requestRoleplayReview({
        sessionId,
        ...(endReason === undefined ? {} : { endReason }),
        signal: controller.signal,
      });
      if (first.status === "ready") {
        setReview(first.review);
        setPhase("reviewed");
        return;
      }

      const deadline = Date.now() + REVIEW_POLL_BUDGET_MS;
      while (Date.now() < deadline && !controller.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, REVIEW_POLL_MS));
        const next = await pollRoleplayReview({ sessionId, signal: controller.signal });
        if (next.status === "ready") {
          setReview(next.review);
          setPhase("reviewed");
          return;
        }
      }
      // Stay in reviewing with a retry: the conversation is over; do not re-enable the composer.
      reviewedRef.current = false;
      setError("De beoordeling duurde te lang. Probeer het opnieuw.");
    } catch (caught) {
      if (controller.signal.aborted) {
        return;
      }
      // Request failure: stay ended + reviewing so the learner can retry without chatting again.
      reviewedRef.current = false;
      setError(caught instanceof RoleplayApiError ? caught.message : roleplayErrorMessage("unknown"));
      setPhase("reviewing");
    }
  }, []);

  const retryReview = useCallback(async () => {
    await runReview();
  }, [runReview]);

  const send = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      const sessionId = sessionIdRef.current;
      if (trimmed.length === 0 || sendingRef.current || !sessionId || conversationEnded) {
        return;
      }

      sendingRef.current = true;
      setSending(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const assistantId = newId();

      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", text: trimmed, streaming: false },
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);

      let abortedForInactivity = false;
      const inactivityMs = readRoleplayInactivityMs();
      let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
      const clearInactivity = () => {
        if (inactivityTimer !== null) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
      };
      const armInactivity = () => {
        clearInactivity();
        inactivityTimer = setTimeout(() => {
          abortedForInactivity = true;
          controller.abort();
        }, inactivityMs);
      };
      armInactivity();

      let ended = false;

      try {
        for await (const event of streamRoleplayTurn({
          sessionId,
          message: trimmed,
          signal: controller.signal,
          onByte: armInactivity,
        })) {
          if (event.type === "text") {
            setMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantId ? { ...entry, text: entry.text + event.delta } : entry,
              ),
            );
          } else if (event.type === "turn") {
            setMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantId
                  ? { ...entry, text: event.reply, streaming: false }
                  : entry,
              ),
            );
            setTurnsUsed(event.turnsUsed);
            setMaxTurns(event.maxTurns);
            if (event.conversationEnd) {
              ended = true;
            }
          } else if (event.type === "error") {
            setMessages((prev) =>
              prev.map((entry) =>
                entry.id === assistantId
                  ? { ...entry, text: event.message, streaming: false }
                  : entry,
              ),
            );
          }
        }
      } catch (caught) {
        if (controller.signal.aborted && !abortedForInactivity) {
          setMessages((prev) => prev.filter((entry) => entry.id !== assistantId));
          return;
        }
        const code = caught instanceof RoleplayApiError ? caught.code : "unknown";
        if (code === "no_turns_left" || code === "session_ended") {
          setMessages((prev) => prev.filter((entry) => entry.id !== assistantId || entry.text.length > 0));
          ended = true;
        } else {
          const messageText = abortedForInactivity
            ? "Het duurde te lang om te reageren. Probeer je bericht opnieuw te versturen."
            : caught instanceof RoleplayApiError
              ? caught.message
              : roleplayErrorMessage("unknown");
          setError(messageText);
          setMessages((prev) =>
            prev.map((entry) =>
              entry.id === assistantId && entry.text.length === 0
                ? { ...entry, text: messageText, streaming: false }
                : { ...entry, streaming: false },
            ),
          );
        }
      } finally {
        clearInactivity();
        sendingRef.current = false;
        setSending(false);
        setMessages((prev) =>
          prev.map((entry) => (entry.id === assistantId ? { ...entry, streaming: false } : entry)),
        );
      }

      if (ended) {
        await runReview();
      }
    },
    [conversationEnded, runReview],
  );

  const finish = useCallback(async () => {
    if (sendingRef.current || conversationEnded) {
      return;
    }
    await runReview("abandoned");
  }, [conversationEnded, runReview]);

  return {
    phase,
    starting,
    sending,
    error,
    started,
    messages,
    turnsUsed,
    maxTurns,
    conversationEnded,
    review,
    start,
    beginConversation,
    send,
    finish,
    retryReview,
  };
}
