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
 * The script element must be read synchronously at load time (document.currentScript), before the
 * async mount fires.
 */
const SCRIPT =
  (document.currentScript as HTMLScriptElement | null) ??
  document.querySelector<HTMLScriptElement>("script[data-wunderstack-embed]");

interface Snippet {
  endpoint: string;
  agentKey: string | null;
  agentId: string;
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
  };
}

function mount(): void {
  const { endpoint, agentKey, agentId } = readSnippet();
  if (!endpoint) {
    console.error("[wunderstack-embed] no endpoint: set data-endpoint or load via the script src.");
    return;
  }
  if (document.querySelector("[data-wunderstack-embed-root]")) return;

  const host = document.createElement("div");
  host.setAttribute("data-wunderstack-embed-root", "");
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(
    <StrictMode>
      <EmbedApp endpoint={endpoint} agentKey={agentKey} agentId={agentId} />
    </StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
