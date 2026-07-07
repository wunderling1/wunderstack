(function () {
  "use strict";

  // Embeddable Wunderstack CAO-widget. Drop this on any page:
  //
  //   <script src="https://<demo-host>/widget/widget.js" data-fund="elektronische-detailhandel" defer></script>
  //
  // It injects a floating launcher that opens the chat in an iframe pointing at <demo-host>/widget.
  // The chat calls /api/chat from inside that iframe (same-origin), so the host page needs no CORS.

  var script = document.currentScript;
  if (!script) {
    return;
  }

  // Derive the demo origin from this script's own URL, so the widget works on any external page.
  var origin = new URL(script.src, window.location.href).origin;
  var fund = script.getAttribute("data-fund");

  var iframeSrc = origin + "/widget" + (fund ? "?fund=" + encodeURIComponent(fund) : "");

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open CAO-assistent");
  launcher.textContent = "CAO-vraag?";
  launcher.style.cssText = [
    "position:fixed",
    "bottom:20px",
    "right:20px",
    "z-index:2147483000",
    "padding:12px 18px",
    "border:none",
    "border-radius:9999px",
    "background:#3b4cca",
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

  var iframe = document.createElement("iframe");
  iframe.title = "Wunderstack CAO-assistent";
  iframe.style.cssText = "width:100%;height:100%;border:none;";
  // Lazily set src on first open so the iframe does not load until used.
  iframe.setAttribute("data-src", iframeSrc);
  panel.appendChild(iframe);

  var open = false;
  launcher.addEventListener("click", function () {
    open = !open;
    if (open && !iframe.src) {
      iframe.src = iframe.getAttribute("data-src");
    }
    panel.style.display = open ? "block" : "none";
    launcher.textContent = open ? "Sluiten" : "CAO-vraag?";
  });

  function mount() {
    document.body.appendChild(launcher);
    document.body.appendChild(panel);
  }

  if (document.body) {
    mount();
  } else {
    window.addEventListener("DOMContentLoaded", mount);
  }
})();
