import type { ReactNode, Ref } from "react";
import { cn } from "@/lib/utils";

export interface ChatThreadProps {
  children: ReactNode;
  /** Footer content — typically the app-local Composer. */
  composer: ReactNode;
  /** Ref to the scrollable message area (for aligning a new turn to the top). */
  scrollRef?: Ref<HTMLDivElement>;
  className?: string;
}

/**
 * App-local chat shell: scrollable message area + composer footer (D16: not a shared trust-pattern,
 * so it lives in the consuming app rather than `@wunderstack/ui`).
 */
export function ChatThread({
  children,
  composer,
  scrollRef,
  className,
}: ChatThreadProps) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-chat-scroll
          className="absolute inset-0 flex flex-col overflow-y-auto px-4 py-6"
        >
          {children}
        </div>
      </div>
      <div className="bg-page px-4 py-4">{composer}</div>
    </div>
  );
}
