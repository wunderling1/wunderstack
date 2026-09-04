import {
  and,
  eq,
  gte,
  interactionEvents,
  isNotNull,
  lt,
  sql,
  withFundSchema,
  type Database,
  type SQL,
} from "@wunderstack/db";
import { refusedReasons } from "@wunderstack/shared";

import { RETRIEVAL_STRONG_MIN_SCORE } from "./retrieval-strength";
import type { RetrievalStrength } from "./retrieval-strength";

export interface OutcomeWindow {
  /** Fund whose schema to open (`withFundSchema`). Not a column filter. */
  fundKey: string;
  /** Only count events at or after this instant. */
  since: Date;
  /** When set, only count events strictly before this instant. */
  until?: Date;
  /** When set, scope to a single agent instance. */
  agentKey?: string;
}

export type AgentOperationalStatus = "operational" | "degraded" | "offline";

export type Rate = { numerator: number; denominator: number } | { kind: "no_measurable_turns" };

export interface OutcomeCounts {
  answered: number;
  refused: number;
  clarified: number;
  error: number;
  unknown: number;
}

export type RefusedReasonCount = Partial<Record<(typeof refusedReasons)[number], number>>;

export interface RefusedStrengthCounts {
  none: number;
  weak: number;
  strong: number;
}

export interface OutcomeBreakdown {
  byOutcome: OutcomeCounts;
  refusedByReason: RefusedReasonCount;
  refusedByStrength: RefusedStrengthCounts;
  rates: {
    answered: Rate;
    refused: Rate;
    clarified: Rate;
    error: Rate;
    refusedJustified: Rate;
    refusedSuspicious: Rate;
  };
}

function windowScope(window: OutcomeWindow) {
  const parts = [gte(interactionEvents.occurredAt, window.since)];
  if (window.until !== undefined) {
    parts.push(lt(interactionEvents.occurredAt, window.until));
  }
  if (window.agentKey !== undefined) {
    parts.push(eq(interactionEvents.agentKey, window.agentKey));
  }
  return and(...parts);
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** Shared outcome buckets — the only SQL definition of answered/refused/clarified/error/unknown. */
export function outcomeCountSelect() {
  return {
    answered: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'answered')`,
    refused: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'refused')`,
    clarified: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'clarified')`,
    error: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'error')`,
    unknown: sql<number>`count(*) filter (where ${interactionEvents.outcome} = 'unknown')`,
  };
}

export function countsFromRow(row: {
  answered?: unknown;
  refused?: unknown;
  clarified?: unknown;
  error?: unknown;
  unknown?: unknown;
} | undefined): OutcomeCounts {
  return {
    answered: toNumber(row?.answered),
    refused: toNumber(row?.refused),
    clarified: toNumber(row?.clarified),
    error: toNumber(row?.error),
    unknown: toNumber(row?.unknown),
  };
}

/** Measurable quality turns: answered + refused + clarified (excludes error and unknown). */
export function qualityDenominator(counts: OutcomeCounts): number {
  return counts.answered + counts.refused + counts.clarified;
}

export function rateFromParts(numerator: number, denominator: number): Rate {
  if (denominator === 0) {
    return { kind: "no_measurable_turns" };
  }
  return { numerator, denominator };
}

export function answerRate(counts: OutcomeCounts): Rate {
  const denominator = qualityDenominator(counts);
  return rateFromParts(counts.answered, denominator);
}

export function refusalRate(counts: OutcomeCounts): Rate {
  const denominator = qualityDenominator(counts);
  return rateFromParts(counts.refused, denominator);
}

export function clarificationRate(counts: OutcomeCounts): Rate {
  const denominator = qualityDenominator(counts);
  return rateFromParts(counts.clarified, denominator);
}

export function errorRate(counts: OutcomeCounts): Rate {
  const total = counts.answered + counts.refused + counts.clarified + counts.error + counts.unknown;
  return rateFromParts(counts.error, total);
}

/** Refused with retrieval strength `none` — justified refusal (D6). */
export function refusedJustifiedRate(strength: RefusedStrengthCounts): Rate {
  const denominator = strength.none + strength.weak + strength.strong;
  return rateFromParts(strength.none, denominator);
}

/** Refused with retrieval strength `strong` — suspicious refusal (D6). */
export function refusedSuspiciousRate(strength: RefusedStrengthCounts): Rate {
  const denominator = strength.none + strength.weak + strength.strong;
  return rateFromParts(strength.strong, denominator);
}


function buildRates(
  byOutcome: OutcomeCounts,
  refusedByStrength: RefusedStrengthCounts,
): OutcomeBreakdown["rates"] {
  return {
    answered: answerRate(byOutcome),
    refused: refusalRate(byOutcome),
    clarified: clarificationRate(byOutcome),
    error: errorRate(byOutcome),
    refusedJustified: refusedJustifiedRate(refusedByStrength),
    refusedSuspicious: refusedSuspiciousRate(refusedByStrength),
  };
}

/**
 * The twelve `count(*) filter (...)` columns a breakdown is built from, as one reusable set.
 *
 * `extra` is ANDed into every filter, which is what lets one pass over the table answer for two
 * windows (`getActivitySnapshot`) instead of two passes for one window each. Without it the set is
 * the plain window aggregate this module has always produced.
 */
export function breakdownCountSelect(extra?: SQL) {
  const scoped = (predicate: SQL) =>
    extra === undefined
      ? sql<number>`count(*) filter (where ${predicate})`
      : sql<number>`count(*) filter (where ${extra} and ${predicate})`;
  const refusedFor = (reason: string) =>
    scoped(
      sql`${interactionEvents.outcome} = 'refused' and ${interactionEvents.outcomeReason} = ${reason}`,
    );
  const classifiedRefusal = sql`${interactionEvents.outcome} = 'refused' and ${interactionEvents.outcomeReason} is not null`;
  return {
    answered: scoped(sql`${interactionEvents.outcome} = 'answered'`),
    refused: scoped(sql`${interactionEvents.outcome} = 'refused'`),
    clarified: scoped(sql`${interactionEvents.outcome} = 'clarified'`),
    error: scoped(sql`${interactionEvents.outcome} = 'error'`),
    unknown: scoped(sql`${interactionEvents.outcome} = 'unknown'`),
    refusedNoCoverage: refusedFor("no_coverage"),
    refusedGuardHardFact: refusedFor("guard_hard_fact"),
    refusedGuardCitationCoupling: refusedFor("guard_citation_coupling"),
    refusedOutOfScope: refusedFor("out_of_scope"),
    refusedStrengthNone: scoped(sql`${classifiedRefusal} and ${interactionEvents.retrievedCount} = 0`),
    refusedStrengthWeak: scoped(
      sql`${classifiedRefusal} and ${interactionEvents.retrievedCount} > 0 and (${interactionEvents.topScore} is null or ${interactionEvents.topScore} < ${RETRIEVAL_STRONG_MIN_SCORE})`,
    ),
    refusedStrengthStrong: scoped(
      sql`${classifiedRefusal} and ${interactionEvents.retrievedCount} > 0 and ${interactionEvents.topScore} >= ${RETRIEVAL_STRONG_MIN_SCORE}`,
    ),
  };
}

/**
 * A breakdown of nothing: every count zero, every rate `no_measurable_turns`. For an agent the
 * window holds no rows for — "0 van 0" is not a rate, and the view must not print one.
 */
export function emptyOutcomeBreakdown(): OutcomeBreakdown {
  return breakdownFromRow(undefined);
}

/** Row from {@link breakdownCountSelect} -> breakdown. The only place those columns are read. */
export function breakdownFromRow(row: BreakdownRow | undefined): OutcomeBreakdown {
  const byOutcome = countsFromRow(row);

  const refusedByReason: RefusedReasonCount = {
    no_coverage: toNumber(row?.refusedNoCoverage),
    guard_hard_fact: toNumber(row?.refusedGuardHardFact),
    guard_citation_coupling: toNumber(row?.refusedGuardCitationCoupling),
    out_of_scope: toNumber(row?.refusedOutOfScope),
  };

  const refusedByStrength: RefusedStrengthCounts = {
    none: toNumber(row?.refusedStrengthNone),
    weak: toNumber(row?.refusedStrengthWeak),
    strong: toNumber(row?.refusedStrengthStrong),
  };

  return {
    byOutcome,
    refusedByReason,
    refusedByStrength,
    rates: buildRates(byOutcome, refusedByStrength),
  };
}

export interface BreakdownRow {
  answered?: unknown;
  refused?: unknown;
  clarified?: unknown;
  error?: unknown;
  unknown?: unknown;
  refusedNoCoverage?: unknown;
  refusedGuardHardFact?: unknown;
  refusedGuardCitationCoupling?: unknown;
  refusedOutOfScope?: unknown;
  refusedStrengthNone?: unknown;
  refusedStrengthWeak?: unknown;
  refusedStrengthStrong?: unknown;
}

export async function loadOutcomeBreakdown(db: Database, window: OutcomeWindow): Promise<OutcomeBreakdown> {
  const [row] = await db
    .select(breakdownCountSelect())
    .from(interactionEvents)
    .where(windowScope(window));
  return breakdownFromRow(row);
}


/** Outcome splits and KPI rates for a fund over a time window. */
export async function getOutcomeBreakdown(window: OutcomeWindow): Promise<OutcomeBreakdown> {
  return withFundSchema(window.fundKey, (db) => loadOutcomeBreakdown(db, window));
}

/**
 * First instant with a classified outcome reason — the live measurement start (D6).
 * Returns null when no classified rows exist yet (pre-migration or empty fund).
 *
 * `min(occurred_at)` goes through drizzle `sql`, not the timestamp column mapper, so
 * postgres.js yields a string. Returning that string as `Date` made every screen that
 * splits on outcome_reason print "meting nog niet gestart" or throw in `DateTimeFormat`.
 */
export async function loadMeasurementStartedAt(db: Database): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: sql<Date | string | null>`min(${interactionEvents.occurredAt})` })
    .from(interactionEvents)
    .where(isNotNull(interactionEvents.outcomeReason));
  const value = row?.startedAt;
  if (value == null) return null;
  const started = value instanceof Date ? value : new Date(value);
  return Number.isNaN(started.getTime()) ? null : started;
}

export async function measurementStartedAt(fundKey: string): Promise<Date | null> {
  return withFundSchema(fundKey, loadMeasurementStartedAt);
}

/** Honest operational status derived from real activity — never a dressed-up green. */
export function deriveAgentStatus(total: number, errors: number): AgentOperationalStatus {
  if (total === 0) return "offline";
  return errors / total > 0.2 ? "degraded" : "operational";
}

const STATUS_RANK: Record<AgentOperationalStatus, number> = {
  operational: 0,
  degraded: 1,
  offline: 2,
};

/** Fund status = worst agent status (operational < degraded < offline). */
export function deriveFundStatus(statuses: AgentOperationalStatus[]): AgentOperationalStatus {
  if (statuses.length === 0) return "offline";
  return statuses.reduce((worst, status) =>
    STATUS_RANK[status] > STATUS_RANK[worst] ? status : worst,
  );
}

export function emptyRefusedStrength(): RefusedStrengthCounts {
  return { none: 0, weak: 0, strong: 0 };
}

export function strengthFromSignals(
  retrievedCount: number,
  topScore: number | null,
  hasReason: boolean,
): RetrievalStrength | null {
  if (!hasReason) return null;
  if (retrievedCount === 0) return "none";
  if (topScore === null || topScore < RETRIEVAL_STRONG_MIN_SCORE) return "weak";
  return "strong";
}
