"use client";

import { useRouter } from "next/navigation";

/**
 * Explicit corpus (fund) selector for the demo. One session = one corpus: the user picks which
 * fund's CAO to search, and the choice drives both retrieval scope (server-side) and the theme.
 * Changing it navigates to `?fund=<key>`, reloading the page so the server resolves the new scope.
 *
 * Only shown when more than one fund is available; a single-fund deployment needs no picker.
 */
export function FundSelector({ funds, active }: { funds: string[]; active: string }) {
  const router = useRouter();

  if (funds.length <= 1) {
    return null;
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className="sr-only">Kies CAO</span>
      <select
        value={active}
        onChange={(e) => router.push(`/?fund=${encodeURIComponent(e.target.value)}`)}
        className="rounded-md border border-border bg-page px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
      >
        {funds.map((fund) => (
          <option key={fund} value={fund}>
            {fund}
          </option>
        ))}
      </select>
    </label>
  );
}
