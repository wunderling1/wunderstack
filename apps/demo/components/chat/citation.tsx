"use client";

import { ChevronRight, FileText } from "lucide-react";
import { useState } from "react";
import type { ChatCitation } from "@/app/api/chat/contract";

/**
 * Inline source attribution that expands to the actual CAO text (article + lid), fed by the
 * `citations[]` from the agent (Fase 11). Making the grounding visible and inspectable is the point
 * of a CAO-agent: the user can check that the cited article really says what the answer claims.
 */

/** A human label for a citation: prefer the structural anchor ("Artikel 5, lid 2"), else the title. */
function citationLabel(citation: ChatCitation): string {
  if (citation.sourceRef) return citation.sourceRef;
  if (citation.article) {
    return citation.lid ? `Artikel ${citation.article}, lid ${citation.lid}` : `Artikel ${citation.article}`;
  }
  return citation.title;
}

function CitationItem({ citation }: { citation: ChatCitation }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-md border border-border bg-background">
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
        <span className="truncate font-medium text-foreground">{citationLabel(citation)}</span>
        <span className="ml-auto shrink-0 opacity-60">
          {citation.fund} · v{citation.version}
        </span>
      </button>

      {open ? (
        <div className="border-t border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">{citation.title}</p>
          <p className="whitespace-pre-wrap">{citation.snippet}</p>
        </div>
      ) : null}
    </li>
  );
}

export function Citations({ citations }: { citations: ChatCitation[] }) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-border pt-2">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Bronnen</p>
      <ul className="flex flex-col gap-1">
        {citations.map((citation, index) => (
          <CitationItem key={`${String(citation.ref)}-${citation.sourceRef ?? String(index)}`} citation={citation} />
        ))}
      </ul>
    </div>
  );
}
