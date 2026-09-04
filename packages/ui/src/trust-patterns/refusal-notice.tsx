import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Chip } from "../primitives/chip";
import type { DensitySize } from "./answer-card";

export interface RefusalNoticeProps {
  children: ReactNode;
  /** Density (D18). `md` matches the pre-density look; embed uses `sm`. */
  size?: DensitySize;
  className?: string;
}

const PAD: Record<DensitySize, string> = {
  sm: "px-4 py-3 text-sm leading-relaxed",
  md: "px-8 py-6 text-base leading-relaxed",
  lg: "px-8 py-6 text-base leading-relaxed",
};

/** Trust-pattern: calm neutral notice when the answer is not in the source. */
export function RefusalNotice({ children, size = "md", className }: RefusalNoticeProps) {
  return (
    <div
      className={cn(
        "w-full rounded-[var(--radius-card)] bg-surface shadow-[var(--elevation-card)]",
        PAD[size],
        className,
      )}
      role="status"
    >
      <Chip variant="refusal" size={size === "sm" ? "sm" : "md"} className="mb-3">
        Niet in de bron
      </Chip>
      <p className="text-text">{children}</p>
    </div>
  );
}
