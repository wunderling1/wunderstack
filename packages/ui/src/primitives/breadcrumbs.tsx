import { ChevronRight } from "lucide-react";
import type { AnchorHTMLAttributes, HTMLAttributes, LiHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** Breadcrumb navigation. Composable, shadcn-style: Breadcrumbs > BreadcrumbItem > BreadcrumbLink/Page. */
export function Breadcrumbs({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <nav aria-label="Kruimelpad" {...props}>
      <ol className={cn("flex flex-wrap items-center gap-1.5 text-sm text-text-muted", className)}>
        {children}
      </ol>
    </nav>
  );
}

export function BreadcrumbItem({ className, ...props }: LiHTMLAttributes<HTMLLIElement>) {
  return <li className={cn("inline-flex items-center gap-1.5", className)} {...props} />;
}

export function BreadcrumbLink({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(
        "rounded-[var(--radius-input)] transition-colors hover:text-text",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page",
        className,
      )}
      {...props}
    />
  );
}

/** The current page — non-interactive, marked for assistive tech. */
export function BreadcrumbPage({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      role="link"
      aria-current="page"
      aria-disabled="true"
      className={cn("font-medium text-text", className)}
      {...props}
    />
  );
}

export function BreadcrumbSeparator({ className, ...props }: HTMLAttributes<HTMLLIElement>) {
  return (
    <li role="presentation" aria-hidden className={cn("text-text-subtle", className)} {...props}>
      <ChevronRight className="h-3.5 w-3.5" />
    </li>
  );
}
