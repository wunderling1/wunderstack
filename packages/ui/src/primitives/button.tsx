import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary hover:bg-primary-hover",
        secondary: "border border-border bg-surface text-text hover:bg-surface-sunk",
        ghost: "text-text hover:bg-surface-sunk",
      },
      size: {
        default: "h-10 px-4 py-2 rounded-[var(--radius-control)]",
        pill: "h-10 px-5 py-2 rounded-[var(--radius-pill)]",
        icon: "h-10 w-10 rounded-[var(--radius-control)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "pill",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
