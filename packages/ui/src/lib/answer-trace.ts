/**
 * The progress trace: one line per thing the runtime actually did, built from stream events.
 *
 * Every label here is derived from a measured field. There is no step for work we cannot observe
 * and no invented passage total. If a field is absent, the line is absent.
 *
 * Timeline (A2): searched → found (chips) → checked (chips strike through) → write.
 * Verbatim citation verification lives in the sources bar under the answer, not in this log.
 *
 * The input types are structural on purpose: `@wunderstack/ui` must not import the chat contract.
 * The playground passes events validated against `chatEventSchema`, the embed passes its own
 * mirror; both satisfy these shapes.
 */

/** A retrieved passage, shown as a chip under the found step. */
export interface AnswerTraceChip {
  /** Stable key within the step. */
  id: string;
  label: string;
  /** Scored below the retrieval threshold — measured from the stream. */
  dropped: boolean;
  /**
   * Whether the chip is rendered struck through. False while only `found` has been released;
   * becomes `dropped` once the `checked` step lands (same chips, mutating in place — A2).
   */
  struck: boolean;
}

/**
 * Tone for a step that is itself a verdict. Green stays off this type: a passage above the
 * threshold is not a verified citation, and green-with-check belongs only to the sources bar (A2).
 */
export type AnswerTraceTone = "refusal" | "danger";

export interface AnswerTraceStep {
  id: string;
  label: string;
  detail: string | null;
  /** Set only when a measured field makes this step a verdict; otherwise the step is neutral. */
  tone: AnswerTraceTone | null;
  chips: AnswerTraceChip[];
  /** Cap overflow behind the chip row, e.g. "+ 3 meer" / "+ 3 afgevallen". */
  overflowLabel: string | null;
  /** True on the write step while the answer is still being prepared — drives the dots. */
  pending: boolean;
}

/**
 * One releasable unit of the trace. `kind` doubles as the pacing kind for the progress queue,
 * so a batch of chips is spread at the chip gap and a new step at the step gap.
 */
export type AnswerTraceItem =
  | {
      kind: "step";
      id: string;
      label: string;
      detail: string | null;
      tone: AnswerTraceTone | null;
      overflowLabel?: string | null;
      pending?: boolean;
      /**
       * When set, the overflow label switches to this wording once this step is released
       * (found → checked: "+ N meer" becomes "+ N afgevallen").
       */
      overflowLabelAfterChecked?: string | null;
    }
  | { kind: "chip"; on: string; chip: Omit<AnswerTraceChip, "struck"> };

/** The stream events the trace can read. Extra fields on the caller's events are ignored. */
export type AnswerTraceEvent =
  | { type: "status"; phase: "searching" | "retrieved" | "generating" }
  | {
      type: "retrieval";
      corpus: { label: string; version: string };
      /** The text that was searched. Optional so an older embed mirror still type-checks. */
      query?: string;
      considered: number;
      aboveThreshold: number;
      hits: readonly { label: string; dropped: boolean }[];
    }
  | { type: "citations"; needsClarification: boolean };

const SEARCH_STEP = "search";
const FOUND_STEP = "found";
const CHECKED_STEP = "checked";
const WRITE_STEP = "write";
const READ_STEP = "read";

/** At most this many below-threshold chips are shown; the rest go into the overflow label. */
const MAX_DROPPED_VISIBLE = 2;

/**
 * Summary line texts for a finished turn. Kept as named constants so evals can assert the same
 * wording the UI shows (B5 — one source of truth for the outcome wording).
 */
export const TRACE_SUMMARY = {
  clarified: "Niet gezocht · verduidelijking gevraagd",
  aborted: "Beurt afgebroken",
  refusedNoCoverage: "geen passage boven de drempel",
  refusedOther: "geen antwoord gegeven",
} as const;

/**
 * The measured facts a finished turn needs to collapse into the summary line. Structural so
 * `@wunderstack/ui` does not import the chat contract.
 */
export interface AnswerTraceSummaryInput {
  outcome: "answered" | "refused" | "clarified" | "error";
  /** Caller-supplied corpus wording, e.g. "Zocht in de CAO". */
  searchedLabel: string;
  considered: number;
  aboveThreshold: number;
}

/**
 * Maps one stream event onto the trace lines it justifies. Returns an empty array for events that
 * report nothing new: `status: retrieved` is already covered by the `retrieval` event, which
 * carries the same fact with numbers behind it.
 */
export function traceItemsFromEvent(event: AnswerTraceEvent): AnswerTraceItem[] {
  if (event.type === "status") {
    if (event.phase === "searching") {
      return [
        { kind: "step", id: SEARCH_STEP, label: "Bronnen doorzoeken", detail: null, tone: null },
      ];
    }
    if (event.phase === "generating") {
      return [
        {
          kind: "step",
          id: WRITE_STEP,
          label: "Antwoord opstellen",
          detail: null,
          tone: null,
          pending: true,
        },
      ];
    }
    return [];
  }

  if (event.type === "citations") {
    if (!event.needsClarification) {
      return [];
    }
    // Clarify runs before retrieval: one step, no search (A2).
    return [
      {
        kind: "step",
        id: READ_STEP,
        label: "Vraag gelezen",
        detail: "Er ontbrak informatie om te kunnen zoeken",
        tone: null,
      },
    ];
  }

  const items: AnswerTraceItem[] = [
    // Same id as the `searching` step: the corpus is only known once retrieval returns, so this
    // replaces the provisional label rather than adding a second line about the same work.
    {
      kind: "step",
      id: SEARCH_STEP,
      label: `${event.corpus.label} doorzocht`,
      detail: searchDetail(event.corpus.version, event.query),
      tone: null,
    },
  ];

  const { visible, overflow, overflowMore, overflowDropped } = selectVisibleHits(
    event.hits,
    event.considered,
    event.aboveThreshold,
  );

  items.push({
    kind: "step",
    id: FOUND_STEP,
    label: `${String(event.considered)} ${passageWord(event.considered)} gevonden`,
    detail: null,
    tone: null,
    overflowLabel: overflow > 0 ? overflowMore : null,
    overflowLabelAfterChecked: overflow > 0 ? overflowDropped : null,
  });

  for (const [index, hit] of visible.entries()) {
    items.push({
      kind: "chip",
      on: FOUND_STEP,
      chip: { id: `${FOUND_STEP}-${String(index)}`, label: hit.label, dropped: hit.dropped },
    });
  }

  items.push({
    kind: "step",
    id: CHECKED_STEP,
    label: `${String(event.considered)} ${passageWord(event.considered)} gecontroleerd`,
    detail: thresholdDetail(event.considered, event.aboveThreshold),
    // An empty shortlist is where a refusal is decided, so this step carries the verdict.
    tone: event.aboveThreshold === 0 ? "refusal" : null,
  });

  return items;
}

/**
 * Reduces a finished turn to the one-line summary above the answer card. Reads only measured
 * fields; missing `outcome` is the caller's bug (B5), not a reason to invent a label.
 */
export function traceSummaryLabel(input: AnswerTraceSummaryInput | null): string | null {
  if (input === null) {
    return null;
  }
  if (input.outcome === "error") {
    return TRACE_SUMMARY.aborted;
  }
  if (input.outcome === "clarified") {
    return TRACE_SUMMARY.clarified;
  }
  if (input.outcome === "refused") {
    const reason =
      input.aboveThreshold === 0 ? TRACE_SUMMARY.refusedNoCoverage : TRACE_SUMMARY.refusedOther;
    return `${input.searchedLabel} · ${reason}`;
  }
  return `${input.searchedLabel} · ${String(input.aboveThreshold)} van ${String(input.considered)} passages gebruikt`;
}

/**
 * Folds released items into the steps to render. A step id that appears twice updates the existing
 * line in place (keeping its chips); a chip for an unknown step is dropped rather than inventing
 * a step to hang it under.
 *
 * Once the `checked` step is among the released items, chips under `found` take on their measured
 * `dropped` as `struck`, and the overflow label switches from "+ N meer" to "+ N afgevallen".
 */
export function accumulateTraceItems(items: readonly AnswerTraceItem[]): AnswerTraceStep[] {
  const steps: AnswerTraceStep[] = [];
  let checkedReleased = false;
  let overflowAfterChecked: string | null | undefined;

  for (const item of items) {
    if (item.kind === "step") {
      if (item.id === CHECKED_STEP) {
        checkedReleased = true;
      }
      if (item.id === FOUND_STEP && item.overflowLabelAfterChecked !== undefined) {
        overflowAfterChecked = item.overflowLabelAfterChecked;
      }
      const existing = steps.find((step) => step.id === item.id);
      if (existing === undefined) {
        steps.push({
          id: item.id,
          label: item.label,
          detail: item.detail,
          tone: item.tone,
          chips: [],
          overflowLabel: item.overflowLabel ?? null,
          pending: item.pending === true,
        });
      } else {
        existing.label = item.label;
        existing.detail = item.detail;
        existing.tone = item.tone;
        existing.pending = item.pending === true;
        if (item.overflowLabel !== undefined) {
          existing.overflowLabel = item.overflowLabel;
        }
      }
      continue;
    }
    const host = steps.find((step) => step.id === item.on);
    if (host !== undefined) {
      host.chips.push({
        id: item.chip.id,
        label: item.chip.label,
        dropped: item.chip.dropped,
        struck: false,
      });
    }
  }

  if (checkedReleased) {
    for (const step of steps) {
      if (step.id !== FOUND_STEP) {
        continue;
      }
      for (const chip of step.chips) {
        chip.struck = chip.dropped;
      }
      if (overflowAfterChecked !== undefined && overflowAfterChecked !== null) {
        step.overflowLabel = overflowAfterChecked;
      }
    }
  }

  return steps;
}

/**
 * All above-threshold chips, at most two struck-through ones, and an overflow count for the rest.
 * The overflow wording is chosen so we never call a kept passage "afgevallen".
 */
function selectVisibleHits(
  hits: readonly { label: string; dropped: boolean }[],
  considered: number,
  aboveThreshold: number,
): {
  visible: { label: string; dropped: boolean }[];
  overflow: number;
  overflowMore: string;
  overflowDropped: string;
} {
  const kept = hits.filter((hit) => !hit.dropped);
  const dropped = hits.filter((hit) => hit.dropped);
  const visibleDropped = dropped.slice(0, MAX_DROPPED_VISIBLE);
  const visible = [...kept, ...visibleDropped];
  const overflow = Math.max(0, considered - visible.length);
  const overflowMore = `+ ${String(overflow)} meer`;
  // If a kept passage did not fit in the hit cap, the overflow is not "dropped".
  const overflowDropped =
    kept.length < aboveThreshold ? overflowMore : `+ ${String(overflow)} afgevallen`;
  return { visible, overflow, overflowMore, overflowDropped };
}

function searchDetail(version: string, query: string | undefined): string | null {
  const parts: string[] = [];
  if (version.length > 0) {
    parts.push(`Versie ${version}`);
  }
  if (query !== undefined && query.length > 0) {
    parts.push(query);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function thresholdDetail(considered: number, aboveThreshold: number): string | null {
  if (aboveThreshold === 0) {
    return "Geen enkele passage haalde de drempel";
  }
  const droppedCount = considered - aboveThreshold;
  const above = `${String(aboveThreshold)} boven de drempel`;
  return droppedCount > 0 ? `${above}, ${String(droppedCount)} afgevallen` : above;
}

function passageWord(count: number): string {
  return count === 1 ? "passage" : "passages";
}
