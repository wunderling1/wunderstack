import { cva, type VariantProps } from "class-variance-authority";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const textareaVariants = cva(
  [
    "w-full rounded-[var(--radius-control)] border border-border bg-surface text-text",
    "placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ],
  {
    variants: {
      size: {
        sm: "px-2.5 py-1.5 text-xs",
        md: "px-3 py-2 text-sm",
        lg: "px-4 py-3 text-base",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

/**
 * Multi-line text field. Control-radius (not pill) so it reads as a block input alongside `Field`.
 * Density via `size` (D18); `md` matches the pre-density look.
 */
export function Textarea({ className, size, ...props }: TextareaProps) {
  return <textarea className={cn(textareaVariants({ size }), className)} {...props} />;
}

export { textareaVariants };
