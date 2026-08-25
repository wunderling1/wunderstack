"use client";

import { Button } from "@wunderstack/ui";
import { useState } from "react";

/** Copy-to-clipboard for the embed snippet (the one string a fund pastes into its site). */
export function EmbedSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the snippet is still selectable in the <pre> */
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Snippet</span>
        <Button type="button" variant="ghost" size="default" onClick={copy} className="ml-auto">
          {copied ? "Gekopieerd" : "Kopieer"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-[var(--radius-control)] bg-surface-sunk p-3 text-xs">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
