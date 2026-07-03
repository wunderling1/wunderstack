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
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
