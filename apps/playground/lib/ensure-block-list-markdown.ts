/**
 * CommonMark only starts a list when `1.` / `-` sit at the beginning of a line.
 * Models (and any leftover whitespace-collapse) sometimes emit a whole procedure as one
 * paragraph: `stappen: 1. **Titel** - sub 2. **Titel**`. Remark then keeps it as a `<p>`,
 * so `1.` and `-` show as literal characters. Insert line breaks only when no list marker
 * already starts a line.
 */
export function ensureBlockListMarkdown(markdown: string): string {
  if (/(?:^|\n)[ \t]*(?:\d+\.|- )/.test(markdown)) {
    return markdown;
  }
  return markdown
    .replace(/([^\n])(\d+\.\s+\*\*)/g, "$1\n\n$2")
    .replace(/([^\n])[ \t]+-[ \t]+/g, "$1\n   - ");
}
