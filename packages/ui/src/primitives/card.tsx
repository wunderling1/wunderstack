import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn.js";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** Soft surface with card radius and hairline border. */
export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface text-text shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
