import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Chip } from "../primitives/chip.js";

/** Verification status of a cited source — drives the trust tint. */
export type CitationVerification = "verified" | "caution";

export interface CitationBadgeProps {
  refNumber: number;
  className?: string;
  onClick?: () => void;
}

/** Inline `[n]` marker linking body text to its CitationBlock. */
export function CitationBadge({ refNumber, className, onClick }: CitationBadgeProps) {
  const shared = cn(
    "inline-flex shrink-0 items-center rounded bg-surface-sunk px-1.5 py-0.5 font-mono text-[10px] text-text-muted",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(shared, "hover:bg-primary-tint hover:text-primary")}
      >
        [{refNumber}]
      </button>
    );
  }

  return <span className={shared}>[{refNumber}]</span>;
}

export interface CitationBlockProps {
  /** Verification status of the cited source. */
  verification: CitationVerification;
  /** Human-readable source label (article, section, document). */
  label: string;
  /** The quoted source fragment. */
  quote: ReactNode;
  /** Optional citation index, rendered as a leading `[n]` badge. */
  refNumber?: number;
  className?: string;
}

/**
 * Trust-pattern: a cited source shown with its verification status and quoted fragment. The visual
 * translation of the grounding architecture — every claim traces back to a verifiable source.
 * Consolidates the former `source-block` + `citation-badge` (D16).
 */
export function CitationBlock({
  verification,
  label,
  quote,
  refNumber,
  className,
}: CitationBlockProps) {
  const verified = verification === "verified";
  return (
    <div
      className={cn(
        "rounded-[var(--radius-control)] border border-border p-3",
        verified ? "bg-state-verified-bg" : "bg-state-caution-bg",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {refNumber !== undefined ? <CitationBadge refNumber={refNumber} /> : null}
        <Chip variant={verification}>{label}</Chip>
      </div>
      <blockquote
        className={cn(
          "border-l-2 pl-3 text-sm leading-relaxed text-text",
          verified ? "border-state-verified-fg" : "border-state-caution-fg",
        )}
      >
        {quote}
      </blockquote>
    </div>
  );
}
