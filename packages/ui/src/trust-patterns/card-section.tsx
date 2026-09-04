import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import type { DensitySize } from "./answer-card";

export interface CardSectionProps {
  children: ReactNode;
  /** Optional uppercase heading above the section body (e.g. "Bronnen"). */
  heading?: string;
  /** Density (D18). `md` matches the pre-density `px-8 py-5` strips. */
  size?: DensitySize;
  /** Mute the section (e.g. tentative "Gevonden in de CAO" / "Mogelijke bronnen"). */
  muted?: boolean;
  className?: string;
}

const PAD: Record<DensitySize, string> = {
  sm: "px-4 py-3",
  md: "px-8 py-5",
  lg: "px-8 py-5",
};

/**
 * Trust-pattern: a full-bleed footer strip inside `AnswerCard` — hairline top border,
 * density-aware padding, optional uppercase heading. Replaces the hand-rolled
 * `border-t border-border px-8 py-5` blocks that drifted between playground and embed.
 */
export function CardSection({
  children,
  heading,
  size = "md",
  muted = false,
  className,
}: CardSectionProps) {
  return (
    <div
      className={cn(
        "border-t border-border",
        PAD[size],
        muted && "opacity-70",
        className,
      )}
    >
      {heading !== undefined ? (
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
          {heading}
        </p>
      ) : null}
      {children}
    </div>
  );
}
