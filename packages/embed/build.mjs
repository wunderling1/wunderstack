import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";

/**
 * Builds the embed packages (Fase 4 + performance Finding 4):
 *  1. Vanilla host loader → `dist/embed.js` (~3 KB). React never runs on the fund page.
 *  2. React panel IIFE → content-hashed `dist/embed-panel.<hash>.js` (loaded only inside `/embed/frame`).
 *  3. `dist/manifest.json` so the runtime can resolve the hashed panel filename.
 */
const here = dirname(fileURLToPath(import.meta.url));
const uiTokens = resolve(here, "../ui/src/tokens");
const distDir = resolve(here, "dist");

async function buildCss() {
  const entryPath = resolve(here, "src/tailwind.css");
  const entry = await readFile(entryPath, "utf8");
  const compiled = await postcss([tailwindcss()]).process(entry, { from: entryPath });

  // Scope the tokens to the shadow root. :root does not match inside a shadow tree; :host does.
  const primitive = (await readFile(resolve(uiTokens, "primitive.css"), "utf8")).replaceAll(
    ":root",
    ":host",
  );
  const semantic = (await readFile(resolve(uiTokens, "semantic.css"), "utf8")).replaceAll(
    ":root",
    ":host",
  );

  return `${primitive}\n${semantic}\n${compiled.css}`;
}

const css = await buildCss();

/** Serve the compiled CSS to the bundle as `import css from "embed:styles"`. */
const stylesPlugin = {
  name: "embed-styles",
  setup(build) {
    build.onResolve({ filter: /^embed:styles$/ }, () => ({
      path: "embed:styles",
      namespace: "embed-styles",
    }));
    build.onLoad({ filter: /.*/, namespace: "embed-styles" }, () => ({
      contents: css,
      loader: "text",
    }));
  },
};

await mkdir(distDir, { recursive: true });

// 1. Host-page loader (stable URL /embed.js).
await copyFile(resolve(here, "src/loader.js"), resolve(distDir, "embed.js"));

// 2. React panel → hashed filename for immutable cache.
const panelTmp = resolve(distDir, "embed-panel.tmp.js");
await esbuild.build({
  entryPoints: [resolve(here, "src/index.tsx")],
  bundle: true,
  format: "iife",
  outfile: panelTmp,
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [stylesPlugin],
});

const panelSource = await readFile(panelTmp);
const hash = createHash("sha256").update(panelSource).digest("hex").slice(0, 12);
const panelFile = `embed-panel.${hash}.js`;
await writeFile(resolve(distDir, panelFile), panelSource);
// Stable alias for local tooling / createRequire fallbacks that still look for embed-panel.js.
await writeFile(resolve(distDir, "embed-panel.js"), panelSource);
await writeFile(
  resolve(distDir, "manifest.json"),
  `${JSON.stringify({ panel: panelFile, hash }, null, 2)}\n`,
);

// Drop the tmp file (overwrite with hashed content is enough; unlink via empty not needed).
const { unlink } = await import("node:fs/promises");
await unlink(panelTmp).catch(() => undefined);

const loaderBytes = (await readFile(resolve(distDir, "embed.js"))).byteLength;
console.log(`Built packages/embed/dist/embed.js (loader, ${String(loaderBytes)} B)`);
console.log(`Built packages/embed/dist/${panelFile} (panel)`);
