/**
 * Vanilla host-page loader (~3 KB). Default fund snippet:
 *
 *   <script src="https://api.example/embed.js" data-key="pk_…" data-agent="cao" async></script>
 *
 * React never runs on the fund page — the chat lives in an iframe (`/embed/frame`) loaded on first
 * open. Isolation is the procurement story (full document boundary, not only Shadow DOM).
 *
 * data-mode="inline" — fill `[data-wunderstack-embed-slot]` with the iframe (marketing / dedicated page).
 * data-color / data-label — optional launcher branding without a cross-origin config fetch.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) {
    return;
  }

  var origin;
  try {
    origin = new URL(script.src, window.location.href).origin;
  } catch (err) {
    return;
  }

  var key = script.getAttribute("data-key") || "";
  var agent = script.getAttribute("data-agent") || "cao";
  var inline = script.getAttribute("data-mode") === "inline";
  var color = script.getAttribute("data-color") || "#1a5f4a";
  var label = script.getAttribute("data-label") || "CAO-vraag?";

  var frameParams = new URLSearchParams();
  if (key) frameParams.set("key", key);
  if (agent) frameParams.set("agent", agent);
  var iframeSrc = origin + "/embed/frame?" + frameParams.toString();

  function makeIframe() {
    var iframe = document.createElement("iframe");
    iframe.title = "Wunderstack CAO-assistent";
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.setAttribute("data-src", iframeSrc);
    iframe.allow = "clipboard-write";
    return iframe;
  }

  function mountInline() {
    var slot = document.querySelector("[data-wunderstack-embed-slot]");
    if (!slot) {
      console.error("[wunderstack-embed] data-mode=inline requires [data-wunderstack-embed-slot]");
      return;
    }
    slot.style.position = slot.style.position || "relative";
    var iframe = makeIframe();
    iframe.src = iframe.getAttribute("data-src");
    slot.appendChild(iframe);
  }

  function mountLauncher() {
    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open CAO-assistent");
    launcher.textContent = label;
    launcher.style.cssText = [
      "position:fixed",
      "bottom:20px",
      "right:20px",
      "z-index:2147483000",
      "padding:12px 18px",
      "border:none",
      "border-radius:9999px",
      "background:" + color,
      "color:#fff",
      "font:600 14px/1 system-ui,sans-serif",
      "box-shadow:0 6px 20px rgba(0,0,0,0.2)",
      "cursor:pointer",
    ].join(";");

    var panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed",
      "bottom:84px",
      "right:20px",
      "z-index:2147483000",
      "width:380px",
      "max-width:calc(100vw - 40px)",
      "height:560px",
      "max-height:calc(100vh - 120px)",
      "border-radius:16px",
      "overflow:hidden",
      "box-shadow:0 12px 40px rgba(0,0,0,0.25)",
      "background:#fff",
      "display:none",
    ].join(";");

    var iframe = makeIframe();
    panel.appendChild(iframe);

    var open = false;
    launcher.addEventListener("click", function () {
      open = !open;
      if (open && !iframe.src) {
        iframe.src = iframe.getAttribute("data-src") || "";
      }
      panel.style.display = open ? "block" : "none";
      launcher.textContent = open ? "Sluiten" : label;
    });

    function append() {
      document.body.appendChild(launcher);
      document.body.appendChild(panel);
    }

    if (document.body) {
      append();
    } else {
      window.addEventListener("DOMContentLoaded", append);
    }
  }

  if (inline) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountInline);
    } else {
      mountInline();
    }
  } else {
    mountLauncher();
  }
})();
