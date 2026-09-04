import type {
  ConversationItem,
  ConversationQuestion,
  ExerciseConversation,
  GroundedConversation,
} from "@wunderstack/analytics";
import { Card, Chip, CitationBadge } from "@wunderstack/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  exerciseStatusLabel,
  outcomeChipVariant,
  outcomeLabel,
  questionAnchorId,
  reasonLabel,
} from "@/lib/conversations";
import { agentLabel } from "@/lib/release-manifest";

const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const time = new Intl.DateTimeFormat("nl-NL", { timeStyle: "short" });
const CITATION_CHIP_CAP = 8;

/** Questions rendered inside one card before the rest is left to the permalink. */
export const CONVERSATION_QUESTION_CAP = 6;

/**
 * A conversation and an exercise session are the same shape: a container with turns (S22). One
 * shell, two contents — the shell never asks which agent key it is looking at (S15/D3).
 */
export function ConversationCard({
  item,
  permalinkFor,
  expanded = false,
  highlightId,
}: {
  item: ConversationItem;
  /** Builds a permalink for one id (question id or session id). */
  permalinkFor: (id: string) => string;
  /** Detail view: show every question instead of capping at CONVERSATION_QUESTION_CAP. */
  expanded?: boolean;
  /** The question a permalink was opened for — marked so the link lands on it, not near it. */
  highlightId?: string;
}) {
  if (item.kind === "exercise") {
    return <ExerciseCard item={item} permalink={permalinkFor(item.id)} />;
  }
  return (
    <GroundedCard
      item={item}
      permalinkFor={permalinkFor}
      expanded={expanded}
      highlightId={highlightId}
    />
  );
}

function CardShell({
  meta,
  badge,
  children,
}: {
  meta: ReactNode;
  badge: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card variant="flush" className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">{meta}</p>
        {badge}
      </div>
      {children}
    </Card>
  );
}

function GroundedCard({
  item,
  permalinkFor,
  expanded,
  highlightId,
}: {
  item: GroundedConversation;
  permalinkFor: (id: string) => string;
  expanded: boolean;
  highlightId?: string;
}) {
  const count = item.questions.length;
  // Matched questions are what the filter selected, so they are never the ones that get cut.
  const shown = expanded ? item.questions : pickQuestions(item.questions);
  const hidden = count - shown.length;

  return (
    <CardShell
      meta={
        <>
          {agentLabel(item.agentKey)} · {dateTime.format(item.startedAt)}
        </>
      }
      // Not a Chip: a question count is a quantity, and every chip variant here means a state.
      badge={
        <span className="text-xs text-text-muted">
          {count === 1 ? "1 vraag" : `${count} vragen`}
        </span>
      }
    >
      {/* The conversation has a course, not an outcome: every chip sits on a question (S22). */}
      <ol className="flex flex-col gap-3">
        {shown.map((question) => (
          <li key={question.id} id={questionAnchorId(question.id)} tabIndex={-1}>
            <QuestionRow
              question={question}
              permalink={permalinkFor(question.id)}
              emphasised={question.matchesFilter || question.id === highlightId}
            />
          </li>
        ))}
      </ol>
      {hidden > 0 ? (
        <p className="text-xs text-text-subtle">
          <Link href={permalinkFor(item.id)} className="text-primary hover:underline">
            {hidden === 1 ? "Nog 1 vraag in dit gesprek" : `Nog ${hidden} vragen in dit gesprek`}
          </Link>
        </p>
      ) : null}
      {!item.threaded ? (
        <p className="text-xs text-text-subtle">
          Losse vraag: dit kanaal levert geen gespreks-id, dus beurten zijn niet te rijgen.
        </p>
      ) : null}
    </CardShell>
  );
}

/** Keeps every filter match, then fills up to the cap with the oldest remaining questions. */
function pickQuestions(questions: ConversationQuestion[]): ConversationQuestion[] {
  if (questions.length <= CONVERSATION_QUESTION_CAP) return questions;
  const matched = new Set(
    questions.filter((question) => question.matchesFilter).map((question) => question.id),
  );
  const room = Math.max(CONVERSATION_QUESTION_CAP - matched.size, 0);
  let filled = 0;
  return questions.filter((question) => {
    if (matched.has(question.id)) return true;
    if (filled < room) {
      filled += 1;
      return true;
    }
    return false;
  });
}

function QuestionRow({
  question,
  permalink,
  emphasised,
}: {
  question: ConversationQuestion;
  permalink: string;
  /** Either the filter selected this question, or a permalink was opened for it. */
  emphasised: boolean;
}) {
  const reason = reasonLabel(question.outcomeReason);
  const citationCount = question.citationCount;
  const shown = Math.min(citationCount, CITATION_CHIP_CAP);
  const extra = citationCount - shown;

  return (
    <div
      className={
        emphasised
          ? "rounded-[var(--radius-card)] border border-border bg-surface-sunk p-3"
          : "p-3"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-text">{question.question ?? "Vraag niet vastgelegd"}</p>
        <Chip size="sm" variant={outcomeChipVariant(question.outcome)}>
          {outcomeLabel(question.outcome)}
        </Chip>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        {time.format(question.occurredAt)}
        {reason ? ` · reden: ${reason}` : null}
      </p>
      {citationCount > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
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
      <p className="mt-2">
        <Link href={permalink} className="text-xs text-primary hover:underline">
          Permalink
        </Link>
      </p>
    </div>
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
    <CardShell
      meta={dateTime.format(item.occurredAt)}
      badge={
        <Chip variant={item.endReason === "abandoned" ? "refusal" : "verified"}>
          {exerciseStatusLabel(item.status, item.endReason)}
        </Chip>
      }
    >
      <p className="text-sm font-medium text-text">{item.scenarioSlug}</p>
      <p className="text-sm text-text-muted">
        {item.turnsUsed} van {item.maxTurns} beurten
      </p>
      <p>
        <Link href={permalink} className="text-xs text-primary hover:underline">
          Permalink
        </Link>
      </p>
    </CardShell>
  );
}
