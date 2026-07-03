/**
 * Parse a CAO source file (PDF or plain text) into normalized plain text.
 *
 * This is the ingestion source seam. Today it reads local files; a later object-storage
 * source (Scaleway/OVH S3, see PRODUCT_SPEC) can be added behind the same function without
 * touching chunking or embedding.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { extractText, getDocumentProxy } from "unpdf";

export const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md"] as const;

/**
 * Light normalization that preserves document structure (headings, blank-line paragraph
 * breaks) so structure-aware chunking has something to work with. It only unifies line
 * endings, strips trailing spaces, and collapses runs of blank lines.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parseFile(filePath: string): Promise<string> {
  const extension = extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    const buffer = await readFile(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return normalizeText(text);
  }

  if (extension === ".txt" || extension === ".md") {
    return normalizeText(await readFile(filePath, "utf8"));
  }

  throw new Error(
    `Unsupported file type "${extension}" for ${filePath} ` +
      `(supported: ${SUPPORTED_EXTENSIONS.join(", ")}).`,
  );
}
