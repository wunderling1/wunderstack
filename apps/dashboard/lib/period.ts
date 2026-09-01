export const PERIODS = ["7d", "30d", "90d"] as const;

export type PeriodId = (typeof PERIODS)[number];

export const DEFAULT_PERIOD: PeriodId = "30d";

export const PERIOD_LABELS: Record<PeriodId, string> = {
  "7d": "7 dagen",
  "30d": "30 dagen",
  "90d": "90 dagen",
};

export function parsePeriod(raw: string | string[] | undefined): PeriodId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return DEFAULT_PERIOD;
}

export function periodDays(period: PeriodId): number {
  if (period === "7d") return 7;
  if (period === "90d") return 90;
  return 30;
}

export interface TimeWindow {
  since: Date;
  until: Date;
}

/** Current window ending at `now`. Same bounds must be passed to every overview query. */
export function currentWindow(period: PeriodId, now = new Date()): TimeWindow {
  const until = now;
  const since = new Date(until.getTime() - periodDays(period) * 24 * 60 * 60 * 1000);
  return { since, until };
}

/** Immediately preceding window of equal length; `until` equals current `since` (no overlap). */
export function previousWindow(current: TimeWindow): TimeWindow {
  const durationMs = current.until.getTime() - current.since.getTime();
  return {
    since: new Date(current.since.getTime() - durationMs),
    until: current.since,
  };
}

export function periodHref(
  pathname: string,
  period: PeriodId,
  extras: Record<string, string | undefined> = {},
): string {
  const path = pathname === "" ? "/" : pathname;
  const params = new URLSearchParams();
  params.set("period", period);
  for (const [key, value] of Object.entries(extras)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  return `${path}?${params.toString()}`;
}
