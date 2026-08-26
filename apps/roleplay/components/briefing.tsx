"use client";

import { Button, Card } from "@wunderstack/ui";

export function Briefing({
  title,
  briefing,
  partnerRole,
  userTitle,
  onBegin,
}: {
  title: string;
  briefing: string;
  partnerRole: string;
  userTitle: string;
  onBegin: () => void;
}) {
  return (
    <Card className="flex w-full max-w-xl flex-col gap-5 px-8 py-8">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-primary">Voorbereiding</p>
        <h1 className="font-display text-2xl font-semibold text-text">{title}</h1>
        <p className="text-sm text-text-muted">
          Jij speelt {userTitle}. Je gesprekspartner speelt {partnerRole}.
        </p>
      </header>
      <div className="whitespace-pre-wrap text-base leading-relaxed text-text">{briefing}</div>
      <Button type="button" onClick={onBegin}>
        Begin het gesprek
      </Button>
    </Card>
  );
}
