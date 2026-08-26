/**
 * Convert author 1-5 importance ratings into percentages that sum to exactly 100.
 *
 * The arithmetic runs in integer hundredths of a percent and only becomes a decimal at the end.
 * Three equal criteria are the reason: 100/3 rounded to two decimals is 33.33, and 33.33 × 3 = 99.99.
 * A rubric whose weights do not sum to 100 quietly deflates every score computed from it.
 *
 * Lives in shared so the scoring path (`packages/agents`) and the authoring preview (dashboard)
 * cannot drift. A rating that is not a positive finite number counts as zero. When that leaves
 * nothing to divide, every criterion is treated as equally important instead of failing.
 */
export function percentagesFromRatings(ratings: number[]): number[] {
  if (ratings.length === 0) {
    return [];
  }

  const safe = ratings.map((rating) => (Number.isFinite(rating) && rating > 0 ? rating : 0));
  const total = safe.reduce((accumulator, rating) => accumulator + rating, 0);
  const effective = total > 0 ? safe : safe.map(() => 1);
  const effectiveTotal = total > 0 ? total : ratings.length;

  const hundredths = effective.map((rating) => Math.round((rating / effectiveTotal) * 10_000));
  const assigned = hundredths.reduce((accumulator, share) => accumulator + share, 0);
  const lastIndex = hundredths.length - 1;
  hundredths[lastIndex] = (hundredths[lastIndex] ?? 0) + (10_000 - assigned);

  return hundredths.map((share) => share / 100);
}
