/**
 * Per-page marketing canvas. Product apps (dashboard, playground, embed, roleplay) stay on the
 * white `:root` default. Marketing may opt a path into the black `[data-mode="dark"]` canvas.
 *
 * This table is the assignment source of truth for tests. Route-group layouts `(black)` / `(white)`
 * must match it — they set `data-mode` statically (no `headers()` / `proxy.ts`).
 */

export type MarketingTheme = "white" | "black";

const BLACK_PATHS = new Set<string>(["/"]);

export function themeForPath(pathname: string): MarketingTheme {
  if (BLACK_PATHS.has(pathname)) return "black";
  return "white";
}

export function htmlMode(theme: MarketingTheme): "dark" | undefined {
  return theme === "black" ? "dark" : undefined;
}

export function themeColor(theme: MarketingTheme): string {
  return theme === "black" ? "#0f0e0d" : "#fafaf9";
}

/** Paths that must render on the black canvas — keep in sync with `app/(black)/`. */
export function blackPaths(): readonly string[] {
  return [...BLACK_PATHS];
}
