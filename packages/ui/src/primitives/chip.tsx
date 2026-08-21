import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

/*
 * Product rule (decision D) — the trust layer does not animate.
 * A chip appears in the same frame as the answer it belongs to: no enter animation,
 * no opacity fade, no translate. Only a colour transition is allowed, and only when
 * the chip's state *changes* after initial render. This is not a style choice;
 * animating the chip in suggests the information is being constructed for effect.
 * The agent's answer is real and immediate. Do not add opacity or transform transitions here.
 */
const chipVariants = cva(
  "inline-flex items-center rounded-[var(--radius-pill)] px-2.5 py-0.5 text-xs font-medium [transition:background-color_var(--motion-state),color_var(--motion-state)]",
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
