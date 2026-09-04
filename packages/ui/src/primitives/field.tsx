import { cva, type VariantProps } from "class-variance-authority";
import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

const fieldVariants = cva(
  [
    "w-full rounded-[var(--radius-control)] border border-border bg-surface text-text",
    "placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ],
  {
    variants: {
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof fieldVariants> {}

/** Single-line text field. Control-radius. Density via `size` (D18); `md` is the default. */
export function Field({ className, size, ...props }: FieldProps) {
  return <input className={cn(fieldVariants({ size }), className)} {...props} />;
}

export { fieldVariants };
