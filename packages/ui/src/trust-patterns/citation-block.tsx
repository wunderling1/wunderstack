import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Chip } from "../primitives/chip";
import type { DensitySize } from "./answer-card";

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
  /**
   * The quoted source fragment. Optional — omit for early retrieval stubs
   * ("Gevonden in de CAO") so no empty blockquote is rendered.
   */
  quote?: ReactNode;
  /** Optional citation index, rendered as a leading badge. */
  refNumber?: number;
  /** Density (D18). `md` matches the pre-density look; embed uses `sm`. */
  size?: DensitySize;
  className?: string;
}

const PAD: Record<DensitySize, string> = {
  sm: "px-2.5 py-2",
  md: "px-3 py-3",
  lg: "px-3 py-3",
};

/**
 * Trust-pattern: a cited source shown with its verification status and quoted fragment. The visual
 * translation of the grounding architecture — every claim traces back to a verifiable source.
 * Consolidates the former `source-block` + `citation-badge` (D16). Density via `size` (D18).
 */
export function CitationBlock({
  verification,
  label,
  quote,
  refNumber,
  size = "md",
  className,
}: CitationBlockProps) {
  const verified = verification === "verified";
  const hasQuote = quote !== undefined && quote !== null && quote !== "";
  return (
    <div
      className={cn(
        "rounded-[var(--radius-control)] bg-surface shadow-[var(--elevation-card)]",
        "border-l-2",
        verified ? "border-state-verified-fg" : "border-state-caution-fg",
        PAD[size],
        className,
      )}
    >
      <div className={cn("flex items-center gap-2", hasQuote && "mb-2")}>
        {refNumber !== undefined ? <CitationBadge refNumber={refNumber} /> : null}
        <Chip variant={verification} size={size === "sm" ? "sm" : "md"}>
          {label}
        </Chip>
      </div>
      {hasQuote ? (
        <blockquote
          className={cn(
            "leading-relaxed text-text-muted",
            size === "sm" ? "text-xs" : "text-sm",
          )}
        >
          {quote}
        </blockquote>
      ) : null}
    </div>
  );
}
