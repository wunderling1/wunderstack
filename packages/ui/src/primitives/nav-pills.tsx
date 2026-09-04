import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface NavPillsProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/**
 * Presentational tab-pill container matching the dashboard chrome. Apps wire Next.js `Link`
 * (or buttons) as children so `packages/ui` stays framework-agnostic for the embed.
 */
export function NavPills({ className, children, ...props }: NavPillsProps) {
  return (
    <nav
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunk p-1",
        className,
      )}
      {...props}
    >
      {children}
    </nav>
  );
}

export interface NavPillProps extends HTMLAttributes<HTMLElement> {
  /** When true, renders the selected (raised surface) state. */
  active?: boolean;
  children: ReactNode;
  as?: "button" | "span";
}

/**
 * One pill inside `NavPills`. Prefer `navPillClassName(active)` on a Next.js `Link` so the
 * anchor stays the interactive element.
 */
export function NavPill({
  active = false,
  as = "button",
  className,
  children,
  ...props
}: NavPillProps) {
  const Comp = as;
  return (
    <Comp
      type={as === "button" ? "button" : undefined}
      className={cn(navPillClassName(active), className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

/**
 * Class string for a nav pill — use on `Link` when the anchor must be the interactive element.
 * Carries the focus ring, so a keyboard user sees where they are on every surface that uses pills
 * (agent tabs, period picker). The offset is the sunk container the pills sit in.
 */
export function navPillClassName(active: boolean): string {
  return cn(
    "rounded-[var(--radius-input)] px-3 py-1.5 text-sm font-medium",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunk",
    active
      ? "bg-surface text-text shadow-[var(--elevation-card)]"
      : "text-text-muted hover:text-text",
  );
}
