import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Chip } from "../primitives/chip.js";

export interface RefusalNoticeProps {
  children: ReactNode;
  className?: string;
}

/** Trust-pattern: calm neutral notice when the answer is not in the source. */
export function RefusalNotice({ children, className }: RefusalNoticeProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-control)] border border-border bg-state-refusal-bg px-4 py-3 text-sm text-state-refusal-fg",
        className,
      )}
      role="status"
    >
      <Chip variant="refusal" className="mb-2">
        Niet in de bron
      </Chip>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
