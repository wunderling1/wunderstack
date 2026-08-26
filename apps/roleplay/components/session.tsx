"use client";

import type { RoleplayDifficulty } from "@wunderstack/shared/browser";
import { Button, Card } from "@wunderstack/ui";
import { useEffect, type ReactNode } from "react";

import { useRoleplaySession } from "./use-roleplay";
import { Briefing } from "./briefing";
import { Composer } from "./composer";
import { ReviewCard } from "./review";
import { Transcript } from "./transcript";
import { TurnCounter } from "./turn-counter";

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
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
              {session.error ? (
                <p role="alert" className="text-sm text-state-danger-fg">
                  {session.error}
                </p>
              ) : null}
              <Transcript
                messages={session.messages}
                partnerRole={session.started.partnerRole}
              />
            </div>
          </div>
          <div className="bg-page px-4 py-4">
            <div className="mx-auto w-full max-w-3xl">
              <Composer
                disabled={session.sending || session.conversationEnded}
                onSend={(message) => void session.send(message)}
              />
              <p className="mt-2 px-3 text-center text-xs text-text-subtle">
                Je praat met een AI-gesprekspartner. Dit is een oefening, geen echt gesprek.
              </p>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-6 py-12">{children}</main>
  );
}
