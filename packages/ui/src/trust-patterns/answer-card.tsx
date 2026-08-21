import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type AnswerRole = "agent" | "user";

export interface AnswerCardProps {
  role: AnswerRole;
  children: ReactNode;
  /**
   * Optional header for agent turns — shows a sparkle icon, a primary label and an optional
   * sub-label (e.g. the agent/catalogue name).
   */
  agentLabel?: string;
  agentSubLabel?: string;
  /**
   * Full-bleed footer content rendered directly after the body — no outer padding.
   * Each section inside footer is responsible for its own `border-t border-border` and padding.
   * This is the seam for bronnen, vervolgvragen and feedback strips.
   */
  footer?: ReactNode;
  className?: string;
}

/**
 * Trust-pattern: one turn in a grounded conversation — the agent's answer or the user's question
 * (formerly `message-bubble`, D16).
 *
 * Agent variant is a sectioned card: `overflow-hidden` with no outer padding; body lives in a
 * padded inner div; footer sections span the full card width separated by hairlines.
 */
export function AnswerCard({
  role,
  children,
  agentLabel,
  agentSubLabel,
  footer,
  className,
}: AnswerCardProps) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            // Bottom-right stays square: the sharp corner points back at the sender.
            "max-w-[85%] rounded-[var(--radius-card)] rounded-br-none px-5 py-3 text-base leading-relaxed",
            "bg-primary text-on-primary shadow-[var(--elevation-raised)]",
            className,
          )}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex justify-start", className)}>
      <div
        className="w-full overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--elevation-card)]"
      >
        {/* Body — padded */}
        <div className="px-8 py-6 text-base leading-relaxed text-text">
          {agentLabel !== undefined ? (
            <div className="mb-4 flex items-center gap-2">
              <AgentSparkle />
              <span className="text-sm font-semibold text-text">{agentLabel}</span>
              {agentSubLabel !== undefined ? (
                <span className="text-sm text-text-muted">· {agentSubLabel}</span>
              ) : null}
            </div>
          ) : null}
          {children}
        </div>
        {/* Footer — full-bleed; each section provides its own border-t and padding */}
        {footer !== undefined ? footer : null}
      </div>
    </div>
  );
}

/** Small sparkle mark — purely decorative, aria-hidden. */
function AgentSparkle() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 shrink-0 text-primary"
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M8 1.5a.5.5 0 0 1 .474.342l1.14 3.418 3.418 1.14a.5.5 0 0 1 0 .948l-3.418 1.14-1.14 3.418a.5.5 0 0 1-.948 0L6.386 8.488 2.968 7.348a.5.5 0 0 1 0-.948l3.418-1.14 1.14-3.418A.5.5 0 0 1 8 1.5Z" />
    </svg>
  );
}
