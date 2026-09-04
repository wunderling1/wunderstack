"use client";

import type { RoleplayDifficulty } from "@wunderstack/shared/browser";
import { Button, Card, useScrollAnchor } from "@wunderstack/ui";
import { useEffect, useRef, type ReactNode } from "react";

import { useRoleplaySession, type TranscriptMessage } from "./use-roleplay";
import { Briefing } from "./briefing";
import { Composer } from "./composer";
import { ReviewCard } from "./review";
import { Transcript } from "./transcript";
import { TurnCounter } from "./turn-counter";

function lastUserMessageId(messages: TranscriptMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      return message.id;
    }
  }
  return undefined;
}

function lastAssistant(messages: TranscriptMessage[]): TranscriptMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return undefined;
}

export function Session({
  scenarioSlug,
  difficulty,
}: {
  scenarioSlug: string;
  difficulty?: RoleplayDifficulty;
}) {
  const session = useRoleplaySession(scenarioSlug, difficulty);

  useEffect(() => {
    void session.start();
  }, [session.start]);

  if (session.starting || (session.started === null && session.error === null)) {
    return (
      <Centered>
        <p className="text-sm text-text-muted" aria-live="polite">
          De oefening wordt voorbereid…
        </p>
      </Centered>
    );
  }

  if (session.started === null) {
    return (
      <Centered>
        <p role="alert" className="text-sm text-text">
          {session.error}
        </p>
      </Centered>
    );
  }

  if (session.phase === "briefing") {
    return (
      <Centered>
        <Briefing
          title={session.started.title}
          briefing={session.started.briefing}
          partnerRole={session.started.partnerRole}
          userTitle={session.started.userTitle}
          onBegin={session.beginConversation}
        />
      </Centered>
    );
  }

  if (session.phase === "reviewed" && session.review) {
    return (
      <Centered>
        <ReviewCard review={session.review} />
      </Centered>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-page">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{session.started.title}</p>
          <p className="truncate text-xs text-text-muted">
            Jij: {session.started.userTitle} · Gesprekspartner: {session.started.partnerRole}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TurnCounter used={session.turnsUsed} max={session.maxTurns} />
          {session.phase === "playing" ? (
            <Button type="button" variant="secondary" size="default" onClick={() => void session.finish()}>
              Afronden
            </Button>
          ) : null}
        </div>
      </header>

      {session.phase === "reviewing" ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <Card className="max-w-md px-6 py-8 text-center">
            {session.error ? (
              <>
                <p role="alert" className="text-sm text-state-danger-fg">
                  {session.error}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Het gesprek is afgelopen. Je kunt de beoordeling opnieuw starten.
                </p>
                <div className="mt-4">
                  <Button type="button" onClick={() => void session.retryReview()}>
                    Opnieuw beoordelen
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-text" aria-live="polite">
                  Je gesprek wordt beoordeeld…
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  Dit kan een minuut duren. Je mag dit tabblad sluiten; de beoordeling loopt door.
                </p>
              </>
            )}
          </Card>
        </div>
      ) : (
        <PlayingPane
          messages={session.messages}
          partnerRole={session.started.partnerRole}
          error={session.error}
          sending={session.sending}
          conversationEnded={session.conversationEnded}
          onSend={(message) => void session.send(message)}
        />
      )}
    </main>
  );
}

/**
 * Mounted only during the conversation. The shared hook's opening layout then sees the
 * partner greeting (no user turn yet) and jumps to the end without a reservation.
 */
function PlayingPane({
  messages,
  partnerRole,
  error,
  sending,
  conversationEnded,
  onSend,
}: {
  messages: TranscriptMessage[];
  partnerRole: string;
  error: string | null;
  sending: boolean;
  conversationEnded: boolean;
  onSend: (message: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserId = lastUserMessageId(messages);
  const assistant = lastAssistant(messages);
  // Short turns, tokens visible immediately. Treat the empty "Antwoordt…" spinner as the
  // status phase; the first character of the partner reply is firstToken, so a growing
  // reply never pulls the viewport.
  useScrollAnchor({
    containerRef: scrollRef,
    lastUserId,
    lastAssistantId: assistant?.id,
    assistantWaiting: assistant !== undefined && assistant.streaming && assistant.text.length === 0,
    assistantStreaming: assistant?.streaming === true,
  });

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-chat-scroll
          className="absolute inset-0 overflow-y-auto px-4 py-6"
        >
          <div className="mx-auto w-full max-w-3xl">
            {error ? (
              <p role="alert" className="mb-6 text-sm text-state-danger-fg">
                {error}
              </p>
            ) : null}
            <Transcript messages={messages} partnerRole={partnerRole} />
          </div>
        </div>
      </div>
      <div className="bg-page px-4 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <Composer disabled={sending || conversationEnded} onSend={onSend} />
          <p className="mt-2 px-3 text-center text-xs text-text-subtle">
            Je praat met een AI-gesprekspartner. Dit is een oefening, geen echt gesprek.
          </p>
        </div>
      </div>
    </>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-6 py-12">{children}</main>
  );
}
