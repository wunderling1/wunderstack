import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

const chipVariants = cva(
  "inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        verified: "bg-state-verified-bg text-state-verified-fg",
        caution: "bg-state-caution-bg text-state-caution-fg",
        refusal: "bg-state-refusal-bg text-state-refusal-fg",
        danger: "bg-state-danger-bg text-state-danger-fg",
      },
    },
    defaultVariants: {
      variant: "verified",
    },
  },
);

export interface ChipProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof chipVariants> {}

/** State badge — variant maps 1:1 to semantic state tokens. */
export function Chip({ className, variant, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ variant }), className)} {...props} />;
}

export { chipVariants };
