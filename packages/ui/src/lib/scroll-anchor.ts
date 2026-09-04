/**
 * Viewport policy for one chat turn: reserve space under the question, follow status
 * growth only while it overflows that space, then freeze once readable text is on
 * screen — or the moment the reader takes over.
 *
 * Pure decision logic, no React, no DOM, no timers. `measure` / `now` are injected so
 * tests run without a browser; the adapter in the consuming app applies the commands.
 */

export type ScrollAnchorState = "anchored" | "following" | "free";

export type ScrollAnchorAlign = "start" | "end";

export type ScrollCommand =
  | { type: "none" }
  | { type: "reserve"; px: number }
  | { type: "scrollToAnchor"; smooth: boolean; align: ScrollAnchorAlign }
  | { type: "scrollToBottom"; smooth: boolean };

/**
 * A question taller than this share of the container is anchored at its end, not
 * its start — otherwise a pasted slab of text pushes the answer off-screen.
 */
export const TALL_ANCHOR_RATIO = 0.4;

export interface ScrollAnchorMetrics {
  containerHeight: number;
  scrollTop: number;
  scrollHeight: number;
  /** Anchor (the question) offset from the visible top of the container, in px. */
  anchorTop: number;
  anchorHeight: number;
}

export interface ScrollAnchorOptions {
  measure: () => ScrollAnchorMetrics;
  /** Composer height + margin; subtracted from the reserved min-height. */
  bottomInset: number | (() => number);
}

export interface ScrollAnchor {
  readonly state: ScrollAnchorState;
  /** Last computed reservation. Stays after `turnEnd`; replaced on the next `submit`. */
  readonly reservedPx: number;
  submit: () => readonly ScrollCommand[];
  contentGrew: () => ScrollCommand;
  firstToken: () => ScrollCommand;
  userIntent: () => ScrollCommand;
  turnEnd: () => ScrollCommand;
}

type TurnPhase = "idle" | "status" | "answer";

const NONE: ScrollCommand = { type: "none" };

function reservePx(metrics: ScrollAnchorMetrics, bottomInset: number): number {
  return Math.max(0, metrics.containerHeight - metrics.anchorHeight - bottomInset);
}

function anchorAlign(metrics: ScrollAnchorMetrics): ScrollAnchorAlign {
  if (metrics.containerHeight <= 0) {
    return "start";
  }
  return metrics.anchorHeight / metrics.containerHeight > TALL_ANCHOR_RATIO ? "end" : "start";
}

function bottomOutOfView(metrics: ScrollAnchorMetrics): boolean {
  return metrics.scrollTop + metrics.containerHeight < metrics.scrollHeight;
}

function readBottomInset(bottomInset: number | (() => number)): number {
  return typeof bottomInset === "function" ? bottomInset() : bottomInset;
}

export function createScrollAnchor(options: ScrollAnchorOptions): ScrollAnchor {
  let state: ScrollAnchorState = "anchored";
  let phase: TurnPhase = "idle";
  let reservedPx = 0;

  return {
    get state() {
      return state;
    },
    get reservedPx() {
      return reservedPx;
    },
    submit() {
      const metrics = options.measure();
      reservedPx = reservePx(metrics, readBottomInset(options.bottomInset));
      phase = "status";
      state = "anchored";
      return [
        { type: "reserve", px: reservedPx },
        { type: "scrollToAnchor", smooth: true, align: anchorAlign(metrics) },
      ];
    },
    contentGrew() {
      if (state === "free") {
        return NONE;
      }
      if (state === "following") {
        return { type: "scrollToBottom", smooth: false };
      }
      // anchored
      if (phase !== "status" || !bottomOutOfView(options.measure())) {
        return NONE;
      }
      state = "following";
      return { type: "scrollToBottom", smooth: false };
    },
    firstToken() {
      phase = "answer";
      if (state === "following") {
        state = "anchored";
      }
      return NONE;
    },
    userIntent() {
      state = "free";
      return NONE;
    },
    turnEnd() {
      phase = "answer";
      return NONE;
    },
  };
}