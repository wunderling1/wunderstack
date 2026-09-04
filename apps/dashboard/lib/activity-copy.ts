import {
  FUND_DISPLAY_TIMEZONE,
  addCivilDays,
  civilDateInZone,
  type DayCount,
} from "@wunderstack/analytics";
import { PERIOD_LABELS, periodHref, type PeriodId } from "./period";

/** Dutch minus in growth copy: "+18%", "−4%". */
const MINUS = "\u2212";

export type Growth =
  | { kind: "first" }
  | { kind: "equal" }
  | { kind: "delta"; label: string };

/**
 * Percent change of question volume. Zero previous with volume now is the first period, not +∞%.
 * Equal includes a rounded 0% so we never print "+0%".
 */
export function questionGrowth(current: number, previous: number): Growth {
  if (previous === 0) return current > 0 ? { kind: "first" } : { kind: "equal" };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { kind: "equal" };
  const sign = percent > 0 ? "+" : MINUS;
  return { kind: "delta", label: `${sign}${Math.abs(percent)}%` };
}

export function comparisonLine(current: number, previous: number, formatCount: (n: number) => string): string {
  const growth = questionGrowth(current, previous);
  if (growth.kind === "first") return "Eerste periode met vragen";
  const previousLabel = `Vorige periode ${formatCount(previous)}`;
  if (growth.kind === "equal") return `${previousLabel} — gelijk`;
  return `${previousLabel} — ${growth.label}`;
}

export function formatPeriodThrough(
  period: PeriodId,
  until: Date,
  timeZone: string = FUND_DISPLAY_TIMEZONE,
): string {
  const day = new Intl.DateTimeFormat("nl-NL", {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(until);
  return `${PERIOD_LABELS[period]} t/m ${day}`;
}

export function formatRelativeToNow(
  at: Date,
  now: Date,
  timeZone: string = FUND_DISPLAY_TIMEZONE,
): string {
  const atDay = civilDateInZone(at, timeZone);
  const nowDay = civilDateInZone(now, timeZone);
  const time = new Intl.DateTimeFormat("nl-NL", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);

  if (atDay === nowDay) {
    const deltaMs = now.getTime() - at.getTime();
    if (deltaMs < 30_000) return "zojuist";
    const deltaMinutes = Math.round(deltaMs / 60_000);
    if (deltaMinutes < 60) {
      return deltaMinutes === 1 ? "1 minuut geleden" : `${deltaMinutes} minuten geleden`;
    }
    const deltaHours = Math.max(1, Math.round(deltaMs / 3_600_000));
    return deltaHours === 1 ? "1 uur geleden" : `${deltaHours} uur geleden`;
  }

  if (atDay === addCivilDays(nowDay, -1)) return `gisteren ${time}`;
  const date = new Intl.DateTimeFormat("nl-NL", {
    timeZone,
    day: "numeric",
    month: "short",
  }).format(at);
  return `${date} ${time}`;
}

export function formatDayPointLabel(
  point: DayCount,
  timeZone: string = FUND_DISPLAY_TIMEZONE,
): string {
  const instant = new Date(`${point.day}T12:00:00.000Z`);
  const day = new Intl.DateTimeFormat("nl-NL", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(instant);
  const count = point.questions.toLocaleString("nl-NL");
  const unit = point.questions === 1 ? "vraag" : "vragen";
  return `${day} — ${count} ${unit}`;
}

export function activityConversationsHref(listPath: string, period: PeriodId, sinceToday = false): string {
  return periodHref(listPath, period, sinceToday ? { since: "today" } : {});
}
