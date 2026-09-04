import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createScrollAnchor,
  TALL_ANCHOR_RATIO,
  type ScrollAnchorMetrics,
} from "./scroll-anchor.ts";

function harness(initial: ScrollAnchorMetrics, bottomInset = 80) {
  let metrics = { ...initial };
  const anchor = createScrollAnchor({
    measure: () => metrics,
    bottomInset,
  });
  return {
    anchor,
    set(partial: Partial<ScrollAnchorMetrics>) {
      metrics = { ...metrics, ...partial };
    },
  };
}

const VIEW: ScrollAnchorMetrics = {
  containerHeight: 800,
  scrollTop: 0,
  scrollHeight: 800,
  anchorTop: 0,
  anchorHeight: 80,
};

describe("createScrollAnchor", () => {
  it("submit reserves space and anchors the question at its start", () => {
    const { anchor } = harness(VIEW, 80);
    const commands = anchor.submit();
    assert.equal(anchor.state, "anchored");
    assert.deepEqual(commands, [
      { type: "reserve", px: 640 },
      { type: "scrollToAnchor", smooth: true, align: "start" },
    ]);
    assert.equal(anchor.reservedPx, 640);
  });

  it("growth during the status phase follows once the bottom leaves the view", () => {
    const { anchor, set } = harness(VIEW, 80);
    anchor.submit();
    set({ scrollHeight: 800 });
    assert.equal(anchor.contentGrew().type, "none");
    assert.equal(anchor.state, "anchored");

    set({ scrollHeight: 900, scrollTop: 0 });
    assert.deepEqual(anchor.contentGrew(), { type: "scrollToBottom", smooth: false });
    assert.equal(anchor.state, "following");
    assert.deepEqual(anchor.contentGrew(), { type: "scrollToBottom", smooth: false });
  });

  it("the first token ends following for the rest of the turn", () => {
    const { anchor, set } = harness(VIEW, 80);
    anchor.submit();
    set({ scrollHeight: 900 });
    anchor.contentGrew();
    assert.equal(anchor.state, "following");

    assert.equal(anchor.firstToken().type, "none");
    assert.equal(anchor.state, "anchored");

    set({ scrollHeight: 1400 });
    assert.equal(anchor.contentGrew().type, "none");
    assert.equal(anchor.state, "anchored");
  });

  it("userIntent during following wins: the viewport is no longer ours", () => {
    const { anchor, set } = harness(VIEW, 80);
    anchor.submit();
    set({ scrollHeight: 900 });
    anchor.contentGrew();
    assert.equal(anchor.state, "following");

    assert.equal(anchor.userIntent().type, "none");
    assert.equal(anchor.state, "free");
    assert.equal(anchor.contentGrew().type, "none");
    assert.equal(anchor.state, "free");
  });

  it("a question taller than TALL_ANCHOR_RATIO anchors on its end", () => {
    const tall = Math.floor(VIEW.containerHeight * TALL_ANCHOR_RATIO) + 1;
    const { anchor } = harness({ ...VIEW, anchorHeight: tall }, 80);
    const commands = anchor.submit();
    const scroll = commands[1];
    assert.equal(scroll?.type, "scrollToAnchor");
    if (scroll?.type === "scrollToAnchor") {
      assert.equal(scroll.align, "end");
    }
    const short = Math.floor(VIEW.containerHeight * TALL_ANCHOR_RATIO);
    const { anchor: shortAnchor } = harness({ ...VIEW, anchorHeight: short }, 80);
    const shortScroll = shortAnchor.submit()[1];
    assert.equal(shortScroll?.type, "scrollToAnchor");
    if (shortScroll?.type === "scrollToAnchor") {
      assert.equal(shortScroll.align, "start");
    }
  });

  it("turnEnd leaves the reservation standing", () => {
    const { anchor } = harness(VIEW, 80);
    anchor.submit();
    const reserved = anchor.reservedPx;
    assert.equal(anchor.turnEnd().type, "none");
    assert.equal(anchor.reservedPx, reserved);
    assert.equal(anchor.state, "anchored");
  });

  it("a cached answer never enters following", () => {
    const { anchor, set } = harness(VIEW, 80);
    anchor.submit();
    anchor.firstToken();
    set({ scrollHeight: 2000 });
    assert.equal(anchor.contentGrew().type, "none");
    assert.equal(anchor.state, "anchored");
  });

  it("reads a function bottomInset at submit, not at construction", () => {
    let inset = 80;
    const anchor = createScrollAnchor({
      measure: () => VIEW,
      now: () => 0,
      bottomInset: () => inset,
    });
    inset = 200;
    const [reserve] = anchor.submit();
    assert.equal(reserve?.type, "reserve");
    if (reserve?.type === "reserve") {
      assert.equal(reserve.px, 520);
    }
  });
});
