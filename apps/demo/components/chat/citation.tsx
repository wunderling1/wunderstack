"use client";

import { ChevronRight, FileText } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatCitation } from "@/app/api/chat/contract";
import type { PassageResponse } from "@/app/api/passage/contract";
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
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{q}</mark>
      {snippet.slice(index + q.length)}
    </>
  );
}

function CitationItem({
  citation,
  messageId,
  fund,
  active,
}: {
  citation: ChatCitation;
  messageId: string;
  fund: string | undefined;
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chunkId: citation.chunkId, ...(fund ? { fund } : {}) }),
      });
      if (!response.ok) {
        throw new Error(`passage request failed: ${String(response.status)}`);
      }
      setPassage((await response.json()) as PassageResponse);
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
        "rounded-md border bg-background transition-colors",
        active ? "border-primary ring-1 ring-primary" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          [{citation.ref}]
        </span>
        <FileText className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate font-medium text-foreground">{citationHeading(citation)}</span>
        <span className="ml-auto shrink-0 opacity-60">
          {citation.fund} · v{citation.version}
        </span>
      </button>

      {open ? (
        <div className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 text-[11px] text-muted-foreground">
            {citation.title} · {citation.fund} · v{citation.version}
          </p>
          <p className="whitespace-pre-wrap">
            <HighlightedSnippet snippet={citation.snippet} quote={citation.quote} />
          </p>

          {passage ? (
            <div className="mt-2 border-t border-border pt-2">
              <p className="mb-1 font-medium text-foreground">
                Volledige passage{passage.approximate ? " (benadering)" : ""}
              </p>
              <p className="whitespace-pre-wrap">{passage.text}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={loadPassage}
              disabled={loadingPassage}
              className="mt-2 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              {loadingPassage ? "Laden…" : "Toon volledige passage"}
            </button>
          )}
          {passageError ? (
            <p className="mt-1 text-[11px] text-destructive">Kon de volledige passage niet laden.</p>
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
  activeRef = null,
  candidate = false,
}: {
  citations: ChatCitation[];
  messageId: string;
  fund?: string;
  activeRef?: number | null;
  candidate?: boolean;
}) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-3 border-t border-border pt-2", candidate && "opacity-70")}>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {candidate ? "Mogelijke bronnen" : "Bronnen"}
      </p>
      <ul className="flex flex-col gap-1">
        {citations.map((citation) => (
          <CitationItem
            key={`${String(citation.ref)}-${citation.chunkId}`}
            citation={citation}
            messageId={messageId}
            fund={fund}
            active={activeRef === citation.ref}
          />
        ))}
      </ul>
    </div>
  );
}
