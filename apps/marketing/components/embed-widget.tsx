"use client";

import { useEffect } from "react";

/**
 * Live CAO demo (Fase 5, "buildembed" decision): the marketing site loads the SAME Fase 4 embed as a
 * fund would — no fork, no bespoke chat UI. It injects the stable snippet
 * (`<script src=".../embed.js" data-key data-agent>`) so the widget boots in its own Shadow DOM.
 *
 * The endpoint is derived by the embed itself from the script's origin (see packages/embed), so the
 * demo talks to tenant zero on the runtime. For this to work cross-origin, the runtime's demo tenant
 * CORS allowlist must include this marketing origin.
 */
export function EmbedWidget({
  scriptSrc,
  agentKey,
  agentId,
}: {
  scriptSrc: string;
  agentKey: string;
  agentId: string;
}) {
  useEffect(() => {
    if (document.querySelector("script[data-wunderstack-embed]")) {
      return;
    }
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.dataset.wunderstackEmbed = "";
    script.dataset.key = agentKey;
    script.dataset.agent = agentId;
    document.body.appendChild(script);
    // Leave the widget mounted for the session; the embed guards against double-mount itself.
  }, [scriptSrc, agentKey, agentId]);

  return null;
}
