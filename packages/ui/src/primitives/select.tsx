import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native `<select>` dropdown. Native is fully accessible and keyboard-friendly out of the box;
 * we only restyle the trigger (chevron + tokens) and keep the OS-provided option list.
 */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative inline-flex w-full">
      <select
        className={cn(
          "h-10 w-full appearance-none rounded-[var(--radius-pill)] border border-border bg-surface pl-4 pr-10 text-sm text-text",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}
