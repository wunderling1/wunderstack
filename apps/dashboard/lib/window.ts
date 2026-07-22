/** Start instant for a rolling window of `days` (the dashboard KPIs default to a 30-day window). */
export function sinceDaysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
