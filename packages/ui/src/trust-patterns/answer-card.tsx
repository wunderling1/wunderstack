import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type AnswerRole = "agent" | "user";

export interface AnswerCardProps {
  role: AnswerRole;
  children: ReactNode;
  className?: string;
}

/**
 * Trust-pattern: one turn in a grounded conversation — the agent's answer or the user's question
 * (formerly `message-bubble`, D16).
 */
export function AnswerCard({ role, children, className }: AnswerCardProps) {
  const isUser = role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-[var(--radius-card)] px-4 py-3 text-sm leading-relaxed",
          isUser ? "bg-primary text-on-primary" : "border border-border bg-surface text-text",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
