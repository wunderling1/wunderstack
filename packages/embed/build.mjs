import { mkdir, readFile } from "node:fs/promises";
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
 *  3. Bundles the React app to a single IIFE, injecting the compiled CSS as the `embed:styles` module.
 */
const here = dirname(fileURLToPath(import.meta.url));
const uiTokens = resolve(here, "../ui/src/tokens");

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

await mkdir(resolve(here, "dist"), { recursive: true });
await esbuild.build({
  entryPoints: [resolve(here, "src/index.tsx")],
  bundle: true,
  format: "iife",
  outfile: resolve(here, "dist/embed.js"),
  minify: true,
  sourcemap: false,
  target: ["es2020"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [stylesPlugin],
});

console.log("Built packages/embed/dist/embed.js");
