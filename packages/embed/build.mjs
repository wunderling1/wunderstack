import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";

/**
 * Builds the embed web-component bundle (Fase 4):
 *  1. Compiles the Tailwind utilities used by the embed + the @wunderstack/ui trust-patterns.
 *  2. Adds the design tokens, rewritten from :root to :host so they resolve inside the shadow tree
 *     (independent of the host page). This is the runtime-theming carrier (D17).
 *  3. Inlines Inter + Spectral @font-face as data URIs so the shadow tree does not depend on the
 *     host page or a second font request (the snippet stays one script).
 *  4. Bundles the React app to a single IIFE, injecting the compiled CSS as the `embed:styles` module.
 */
const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = resolve(here, "../ui/src");
const uiTokens = resolve(uiSrc, "tokens");

/** Rewrite `url("./fonts/…")` in fonts.css to data URIs so the IIFE has no extra font fetches. */
async function inlineFontUrls(css, fromDir) {
  const matches = [...css.matchAll(/url\("(\.\/fonts\/[^"]+)"\)/g)];
  let out = css;
  for (const match of matches) {
    const file = match[1];
    if (file === undefined) continue;
    const buf = await readFile(resolve(fromDir, file));
    out = out.replaceAll(`url("${file}")`, `url("data:font/woff2;base64,${buf.toString("base64")}")`);
  }
  return out;
}

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
  const fonts = await inlineFontUrls(await readFile(resolve(uiSrc, "fonts.css"), "utf8"), uiSrc);

  return `${fonts}\n${primitive}\n${semantic}\n${compiled.css}`;
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

const outfile = resolve(here, "dist/embed.js");
await mkdir(resolve(here, "dist"), { recursive: true });
await esbuild.build({
  entryPoints: [resolve(here, "src/index.tsx")],
  bundle: true,
  format: "iife",
  outfile,
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [stylesPlugin],
});

const { size } = await stat(outfile);
const kib = (size / 1024).toFixed(1);
console.log(`Built packages/embed/dist/embed.js (${size} bytes, ${kib} KiB)`);
