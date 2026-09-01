import type { ConversationItem, ExerciseConversation, GroundedConversation } from "@wunderstack/analytics";
import { Card, Chip, CitationBadge } from "@wunderstack/ui";
import Link from "next/link";
import {
  exerciseStatusLabel,
  outcomeChipVariant,
  outcomeLabel,
  reasonLabel,
} from "@/lib/conversations";
import { agentLabel } from "@/lib/release-manifest";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const CITATION_CHIP_CAP = 8;

export function ConversationCard({
  item,
  permalink,
}: {
  item: ConversationItem;
  permalink: string;
}) {
  if (item.kind === "exercise") {
    return <ExerciseCard item={item} permalink={permalink} />;
  }
  return <GroundedCard item={item} permalink={permalink} />;
}

function GroundedCard({
  item,
  permalink,
}: {
  item: GroundedConversation;
  permalink: string;
}) {
  const reason = reasonLabel(item.outcomeReason);
  const citationCount = item.citationCount;
  const shown = Math.min(citationCount, CITATION_CHIP_CAP);
  const extra = citationCount - shown;

  return (
    <Card variant="flush" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          {agentLabel(item.agentId)} · {dateTime.format(item.occurredAt)}
        </p>
        <Chip variant={outcomeChipVariant(item.outcome)}>{outcomeLabel(item.outcome)}</Chip>
      </div>
      <p className="text-sm text-text">{item.question ?? "Vraag niet vastgelegd"}</p>
      <p className="text-sm text-text-muted">Antwoord staat niet in het event-log.</p>
      {reason ? <p className="text-xs text-text-muted">Reden: {reason}</p> : null}
      {citationCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {Array.from({ length: shown }, (_, index) => (
            <CitationBadge key={index} refNumber={index + 1} />
          ))}
          {extra > 0 ? (
            <Chip size="sm" variant="caution">
              +{extra}
            </Chip>
          ) : null}
        </div>
      ) : null}
      <Permalink href={permalink} />
    </Card>
  );
}

function ExerciseCard({
  item,
  permalink,
}: {
  item: ExerciseConversation;
  permalink: string;
}) {
  return (
    <Card variant="flush" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">{dateTime.format(item.occurredAt)}</p>
        <Chip variant={item.endReason === "abandoned" ? "refusal" : "verified"}>
          {exerciseStatusLabel(item.status, item.endReason)}
        </Chip>
      </div>
      <p className="text-sm font-medium text-text">{item.scenarioSlug}</p>
      <p className="text-sm text-text-muted">
        {item.turnsUsed} van {item.maxTurns} beurten
      </p>
      <Permalink href={permalink} />
    </Card>
  );
}

function Permalink({ href }: { href: string }) {
  return (
    <Link href={href} className="text-xs text-primary hover:underline">
      Permalink
    </Link>
  );
}
