"use client";

import { Select } from "@wunderstack/ui";
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
    <div className="w-56">
      <Select
        aria-label="Kies CAO"
        value={active}
        onChange={(e) => router.push(`/?fund=${encodeURIComponent(e.target.value)}`)}
      >
        {funds.map((fund) => (
          <option key={fund} value={fund}>
            {fund}
          </option>
        ))}
      </Select>
    </div>
  );
}
