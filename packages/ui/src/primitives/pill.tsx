import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

const pillVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-surface-sunk text-text-muted",
        primary: "bg-primary-tint text-primary",
        outline: "border border-border bg-surface text-text",
        /** Active/selected state — solid primary with glow. Used for category pills. */
        selected: "bg-primary text-on-primary shadow-[var(--elevation-glow)]",
      },
      size: {
        /** Embed / dashboard / marketing default — matches the pre-density pill. */
        sm: "px-3 py-1 text-xs",
        /** Playground starter categories — was forced via className before D18. */
        md: "px-4 py-1.5 text-sm",
        lg: "px-5 py-2 text-base",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "sm",
    },
  },
);

export interface PillProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof pillVariants> {}

/**
 * Neutral pill/tag for labels, categories and filters. Distinct from `Chip` (semantic state colours)
 * and `Button shape="pill"` (an action). Presentational only. Density via `size` (D18); default
 * `sm` preserves the pre-density look used by embed/dashboard/marketing.
 */
export function Pill({ className, variant, size, ...props }: PillProps) {
  return <span className={cn(pillVariants({ variant, size }), className)} {...props} />;
}

export { pillVariants };
