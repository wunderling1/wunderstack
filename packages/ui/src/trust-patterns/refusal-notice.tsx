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
        "w-full rounded-[var(--radius-card)] bg-surface px-8 py-6 text-base leading-relaxed shadow-[var(--elevation-card)]",
        className,
      )}
      role="status"
    >
      <Chip variant="refusal" className="mb-3">
        Niet in de bron
      </Chip>
      <p className="text-text">{children}</p>
    </div>
  );
}
