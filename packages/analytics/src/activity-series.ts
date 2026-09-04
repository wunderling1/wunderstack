import { and, desc, gte, interactionEvents, lt, sql, type Database } from "@wunderstack/db";
import { turnOutcomes, type TurnOutcomeValue } from "@wunderstack/shared";

import { asDate } from "./outcome-activity";

interface SeriesWindow {
  since: Date;
  until: Date;
}

/**
 * Civil calendar for fund-facing series. Every Dutch O&O fund is in this zone; a per-fund
 * column is a D9 case and does not exist. SQL and the formatters must use the same name.
 */
export const FUND_DISPLAY_TIMEZONE = "Europe/Amsterdam";

export const PULSE_WINDOW_MS = 60 * 60 * 1000;

/** Hard cap on pulse ticks rendered / returned — overflow is reported, not scanned further. */
export const PULSE_TICK_CAP = 200;

export interface DayCount {
  /** YYYY-MM-DD in {@link FUND_DISPLAY_TIMEZONE}. */
  day: string;
  questions: number;
}

export interface PulseTick {
  occurredAt: Date;
  outcome: TurnOutcomeValue;
}

export interface PulseResult {
  ticks: PulseTick[];
  /** True when more than {@link PULSE_TICK_CAP} questions fell in the window. */
  truncated: boolean;
}

function isTurnOutcome(value: string): value is TurnOutcomeValue {
  return (turnOutcomes as readonly string[]).includes(value);
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

/** Civil calendar date (YYYY-MM-DD) of an instant in a named time zone. */
export function civilDateInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function addCivilDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`invalid civil date: ${isoDate}`);
  }
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const y = String(next.getUTCFullYear());
  const m = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * UTC instant at which `isoDate` 00:00:00 begins in `timeZone`.
 *
 * Binary-searches the first millisecond whose civil date in the zone is `isoDate`, so DST
 * transitions do not need a hard-coded offset.
 */
export function zonedStartOfDay(isoDate: string, timeZone: string): Date {
  const utcMidnight = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(utcMidnight)) {
    throw new Error(`invalid civil date: ${isoDate}`);
  }
  let lo = utcMidnight - 36 * 60 * 60 * 1000;
  let hi = utcMidnight + 36 * 60 * 60 * 1000;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (civilDateInZone(new Date(mid), timeZone) >= isoDate) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

/**
 * One point per civil day in the window, zeros filled. `until` is exclusive, matching every
 * other overview query: a window that ends at Tuesday 14:51 still includes Tuesday.
 */
export function fillDailySeries(
  window: SeriesWindow,
  counts: readonly DayCount[],
  timeZone: string = FUND_DISPLAY_TIMEZONE,
): DayCount[] {
  const byDay = new Map(counts.map((row) => [row.day, row.questions]));
  const start = civilDateInZone(window.since, timeZone);
  const end = civilDateInZone(new Date(window.until.getTime() - 1), timeZone);
  const series: DayCount[] = [];
  for (let day = start; day <= end; day = addCivilDays(day, 1)) {
    series.push({ day, questions: byDay.get(day) ?? 0 });
  }
  return series;
}

/**
 * PG `date` arrives as a Date at UTC midnight of that civil day — use UTC calendar fields, not
 * `toISOString()` (instant) and not {@link civilDateInZone} (would re-zone an already-civil day).
 */
function asCivilDay(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Questions per civil day in the fund zone — missing days are not returned; fill them in JS. */
export async function loadDailyQuestionSeries(
  db: Database,
  window: SeriesWindow,
): Promise<DayCount[]> {
  // Keep in sync with FUND_DISPLAY_TIMEZONE — AT TIME ZONE needs a literal, not string interp.
  const dayExpr = sql<Date | string>`(${interactionEvents.occurredAt} at time zone ${sql.raw("'Europe/Amsterdam'")})::date`;
  const rows = await db
    .select({
      day: dayExpr,
      questions: sql<number>`count(*)`,
    })
    .from(interactionEvents)
    .where(
      and(
        gte(interactionEvents.occurredAt, window.since),
        lt(interactionEvents.occurredAt, window.until),
      ),
    )
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  return rows.map((row) => ({
    day: asCivilDay(row.day),
    questions: toNumber(row.questions),
  }));
}

/**
 * Keep the newest {@link PULSE_TICK_CAP} ticks. Callers that fetched `cap + 1` rows use
 * `rows.length > cap` as the truncated signal. The live bar is a “now” strip — oldest-first
 * would blank the right edge under load.
 */
export function capPulseTicks(
  ticks: readonly PulseTick[],
  cap: number = PULSE_TICK_CAP,
): PulseResult {
  if (ticks.length <= cap) {
    return { ticks: [...ticks], truncated: false };
  }
  return { ticks: ticks.slice(-cap), truncated: true };
}

/**
 * One tick per question in the last hour. Fetch newest-first so the cap keeps “now”, then
 * reverse so {@link capPulseTicks} (chronological, keep newest) and the bar both read left → now.
 */
export async function loadPulseTicks(
  db: Database,
  now: Date,
  windowMs: number = PULSE_WINDOW_MS,
): Promise<PulseResult> {
  const since = new Date(now.getTime() - windowMs);
  const rows = await db
    .select({
      occurredAt: interactionEvents.occurredAt,
      outcome: interactionEvents.outcome,
    })
    .from(interactionEvents)
    .where(
      and(gte(interactionEvents.occurredAt, since), lt(interactionEvents.occurredAt, now)),
    )
    .orderBy(desc(interactionEvents.occurredAt))
    .limit(PULSE_TICK_CAP + 1);

  const newestFirst = rows.flatMap((row) => {
    const occurredAt = asDate(row.occurredAt);
    if (occurredAt === null || !isTurnOutcome(row.outcome)) return [];
    return [{ occurredAt, outcome: row.outcome }];
  });
  return capPulseTicks([...newestFirst].reverse());
}

/** Latest question ever, not window-scoped — the quiet-hour line names this instant. */
export async function loadLastQuestionAt(db: Database): Promise<Date | null> {
  const [row] = await db
    .select({ last: sql<Date | string | null>`max(${interactionEvents.occurredAt})` })
    .from(interactionEvents);
  return asDate(row?.last);
}
