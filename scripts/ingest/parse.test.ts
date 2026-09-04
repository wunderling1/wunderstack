import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StructuredTextItem } from "unpdf";

import { chunk } from "./chunk";
import { dropRunningLines, findEmptyPages, itemsToLines, normalizeText, pdfItemsToText } from "./parse";

/**
 * Fragments as pdf.js hands them over. Geometry mirrors what was measured on
 * cao_elektronische_detailhandel.pdf: 11pt body text, prose gaps under 1em, table columns far apart.
 */
function item(str: string, x: number, y: number, options: { width?: number; fontSize?: number } = {}): StructuredTextItem {
  const fontSize = options.fontSize ?? 11;
  return {
    str,
    x,
    y,
    width: options.width ?? str.length * fontSize * 0.5,
    height: fontSize,
    fontSize,
    fontFamily: "sans-serif",
    dir: "ltr",
    hasEOL: false,
  };
}

describe("PDF line reconstruction", () => {
  it("puts fragments sharing a y back on one line, left to right", () => {
    const lines = itemsToLines([
      item("toepassing", 112, 709.8, { width: 55 }),
      item("1.1.", 71, 709.8, { width: 17 }),
      item("Van", 90, 709.8, { width: 18 }),
    ]);
    assert.deepEqual(lines, ["1.1. Van toepassing"]);
  });

  it("orders lines from the top of the page down, not by fragment order", () => {
    // PDF y grows upwards, and pdf.js emits footers before body text on this document.
    const lines = itemsToLines([
      item("cao voor de Elektrotechnische Detailhandel 2023", 71, 73.9),
      item("Hoofdstuk 1 - Bereik van de cao", 71, 758.3, { fontSize: 13 }),
      item("1.1. Van toepassing", 71, 709.8),
    ]);
    assert.deepEqual(lines, [
      "Hoofdstuk 1 - Bereik van de cao",
      "1.1. Van toepassing",
      "cao voor de Elektrotechnische Detailhandel 2023",
    ]);
  });

  it("tolerates the small y jitter within a line", () => {
    const lines = itemsToLines([item("Artikel", 71, 500.4, { width: 40 }), item("5", 113, 501.6, { width: 6 })]);
    assert.deepEqual(lines, ["Artikel 5"]);
  });

  it("marks a column gap with two spaces and a word gap with one", () => {
    // Prose gap (~0.8em) stays one space; the column gap (>1.2em) becomes two, which is the signal
    // the frozen table detector keys on.
    const lines = itemsToLines([
      item("15", 71, 400, { width: 12 }),
      item("jaar", 92, 400, { width: 20 }),
      item("580,30", 200, 400, { width: 35 }),
      item("609,32", 300, 400, { width: 35 }),
    ]);
    assert.deepEqual(lines, ["15 jaar  580,30  609,32"]);
  });

  it("hands the table detector rows it recognises", () => {
    const pages = [
      [
        item("6.2 Salaristabellen", 71, 700),
        item("15", 71, 660, { width: 12 }),
        item("jaar", 92, 660, { width: 20 }),
        item("580,30", 200, 660, { width: 35 }),
        item("16", 71, 640, { width: 12 }),
        item("jaar", 92, 640, { width: 20 }),
        item("667,35", 200, 640, { width: 35 }),
        item("17", 71, 620, { width: 12 }),
        item("jaar", 92, 620, { width: 20 }),
        item("764,10", 200, 620, { width: 35 }),
      ],
    ];
    const pieces = chunk(pdfItemsToText(pages));
    const table = pieces.find((piece) => piece.chunkType === "table");
    assert.ok(table, "the salary rows should end up in a table chunk");
    assert.equal(table.article, "6.2");
    for (const amount of ["580,30", "667,35", "764,10"]) {
      assert.ok(table.content.includes(amount), `table chunk should keep ${amount}`);
    }
  });

  it("keeps whitespace-only fragments from hiding a column gap", () => {
    // The document separates columns with both a wide gap AND a space fragment. Counting the space
    // fragment as content would collapse the measured gap to zero and lose the column boundary.
    const lines = itemsToLines([
      item("15 jaar", 71, 400, { width: 40 }),
      item(" ", 111, 400, { width: 89 }),
      item("580,30", 200, 400, { width: 35 }),
    ]);
    assert.deepEqual(lines, ["15 jaar  580,30"]);
  });
});

describe("running headers, footers and page numbers", () => {
  it("drops a line that repeats on at least half the pages", () => {
    const footer = "cao voor de Elektrotechnische Detailhandel 2023";
    const pages = [
      ["Hoofdstuk 1", footer],
      ["1.1. Van toepassing", footer],
      ["1.2. Niet van toepassing", footer],
      ["1.3. Werkingssfeer", footer],
    ];
    assert.deepEqual(dropRunningLines(pages), [
      ["Hoofdstuk 1"],
      ["1.1. Van toepassing"],
      ["1.2. Niet van toepassing"],
      ["1.3. Werkingssfeer"],
    ]);
  });

  it("keeps a repeated line that is too long to be furniture", () => {
    const clause = "De werkgever betaalt het salaris uiterlijk op de laatste dag van de maand waarin het is verdiend, tenzij schriftelijk anders is overeengekomen.";
    const pages = [
      ["1.1. Van toepassing", clause],
      ["1.2. Niet van toepassing", clause],
    ];
    assert.deepEqual(dropRunningLines(pages), [
      ["1.1. Van toepassing", clause],
      ["1.2. Niet van toepassing", clause],
    ]);
  });

  it("drops a bare page number at a page edge but not one in the middle", () => {
    const pages = [["5", "1.1. Van toepassing", "7", "1.2. Niet van toepassing", "12"]];
    // "7" sits in the middle, where a lone number is more likely a table cell than a page number.
    assert.deepEqual(dropRunningLines(pages), [["1.1. Van toepassing", "7", "1.2. Niet van toepassing"]]);
  });

  it("drops a labelled page number", () => {
    const pages = [["Pagina 3 van 62", "1.1. Van toepassing", "einde"]];
    assert.deepEqual(dropRunningLines(pages), [["1.1. Van toepassing", "einde"]]);
  });

  it("needs at least two pages before calling anything furniture", () => {
    const pages = [["Hoofdstuk 1", "1.1. Van toepassing"]];
    assert.deepEqual(dropRunningLines(pages), [["Hoofdstuk 1", "1.1. Van toepassing"]]);
  });
});

describe("pages without extractable text", () => {
  it("names the pages a PDF holds but yields no text for", () => {
    const pages = [[item("Hoofdstuk 1", 71, 700)], [], [item(" ", 71, 700)], [item("1.2.", 71, 700)]];
    assert.deepEqual(findEmptyPages(pages), [2, 3]);
  });

  it("reports none when every page carries text", () => {
    assert.deepEqual(findEmptyPages([[item("Hoofdstuk 1", 71, 700)]]), []);
  });
});

describe("normalizeText", () => {
  it("strips HTML comments so a SCAFFOLD-CONTENT marker never lands in a chunk", () => {
    const raw = `<!-- SCAFFOLD-CONTENT: fictief, niet fonds-gereviewd. Beoordeel het mechanisme, niet de inhoud. -->
CAO Fictief

Artikel 1
Tekst.`;
    const normalized = normalizeText(raw);
    assert.equal(normalized.includes("SCAFFOLD-CONTENT"), false);
    assert.equal(normalized.includes("<!--"), false);
    assert.match(normalized, /^CAO Fictief/);
  });
});
