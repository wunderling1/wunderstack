"use client";

import { Avatar } from "@wunderstack/ui";
import { ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { playgroundHref } from "@/lib/playground-href";
import { cn } from "@/lib/utils";
import { PLAYGROUND_AGENT_BY_ID, PLAYGROUND_AGENTS, type PlaygroundAgent } from "@/lib/runtime-config";

/** Switch CAO vs arbocatalogus demo instances (separate embed keys). */
export function AgentSelector({ active }: { active: PlaygroundAgent }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = PLAYGROUND_AGENT_BY_ID[active];

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

  const hrefFor = (id: PlaygroundAgent) => playgroundHref(pathname, searchParams, { agent: id });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label="Kies agent"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-border bg-surface px-2.5 py-2 text-left",
          "hover:bg-surface-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
        )}
      >
        <AgentGlyph initials={selected.initials} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text">{selected.label}</span>
          <span className="block truncate text-xs text-text-muted">{selected.kind}</span>
        </span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Agents"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface py-1 shadow-[var(--elevation-raised)]"
        >
          {PLAYGROUND_AGENTS.map((agent) => {
            const isActive = agent.id === active;
            return (
              <li key={agent.id} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2.5 px-2.5 py-2 text-left",
                    isActive ? "bg-primary-tint text-primary" : "text-text hover:bg-surface-sunk",
                  )}
                  onClick={() => {
                    setOpen(false);
                    router.push(hrefFor(agent.id));
                  }}
                >
                  <AgentGlyph initials={agent.initials} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{agent.label}</span>
                    <span
                      className={cn("block truncate text-xs", isActive ? "text-primary" : "text-text-muted")}
                    >
                      {agent.kind}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function AgentGlyph({ initials }: { initials: string }) {
  return (
    <Avatar className="rounded-[var(--radius-control)] text-xs font-semibold">{initials}</Avatar>
  );
}
