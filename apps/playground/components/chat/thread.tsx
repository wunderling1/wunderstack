import type { ReactNode, Ref, UIEventHandler } from "react";
import { cn } from "@/lib/utils";

export interface ChatThreadProps {
  children: ReactNode;
  /** Footer content — typically the app-local Composer. */
  composer: ReactNode;
  /** Ref to the scrollable message area (for scroll-pinning). */
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: UIEventHandler<HTMLDivElement>;
  className?: string;
}

/**
 * App-local chat shell: scrollable message area + composer footer (D16: not a shared trust-pattern,
 * so it lives in the consuming app rather than `@wunderstack/ui`).
 */
export function ChatThread({ children, composer, scrollRef, onScroll, className }: ChatThreadProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6"
      >
        {children}
      </div>
      <div className="bg-page px-4 py-4">{composer}</div>
    </div>
  );
}
