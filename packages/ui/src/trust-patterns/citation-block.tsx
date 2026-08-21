import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Chip } from "../primitives/chip.js";

/** Verification status of a cited source — drives the trust accent. */
export type CitationVerification = "verified" | "caution";

export interface CitationBadgeProps {
  refNumber: number;
  className?: string;
  onClick?: () => void;
}

/**
 * Inline reference marker linking body text to its CitationBlock.
 * Rendered as a small rounded square with the citation number — no brackets.
 */
export function CitationBadge({ refNumber, className, onClick }: CitationBadgeProps) {
  const shared = cn(
    "inline-flex shrink-0 items-center justify-center rounded-[var(--radius-badge)] bg-primary-tint px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(shared, "hover:bg-primary/20")}
      >
        {refNumber}
      </button>
    );
  }

  return <span className={shared}>{refNumber}</span>;
}

export interface CitationBlockProps {
  /** Verification status of the cited source. */
  verification: CitationVerification;
  /** Human-readable source label (article, section, document). */
  label: string;
  /** The quoted source fragment. */
  quote: ReactNode;
  /** Optional citation index, rendered as a leading badge. */
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
        "rounded-[var(--radius-control)] bg-surface px-3 py-3 shadow-[var(--elevation-card)]",
        "border-l-2",
        verified ? "border-state-verified-fg" : "border-state-caution-fg",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {refNumber !== undefined ? <CitationBadge refNumber={refNumber} /> : null}
        <Chip variant={verification}>{label}</Chip>
      </div>
      <blockquote className="text-sm leading-relaxed text-text-muted">
        {quote}
      </blockquote>
    </div>
  );
}
