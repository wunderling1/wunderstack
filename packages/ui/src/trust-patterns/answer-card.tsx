import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type AnswerRole = "agent" | "user";

export type DensitySize = "sm" | "md" | "lg";

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
   * Each section inside footer is responsible for its own `border-t border-border` and padding
   * (prefer `CardSection`). This is the seam for bronnen, vervolgvragen and feedback strips.
   */
  footer?: ReactNode;
  /** Density (D18). `md` matches the pre-density look; embed uses `sm`. */
  size?: DensitySize;
  className?: string;
}

const BODY: Record<DensitySize, string> = {
  sm: "px-4 py-3 text-sm leading-relaxed",
  md: "px-8 py-6 text-base leading-relaxed",
  lg: "px-8 py-6 text-base leading-relaxed",
};

const HEADER_GAP: Record<DensitySize, string> = {
  sm: "mb-2",
  md: "mb-4",
  lg: "mb-4",
};

const USER_PAD: Record<DensitySize, string> = {
  sm: "px-3.5 py-2 text-sm leading-relaxed",
  md: "px-5 py-3 text-base leading-relaxed",
  lg: "px-5 py-3 text-base leading-relaxed",
};

/**
 * Trust-pattern: one turn in a grounded conversation — the agent's answer or the user's question
 * (formerly `message-bubble`, D16). Density via `size` (D18).
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
  size = "md",
  className,
}: AnswerCardProps) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            // Bottom-right stays square: the sharp corner points back at the sender.
            "max-w-[85%] rounded-[var(--radius-card)] rounded-br-none",
            "bg-primary text-on-primary shadow-[var(--elevation-raised)]",
            USER_PAD[size],
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
        <div className={cn(BODY[size], "text-text")}>
          {agentLabel !== undefined ? (
            <div className={cn("flex items-center gap-2", HEADER_GAP[size])}>
              <AgentSparkle />
              <span className={cn("font-semibold text-text", size === "sm" ? "text-xs" : "text-sm")}>
                {agentLabel}
              </span>
              {agentSubLabel !== undefined ? (
                <span className={cn("text-text-muted", size === "sm" ? "text-xs" : "text-sm")}>
                  · {agentSubLabel}
                </span>
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
