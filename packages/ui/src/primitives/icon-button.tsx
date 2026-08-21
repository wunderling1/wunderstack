import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label (required for icon-only buttons). */
  label: string;
}

/** Circular icon button (send / arrow control). */
export function IconButton({ className, label, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "motion-control inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary shadow-[var(--elevation-glow)]",
        "hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
        "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
