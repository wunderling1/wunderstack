import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export interface IconProps {
  icon: LucideIcon;
  className?: string;
  /** Accessible label when the icon is meaningful; omit when decorative. */
  label?: string;
}

/** Thin-line icon wrapper (Lucide). */
export function Icon({ icon: LucideComponent, className, label }: IconProps) {
  return (
    <LucideComponent
      className={cn("h-4 w-4 shrink-0", className)}
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
    />
  );
}
