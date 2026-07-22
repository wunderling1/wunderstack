"use client";

import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders assistant answers as Markdown. The LLM emits Markdown (bold, lists, tables); showing it
 * raw leaks `**` and `-` into the UI. Element renderers carry Tailwind classes so the output matches
 * the demo theme without pulling in the typography plugin. Raw HTML is intentionally not enabled
 * (no `rehype-raw`): the text comes from an LLM, so we never render untrusted markup.
 *
 * Inline `[n]` citation markers are turned into clickable buttons (scroll to the matching source
 * card + hover shows the quote), so the claim↔source link is direct (Fase D).
 */

export interface CitationMarkerMeta {
  /** Valid citation refs present in the answer, and the quote for the hover popover. */
  quoteByRef: Map<number, string>;
  onMarkerClick: (ref: number) => void;
}

/** Split string children on `[n]` and replace valid markers with clickable buttons. */
function withCitationMarkers(children: ReactNode, meta: CitationMarkerMeta): ReactNode {
  const transform = (node: ReactNode, keyPrefix: string): ReactNode => {
    if (typeof node === "string") {
      return splitMarkers(node, meta, keyPrefix);
    }
    if (Array.isArray(node)) {
      return node.map((child, index) => transform(child, `${keyPrefix}-${String(index)}`));
    }
    return node;
  };
  return transform(children, "cm");
}

function splitMarkers(text: string, meta: CitationMarkerMeta, keyPrefix: string): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = regex.exec(text)) !== null) {
    const ref = Number(match[1]);
    const quote = meta.quoteByRef.get(ref);
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (quote !== undefined) {
      parts.push(
        <button
          key={`${keyPrefix}-m${String(idx)}`}
          type="button"
          onClick={() => meta.onMarkerClick(ref)}
          title={quote}
          className="mx-0.5 inline-flex items-center rounded bg-primary/10 px-1 font-mono text-[0.75em] font-medium text-primary align-baseline hover:bg-primary/20"
        >
          [{ref}]
        </button>,
      );
    } else {
      // Unknown/stripped marker: render as plain text (no clickable source behind it).
      parts.push(match[0]);
    }
    lastIndex = match.index + match[0].length;
    idx++;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function buildComponents(meta: CitationMarkerMeta | undefined): Components {
  const cite = (children: ReactNode): ReactNode =>
    meta ? withCitationMarkers(children, meta) : children;

  return {
    p: ({ children }) => <p className="mb-2 last:mb-0">{cite(children)}</p>,
    strong: ({ children }) => <strong className="font-semibold">{cite(children)}</strong>,
    em: ({ children }) => <em className="italic">{cite(children)}</em>,
    ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{cite(children)}</li>,
    h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-semibold first:mt-0">{cite(children)}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-semibold first:mt-0">{cite(children)}</h2>,
    h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{cite(children)}</h3>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2"
      >
        {children}
      </a>
    ),
    code: ({ children }) => (
      <code className="rounded bg-surface-sunk px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
    pre: ({ children }) => (
      <pre className="mb-2 overflow-x-auto rounded-md bg-surface-sunk p-3 font-mono text-xs last:mb-0">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mb-2 border-l-2 border-border pl-3 text-text-muted last:mb-0">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-3 border-border" />,
    table: ({ children }) => (
      <div className="mb-2 overflow-x-auto last:mb-0">
        <table className="w-full border-collapse text-left">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border border-border px-2 py-1 font-semibold">{children}</th>
    ),
    td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{cite(children)}</td>,
  };
}

/** Memoized so a re-render with unchanged text skips the Markdown re-parse (matters while streaming). */
export const Markdown = memo(function Markdown({
  children,
  citationMarkers,
}: {
  children: string;
  citationMarkers?: CitationMarkerMeta;
}) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(citationMarkers)}>
      {children}
    </ReactMarkdown>
  );
});
