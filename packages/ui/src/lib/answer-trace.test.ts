import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accumulateTraceItems,
  TRACE_SUMMARY,
  traceItemsFromEvent,
  traceSummaryLabel,
  type AnswerTraceEvent,
  type AnswerTraceItem,
  type AnswerTraceSummaryInput,
} from "./answer-trace.ts";

const retrieval = (
  overrides: Partial<Extract<AnswerTraceEvent, { type: "retrieval" }>> = {},
): AnswerTraceEvent => ({
  type: "retrieval",
  corpus: { label: "CAO Metalektro", version: "2026-01" },
  query: "hoeveel vakantiedagen",
  considered: 14,
  aboveThreshold: 3,
  hits: [
    { label: "Artikel 27 — Vakantie", dropped: false },
    { label: "Artikel 28 — Verlof", dropped: false },
    { label: "Artikel 29 — Feestdagen", dropped: false },
    { label: "Bijlage 2 — Arbeidsduur", dropped: true },
    { label: "Artikel 12 — Loon", dropped: true },
    { label: "Artikel 5 — Werktijden", dropped: true },
  ],
  ...overrides,
});

describe("traceItemsFromEvent — status", () => {
  it("opens a provisional search step on the searching phase", () => {
    assert.deepEqual(traceItemsFromEvent({ type: "status", phase: "searching" }), [
      { kind: "step", id: "search", label: "Bronnen doorzoeken", detail: null, tone: null },
    ]);
  });

  it("adds a pending write step on the generating phase", () => {
    assert.deepEqual(traceItemsFromEvent({ type: "status", phase: "generating" }), [
      {
        kind: "step",
        id: "write",
        label: "Antwoord opstellen",
        detail: null,
        tone: null,
        pending: true,
      },
    ]);
  });

  it("reports nothing for the retrieved phase — the retrieval event covers it with numbers", () => {
    assert.deepEqual(traceItemsFromEvent({ type: "status", phase: "retrieved" }), []);
  });
});

describe("traceItemsFromEvent — citations clarify", () => {
  it("emits a single read step when clarification was asked before search", () => {
    assert.deepEqual(traceItemsFromEvent({ type: "citations", needsClarification: true }), [
      {
        kind: "step",
        id: "read",
        label: "Vraag gelezen",
        detail: "Er ontbrak informatie om te kunnen zoeken",
        tone: null,
      },
    ]);
  });

  it("emits nothing for a citations event that is not a clarification", () => {
    assert.deepEqual(traceItemsFromEvent({ type: "citations", needsClarification: false }), []);
  });
});

describe("traceItemsFromEvent — retrieval (A2)", () => {
  it("orders items search → found → chips → overflow → checked", () => {
    const kinds = traceItemsFromEvent(retrieval()).map((item) => {
      if (item.kind === "step") {
        return `step:${item.id}`;
      }
      if (item.kind === "chip") {
        return `chip:${item.on}`;
      }
      return `overflow:${item.on}`;
    });
    assert.deepEqual(kinds.slice(0, 4), [
      "step:search",
      "step:found",
      "chip:found",
      "chip:found",
    ]);
    assert.equal(kinds.at(-2), "overflow:found");
    assert.equal(kinds.at(-1), "step:checked");
    assert.ok(!kinds.includes("step:write"), "write comes from status:generating, not retrieval");
  });

  it("names the corpus with version and query on the search step", () => {
    const [step] = traceItemsFromEvent(retrieval());
    assert.deepEqual(step, {
      kind: "step",
      id: "search",
      label: "In de CAO Metalektro gezocht",
      detail: 'Versie 2026-01 · op je vraag "hoeveel vakantiedagen"',
      tone: null,
    });
  });

  it("leaves the detail off when there is neither version nor query", () => {
    const [step] = traceItemsFromEvent(
      retrieval({ corpus: { label: "Arbocatalogus", version: "" }, query: undefined }),
    );
    assert.ok(step !== undefined && step.kind === "step");
    assert.equal(step.detail, null);
  });

  it("shows all kept chips and at most two dropped, with an overflow item after the chips", () => {
    const items = traceItemsFromEvent(retrieval());
    const found = items.find((item) => item.kind === "step" && item.id === "found");
    assert.ok(found !== undefined && found.kind === "step");
    assert.equal(found.label, "14 fragmenten gevonden");

    const chips = items.filter((item) => item.kind === "chip");
    assert.equal(chips.length, 5); // 3 kept + 2 dropped
    assert.deepEqual(
      chips.map((chip) => (chip.kind === "chip" ? chip.chip.dropped : null)),
      [false, false, false, true, true],
    );

    const overflow = items.find((item) => item.kind === "overflow");
    assert.ok(overflow !== undefined && overflow.kind === "overflow");
    assert.equal(overflow.on, "found");
    assert.equal(overflow.label, "+ 9 meer");
    assert.equal(overflow.labelAfterChecked, "+ 9 sluiten niet aan");
    const overflowIndex = items.indexOf(overflow);
    assert.ok(items.slice(0, overflowIndex).some((item) => item.kind === "chip"));
    assert.ok(items.slice(overflowIndex + 1).every((item) => item.kind !== "chip"));
  });

  it("never says a kept fragment does not match when the overflow still hides kept hits", () => {
    // Six kept in the hit list, aboveThreshold 8: two kept never reached the client.
    const items = traceItemsFromEvent(
      retrieval({
        considered: 20,
        aboveThreshold: 8,
        hits: Array.from({ length: 6 }, (_, index) => ({
          label: `kept ${String(index)}`,
          dropped: false,
        })),
      }),
    );
    const overflow = items.find((item) => item.kind === "overflow");
    assert.ok(overflow !== undefined && overflow.kind === "overflow");
    assert.equal(overflow.label, "+ 14 meer");
    assert.equal(overflow.labelAfterChecked, "+ 14 meer");
  });

  it("says how many of the found fragments match the question, without threshold jargon", () => {
    const checked = traceItemsFromEvent(retrieval()).at(-1);
    assert.deepEqual(checked, {
      kind: "step",
      id: "checked",
      label: "3 van de 14 sluiten aan op je vraag",
      detail: null,
      tone: null,
    });
  });

  it("marks checked as refusal when nothing matched, naming the window it searched", () => {
    const items = traceItemsFromEvent(retrieval({ considered: 9, aboveThreshold: 0, hits: [] }));
    const found = items.find((item) => item.kind === "step" && item.id === "found");
    assert.ok(found !== undefined && found.kind === "step");
    assert.equal(found.label, "9 fragmenten gevonden");
    const checked = items.at(-1);
    assert.ok(checked !== undefined && checked.kind === "step");
    assert.equal(checked.id, "checked");
    assert.equal(checked.tone, "refusal");
    assert.equal(checked.label, "Geen van de 9 sluit aan op je vraag");
    assert.ok(!items.some((item) => item.kind === "step" && item.id === "write"));
  });

  it("names no total it does not have when retrieval came back empty", () => {
    const items = traceItemsFromEvent(retrieval({ considered: 0, aboveThreshold: 0, hits: [] }));
    const found = items.find((item) => item.kind === "step" && item.id === "found");
    const checked = items.find((item) => item.kind === "step" && item.id === "checked");
    assert.ok(found !== undefined && found.kind === "step");
    assert.ok(checked !== undefined && checked.kind === "step");
    assert.equal(found.label, "0 fragmenten gevonden");
    assert.equal(checked.label, "Geen enkel fragment sluit aan op je vraag");
    assert.equal(checked.tone, "refusal");
  });

  it("never produces a verified tone — green belongs to the sources bar", () => {
    const items = [
      ...traceItemsFromEvent(retrieval()),
      ...traceItemsFromEvent({ type: "status", phase: "generating" }),
    ];
    for (const item of items) {
      if (item.kind === "step") {
        assert.notEqual(item.tone, "verified");
      }
    }
  });

  it("uses the singular noun and verb for a single fragment", () => {
    const items = traceItemsFromEvent(
      retrieval({
        considered: 1,
        aboveThreshold: 1,
        hits: [{ label: "Artikel 27", dropped: false }],
      }),
    );
    const found = items.find((item) => item.kind === "step" && item.id === "found");
    const checked = items.find((item) => item.kind === "step" && item.id === "checked");
    assert.ok(found !== undefined && found.kind === "step");
    assert.ok(checked !== undefined && checked.kind === "step");
    assert.equal(found.label, "1 fragment gevonden");
    assert.equal(checked.label, "1 van de 1 sluit aan op je vraag");
    assert.ok(!items.some((item) => item.kind === "overflow"));
  });
});

describe("accumulateTraceItems — chip mutation (A2)", () => {
  it("holds the overflow label until the overflow item is released, after the chips", () => {
    const items = traceItemsFromEvent(retrieval());
    const chipsOnly = items.filter(
      (item) =>
        item.kind !== "overflow" && !(item.kind === "step" && item.id === "checked"),
    );
    const foundBefore = accumulateTraceItems(chipsOnly).find((step) => step.id === "found");
    assert.ok(foundBefore !== undefined);
    assert.equal(foundBefore.overflowLabel, null);
    assert.equal(foundBefore.chips.length, 5);

    const withOverflow = items.filter(
      (item) => !(item.kind === "step" && item.id === "checked"),
    );
    const foundWithOverflow = accumulateTraceItems(withOverflow).find(
      (step) => step.id === "found",
    );
    assert.ok(foundWithOverflow !== undefined);
    assert.equal(foundWithOverflow.overflowLabel, "+ 9 meer");
  });

  it("keeps chips unstruck until checked is released, then strikes the dropped ones", () => {
    const items = traceItemsFromEvent(retrieval());
    const beforeChecked = items.filter(
      (item) => !(item.kind === "step" && item.id === "checked"),
    );
    const foundBefore = accumulateTraceItems(beforeChecked).find((step) => step.id === "found");
    assert.ok(foundBefore !== undefined);
    assert.equal(foundBefore.overflowLabel, "+ 9 meer");
    assert.deepEqual(
      foundBefore.chips.map((chip) => chip.struck),
      [false, false, false, false, false],
    );

    const foundAfter = accumulateTraceItems(items).find((step) => step.id === "found");
    assert.ok(foundAfter !== undefined);
    assert.equal(foundAfter.overflowLabel, "+ 9 sluiten niet aan");
    assert.deepEqual(
      foundAfter.chips.map((chip) => [chip.dropped, chip.struck]),
      [
        [false, false],
        [false, false],
        [false, false],
        [true, true],
        [true, true],
      ],
    );
  });

  it("keeps the number of unstruck chips equal to aboveThreshold after checked", () => {
    const steps = accumulateTraceItems(traceItemsFromEvent(retrieval()));
    const found = steps.find((step) => step.id === "found");
    assert.ok(found !== undefined);
    assert.equal(found.chips.filter((chip) => !chip.struck).length, 3);
  });

  it("updates a step in place when its id returns, keeping the chips", () => {
    const items: AnswerTraceItem[] = [
      { kind: "step", id: "search", label: "Bronnen doorzoeken", detail: null, tone: null },
      {
        kind: "chip",
        on: "search",
        chip: { id: "c1", label: "Artikel 27", dropped: false },
      },
      {
        kind: "step",
        id: "search",
        label: "CAO doorzocht",
        detail: "Versie 2026-01",
        tone: null,
      },
    ];
    assert.deepEqual(accumulateTraceItems(items), [
      {
        id: "search",
        label: "CAO doorzocht",
        detail: "Versie 2026-01",
        tone: null,
        chips: [{ id: "c1", label: "Artikel 27", dropped: false, struck: false }],
        overflowLabel: null,
        pending: false,
      },
    ]);
  });

  it("drops a chip for a step that does not exist instead of inventing one", () => {
    const items: AnswerTraceItem[] = [
      { kind: "chip", on: "verify", chip: { id: "c1", label: "Artikel 27", dropped: false } },
    ];
    assert.deepEqual(accumulateTraceItems(items), []);
  });

  it("drops overflow for a step that does not exist instead of inventing one", () => {
    const items: AnswerTraceItem[] = [
      {
        kind: "overflow",
        on: "found",
        label: "+ 3 meer",
        labelAfterChecked: "+ 3 sluiten niet aan",
      },
    ];
    assert.deepEqual(accumulateTraceItems(items), []);
  });

  it("preserves pending on the write step", () => {
    const steps = accumulateTraceItems(
      traceItemsFromEvent({ type: "status", phase: "generating" }),
    );
    assert.equal(steps[0]?.pending, true);
  });
});

describe("traceSummaryLabel", () => {
  const input = (
    overrides: Partial<AnswerTraceSummaryInput> = {},
  ): AnswerTraceSummaryInput => ({
    outcome: "answered",
    searchedLabel: "Gezocht in de CAO",
    considered: 6,
    aboveThreshold: 3,
    used: 2,
    ...overrides,
  });

  it("returns null when there is no outcome (B5 — no invented verdict)", () => {
    assert.equal(traceSummaryLabel(null), null);
  });

  it("reports how many unique fragments the model saw on an answer", () => {
    assert.equal(traceSummaryLabel(input()), "Gezocht in de CAO · 2 fragmenten gebruikt");
  });

  it("uses the singular for a single used fragment", () => {
    assert.equal(traceSummaryLabel(input({ used: 1 })), "Gezocht in de CAO · 1 fragment gebruikt");
  });

  it("falls back to aboveThreshold when used is omitted (older embed bundle)", () => {
    assert.equal(
      traceSummaryLabel(input({ used: undefined })),
      "Gezocht in de CAO · 3 fragmenten gebruikt",
    );
  });

  it("names a no-match refusal without calling it a fault", () => {
    assert.equal(
      traceSummaryLabel(input({ outcome: "refused", aboveThreshold: 0 })),
      `Gezocht in de CAO · ${TRACE_SUMMARY.refusedNoCoverage}`,
    );
  });

  it("does not claim no-coverage when a refusal still had matching fragments", () => {
    assert.equal(
      traceSummaryLabel(input({ outcome: "refused", aboveThreshold: 2 })),
      `Gezocht in de CAO · ${TRACE_SUMMARY.refusedOther}`,
    );
  });

  it("says so when clarification meant no search ran", () => {
    assert.equal(
      traceSummaryLabel(input({ outcome: "clarified", considered: 0, aboveThreshold: 0 })),
      TRACE_SUMMARY.clarified,
    );
  });

  it("names an aborted turn", () => {
    assert.equal(traceSummaryLabel(input({ outcome: "error" })), TRACE_SUMMARY.aborted);
  });
});