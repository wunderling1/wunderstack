import { ChevronDown } from "lucide-react";
import type { DetailsHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * Accordion built on native `<details>/<summary>`. Zero JS, fully accessible. Pass the same `name` to
 * each `AccordionItem` for single-open (exclusive) behaviour — a native platform feature.
 */
export function Accordion({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface",
        className,
      )}
      {...props}
    />
  );
}

export function AccordionItem({ className, ...props }: DetailsHTMLAttributes<HTMLDetailsElement>) {
  return <details className={cn("group px-4", className)} {...props} />;
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <summary
      className={cn(
        "flex cursor-pointer list-none items-center justify-between gap-2 py-4 text-sm font-medium text-text",
        "[&::-webkit-details-marker]:hidden",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        aria-hidden
        className="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-180"
      />
    </summary>
  );
}

export function AccordionContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("pb-4 text-sm text-text-muted", className)} {...props} />;
}
