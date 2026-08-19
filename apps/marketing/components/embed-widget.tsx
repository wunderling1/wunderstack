"use client";

import { useEffect } from "react";

/**
 * Live CAO demo (Fase 5, "buildembed" decision): the marketing site loads the SAME Fase 4 embed as a
 * fund would — no fork, no bespoke chat UI. It injects the stable snippet
 * (`<script src=".../embed.js" data-key data-agent>`) so the widget boots in its own Shadow DOM.
 *
 * `mode="inline"` mounts into the slot below as an always-open chat panel (the marketing demo).
 * Omit `mode` (or pass `"launcher"`) for the floating button a fund pastes on an existing site.
 *
 * The endpoint is derived by the embed itself from the script's origin (see packages/embed), so the
 * demo talks to tenant zero on the runtime. For this to work cross-origin, the runtime's demo tenant
 * CORS allowlist must include this marketing origin.
 */
export function EmbedWidget({
  scriptSrc,
  agentKey,
  agentId,
  mode = "launcher",
}: {
  scriptSrc: string;
  agentKey: string;
  agentId: string;
  mode?: "launcher" | "inline";
}) {
  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-wunderstack-embed]");
    if (existing) {
      existing.dataset.mode = mode;
      existing.dataset.key = agentKey;
      existing.dataset.agent = agentId;
      window.dispatchEvent(new Event("wunderstack-embed:mount"));
      return;
    }
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.dataset.wunderstackEmbed = "";
    script.dataset.key = agentKey;
    script.dataset.agent = agentId;
    script.dataset.mode = mode;
    document.body.appendChild(script);
  }, [scriptSrc, agentKey, agentId, mode]);

  if (mode !== "inline") {
    return null;
  }

  return (
    <div
      data-wunderstack-embed-slot=""
      className="h-[32rem] w-full overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface"
    />
  );
}
