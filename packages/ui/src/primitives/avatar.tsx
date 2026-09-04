import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Agent glyph — indigo circle with icon or initials. */
export function Avatar({ className, children, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
