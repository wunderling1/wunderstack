import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type FieldProps = InputHTMLAttributes<HTMLInputElement>;

/** Pill-shaped text field. */
export function Field({ className, ...props }: FieldProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[var(--radius-pill)] border border-border bg-surface px-4 text-sm text-text",
        "placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
