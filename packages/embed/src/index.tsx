import css from "embed:styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EmbedApp } from "./embed-app";

/**
 * Embed loader (Fase 4). Boots a framework-agnostic web component: a floating launcher + chat panel
 * rendered by React inside a Shadow DOM, so the host page's CSS never leaks in or out. Config comes
 * from the script tag's `data-*` (the stable snippet: script-src + key + agent); everything variable
 * is fetched at runtime from `GET /config`.
 *
 * `data-mode="inline"` mounts into `[data-wunderstack-embed-slot]` as an always-open panel (marketing
 * demo / dedicated fund page). Default is the launcher a fund pastes on an existing site.
 *
 * The script element must be read synchronously at load time (document.currentScript), before the
 * async mount fires.
 */
const SCRIPT =
  (document.currentScript as HTMLScriptElement | null) ??
  document.querySelector<HTMLScriptElement>("script[data-wunderstack-embed]");

const REMOUNT_EVENT = "wunderstack-embed:mount";

type EmbedLayout = "launcher" | "inline";

interface Snippet {
  endpoint: string;
  agentKey: string | null;
  agentId: string;
  layout: EmbedLayout;
}

function readSnippet(): Snippet {
  const data = SCRIPT?.dataset ?? {};
  let endpoint = data.endpoint ?? "";
  if (!endpoint && SCRIPT?.src) {
    try {
      endpoint = new URL(SCRIPT.src).origin;
    } catch {
      endpoint = "";
    }
  }
  return {
    endpoint: endpoint.replace(/\/$/, ""),
    agentKey: data.key ?? null,
    agentId: data.agent ?? "cao",
    layout: data.mode === "inline" ? "inline" : "launcher",
  };
}

function mount(): void {
  const { endpoint, agentKey, agentId, layout } = readSnippet();
  if (!endpoint) {
    console.error("[wunderstack-embed] no endpoint: set data-endpoint or load via the script src.");
    return;
  }

  const existing = document.querySelector("[data-wunderstack-embed-root]");
  if (existing) {
    if (document.contains(existing)) return;
    existing.remove();
  }

  const slot =
    layout === "inline" ? document.querySelector("[data-wunderstack-embed-slot]") : null;
  const parent = slot ?? document.body;
  const inline = layout === "inline" && slot !== null;

  const host = document.createElement("div");
  host.setAttribute("data-wunderstack-embed-root", "");
  if (inline) {
    host.style.display = "block";
    host.style.height = "100%";
    host.style.width = "100%";
  }
  parent.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  if (inline) {
    mountPoint.style.height = "100%";
  }
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(
    <StrictMode>
      <EmbedApp
        endpoint={endpoint}
        agentKey={agentKey}
        agentId={agentId}
        layout={inline ? "inline" : "launcher"}
      />
    </StrictMode>,
  );
}

window.addEventListener(REMOUNT_EVENT, mount);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
