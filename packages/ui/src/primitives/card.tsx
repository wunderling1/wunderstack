import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `elevated` (default) — soft drop shadow, no border. Suits chat cards and starter questions.
   * `flush` — hairline border only, no shadow. Suits dashboard tiles and dense list contexts.
   */
  variant?: "elevated" | "flush";
}

/** Soft surface with card radius. */
export function Card({ className, variant = "elevated", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] bg-surface text-text",
        variant === "elevated"
          ? "shadow-[var(--elevation-card)]"
          : "border border-border",
        className,
      )}
      {...props}
    />
  );
}
