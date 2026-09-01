"use client";

import { useEffect } from "react";
import { questionAnchorId } from "@/lib/conversations";

/** Scrolls and focuses the question a permalink was shared for. */
export function ConversationHighlightScroll({ highlightId }: { highlightId: string }) {
  useEffect(() => {
    const id = questionAnchorId(highlightId);
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    const focusTarget =
      element.querySelector<HTMLElement>("a, button, [tabindex]:not([tabindex='-1'])") ?? element;
    focusTarget.focus({ preventScroll: true });
  }, [highlightId]);

  return null;
}
