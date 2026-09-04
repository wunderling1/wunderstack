"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { playgroundHref } from "@/lib/playground-href";
import { fundSourceLabel } from "@/lib/fund-theme";
import { cn } from "@/lib/utils";

/**
 * Explicit corpus (fund) selector for the demo. One session = one corpus: the user picks which
 * fund's CAO to search, and the choice drives both retrieval scope (server-side) and the theme.
 * Changing it navigates to `?fund=<key>`, reloading the page so the server resolves the new scope.
 */
export function FundSelector({ funds, active }: { funds: string[]; active: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const singleFund = funds.length <= 1;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Kies fonds"
        disabled={singleFund}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-2.5 py-2 text-left",
          "hover:bg-surface-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm text-text">{fundSourceLabel(active)}</span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
      </button>
      {open && !singleFund ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Fondsen"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface py-1 shadow-[var(--elevation-raised)]"
        >
          {funds.map((fund) => {
            const isActive = fund === active;
            return (
              <li key={fund} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full min-w-0 px-2.5 py-2 text-left text-sm",
                    isActive ? "bg-primary-tint text-primary" : "text-text hover:bg-surface-sunk",
                  )}
                  onClick={() => {
                    setOpen(false);
                    router.push(playgroundHref(pathname, searchParams, { fund }));
                  }}
                >
                  <span className="min-w-0 truncate">{fundSourceLabel(fund)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
