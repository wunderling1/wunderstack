"use client";

import { CitationBadge } from "@wunderstack/ui";
import { ChevronRight, FileText } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatCitation } from "@/app/api/chat/contract";
import { passageResponseSchema, type PassageResponse } from "@/app/api/passage/contract";
import { runtimeApiHeaders } from "@/lib/runtime-api";
import type { PlaygroundAgent } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";

/**
 * Inline source attribution that expands to the actual CAO text (article + lid), fed by the verified
 * `citations[]` from the agent. Each `[ref]` maps to exactly one card; the card shows the passage
 * with the model-attested quote highlighted, and can expand to the full parent article (Fase C/D).
 * Making the grounding visible and inspectable is the point of a CAO-agent.
 */

/** Card heading: the derived article heading ("Artikel 12 — Vakantie"); document title as fallback. */
function citationHeading(citation: ChatCitation): string {
  if (citation.heading) return citation.heading;
  if (citation.sourceRef) return citation.sourceRef;
  if (citation.article) {
    return citation.lid ? `Artikel ${citation.article}, lid ${citation.lid}` : `Artikel ${citation.article}`;
  }
  return citation.title;
}

/** Render text with the verified quote wrapped in a highlight (no raw HTML). */
function HighlightedSnippet({ snippet, quote }: { snippet: string; quote: string }): ReactNode {
  const q = quote.trim();
  if (q.length === 0) {
    return <>{snippet}</>;
  }
  const index = snippet.indexOf(q);
  if (index === -1) {
    return <>{snippet}</>;
  }
  return (
    <>
      {snippet.slice(0, index)}
      <mark className="rounded bg-primary/20 px-0.5 text-text">{q}</mark>
      {snippet.slice(index + q.length)}
    </>
  );
}

function CitationItem({
  citation,
  messageId,
  fund,
  agent,
  active,
}: {
  citation: ChatCitation;
  messageId: string;
  fund: string | undefined;
  agent: PlaygroundAgent;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [passage, setPassage] = useState<PassageResponse | null>(null);
  const [loadingPassage, setLoadingPassage] = useState(false);
  const [passageError, setPassageError] = useState(false);
  const ref = useRef<HTMLLIElement>(null);

  // When this card becomes the active target of a clicked marker, open + scroll into view.
  useEffect(() => {
    if (active) {
      setOpen(true);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [active]);

  const loadPassage = async () => {
    if (passage || loadingPassage) {
      setPassage(passage);
      return;
    }
    setLoadingPassage(true);
    setPassageError(false);
    try {
      const response = await fetch("/api/passage", {
        method: "POST",
        headers: runtimeApiHeaders(agent),
        body: JSON.stringify({ chunkId: citation.chunkId, ...(fund ? { fund } : {}) }),
      });
      if (!response.ok) {
        throw new Error(`passage request failed: ${String(response.status)}`);
      }
      const parsed = passageResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error("passage response failed validation");
      }
      setPassage(parsed.data);
    } catch {
      setPassageError(true);
    } finally {
      setLoadingPassage(false);
    }
  };

  return (
    <li
      ref={ref}
      id={`cite-${messageId}-${String(citation.ref)}`}
      className={cn(
        "overflow-hidden rounded-[var(--radius-control)] border bg-surface",
        active ? "border-primary" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-sunk"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 [transition:transform_var(--motion-state)] ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <FileText className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-text">{citationHeading(citation)}</span>
        <CitationBadge refNumber={citation.ref} className="shrink-0" />
        <span className="shrink-0 text-text-subtle">{citation.fund}</span>
      </button>

      {open ? (
        <div className="px-3 py-2 text-xs leading-relaxed text-text-muted">
          <blockquote className="mb-1 border-l-2 border-border pl-4 whitespace-pre-wrap">
            <HighlightedSnippet snippet={citation.snippet} quote={citation.quote} />
          </blockquote>
          <p className="font-mono text-[11px] text-text-subtle">
            {citation.title} · {citation.fund} · v{citation.version}
          </p>

          {passage ? (
            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1 font-medium text-text">
                Volledige passage{passage.approximate ? " (benadering)" : ""}
              </p>
              <p className="whitespace-pre-wrap">{passage.text}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={loadPassage}
              disabled={loadingPassage}
              className="mt-2 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-text hover:bg-surface-sunk disabled:opacity-60"
            >
              {loadingPassage ? "Laden…" : "Toon volledige passage"}
            </button>
          )}
          {passageError ? (
            <p className="mt-1 text-[11px] text-state-danger-fg">Kon de volledige passage niet laden.</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Renders the grounding sources. While the answer is still streaming (`candidate`), the sources are
 * shown as tentative "Mogelijke bronnen" and promoted to definitive "Bronnen" once the first answer
 * tokens confirm a grounded answer.
 */
export function Citations({
  citations,
  messageId,
  fund,
  agent = "cao",
  activeRef = null,
  candidate = false,
}: {
  citations: ChatCitation[];
  messageId: string;
  fund?: string;
  agent?: PlaygroundAgent;
  activeRef?: number | null;
  candidate?: boolean;
}) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className={cn("border-t border-border px-8 py-5", candidate && "opacity-70")}>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
        {candidate ? "Mogelijke bronnen" : "Bronnen"}
      </p>
      <ul className="flex flex-col gap-3">
        {citations.map((citation) => (
          <CitationItem
            key={`${String(citation.ref)}-${citation.chunkId}`}
            citation={citation}
            messageId={messageId}
            fund={fund}
            agent={agent}
            active={activeRef === citation.ref}
          />
        ))}
      </ul>
    </div>
  );
}
