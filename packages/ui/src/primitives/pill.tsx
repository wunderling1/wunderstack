import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-surface-sunk text-text-muted",
        primary: "bg-primary-tint text-primary",
        outline: "border border-border bg-surface text-text",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface PillProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof pillVariants> {}

/**
 * Neutral pill/tag for labels, categories and filters. Distinct from `Chip` (semantic state colours)
 * and `Button size="pill"` (an action). Presentational only.
 */
export function Pill({ className, variant, ...props }: PillProps) {
  return <span className={cn(pillVariants({ variant }), className)} {...props} />;
}

export { pillVariants };
