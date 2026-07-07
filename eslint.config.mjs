// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Flat config. Enforces the arrow rule as a first line of defence:
 * files under packages/** may not import from apps/**.
 * dependency-cruiser is the second, resolver-based line of defence (see .dependency-cruiser.cjs).
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/next-env.d.ts",
      // Served static assets (e.g. the embeddable widget) are plain browser scripts, not
      // TypeScript source — they are not part of any build and should not be type-linted.
      "**/public/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain JS/config files (next.config.mjs, *.config.cjs, ...) run in Node. TS files are already
    // exempt from `no-undef` via typescript-eslint; these are not, so declare the Node globals.
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        module: "writable",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        console: "readonly",
      },
    },
  },
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/apps/**", "**/apps", "apps/**"],
              message:
                "Arrow rule violation: packages/* must not import from apps/*. Move shared code into a package instead.",
            },
          ],
        },
      ],
    },
  },
);
