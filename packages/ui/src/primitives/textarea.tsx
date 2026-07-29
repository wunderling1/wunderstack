import type { TextareaHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Multi-line text field. Control-radius (not pill) so it reads as a block input alongside `Field`. */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm text-text",
        "placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
