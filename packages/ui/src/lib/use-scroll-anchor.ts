"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import {
  createScrollAnchor,
  type ScrollAnchor,
  type ScrollAnchorAlign,
  type ScrollAnchorMetrics,
  type ScrollCommand,
} from "./scroll-anchor";

const SCROLL_KEYS = new Set([
  "PageUp",
  "PageDown",
  "Home",
  "End",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

const ZERO_METRICS: ScrollAnchorMetrics = {
  containerHeight: 0,
  scrollTop: 0,
  scrollHeight: 0,
  anchorTop: 0,
  anchorHeight: 0,
};

export interface UseScrollAnchorArgs {
  containerRef: RefObject<HTMLDivElement | null>;
  lastUserId: string | undefined;
  lastAssistantId: string | undefined;
  /** True while the live trace is showing and the answer card is not yet mounted. */
  assistantWaiting: boolean;
  assistantStreaming: boolean;
  /**
   * Attribute on the stable turn wrapper (A4). Playground and roleplay use `data-message-id`;
   * the embed uses `data-turn-index`. Default `data-message-id`.
   */
  itemAttr?: string;
  /** Closed launcher: do not observe or scroll. Default true. */
  enabled?: boolean;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollBehavior(smooth: boolean): ScrollBehavior {
  return smooth && !prefersReducedMotion() ? "smooth" : "auto";
}

function itemSelector(itemAttr: string, id: string): string {
  return `[${itemAttr}="${CSS.escape(id)}"]`;
}

function measure(
  container: HTMLElement | null,
  lastUserId: string | undefined,
  itemAttr: string,
): ScrollAnchorMetrics {
  if (container === null) {
    return ZERO_METRICS;
  }
  if (lastUserId === undefined) {
    return {
      containerHeight: container.clientHeight,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      anchorTop: 0,
      anchorHeight: 0,
    };
  }
  const anchor = container.querySelector(itemSelector(itemAttr, lastUserId));
  if (!(anchor instanceof HTMLElement)) {
    return {
      containerHeight: container.clientHeight,
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      anchorTop: 0,
      anchorHeight: 0,
    };
  }
  const cRect = container.getBoundingClientRect();
  const aRect = anchor.getBoundingClientRect();
  return {
    containerHeight: container.clientHeight,
    scrollTop: container.scrollTop,
    scrollHeight: container.scrollHeight,
    anchorTop: aRect.top - cRect.top,
    anchorHeight: aRect.height,
  };
}

/**
 * Composer sits outside this container (flex sibling), so its height is already
 * excluded from `clientHeight`. The inset is the chrome *inside* the scroller
 * that the reserve must not eat: padding plus the gap between question and answer.
 */
function readBottomInset(container: HTMLElement | null): number {
  if (container === null) {
    return 0;
  }
  const styles = getComputedStyle(container);
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
  const list = container.querySelector("[data-message-list]");
  const gap =
    list instanceof HTMLElement
      ? Number.parseFloat(getComputedStyle(list).rowGap || getComputedStyle(list).gap) || 0
      : 0;
  return paddingTop + paddingBottom + gap;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement
  );
}

function isScrollbarPointer(event: PointerEvent, container: HTMLElement): boolean {
  return event.clientX >= container.getBoundingClientRect().left + container.clientWidth;
}

function applyScrollToAnchor(
  container: HTMLElement,
  lastUserId: string,
  itemAttr: string,
  align: ScrollAnchorAlign,
  smooth: boolean,
  headerHeight: number,
): void {
  const child = container.querySelector(itemSelector(itemAttr, lastUserId));
  if (!(child instanceof HTMLElement)) {
    return;
  }
  child.style.scrollMarginTop = `${String(headerHeight)}px`;
  const cRect = container.getBoundingClientRect();
  const tRect = child.getBoundingClientRect();
  const nextTop =
    align === "end"
      ? container.scrollTop + (tRect.bottom - cRect.bottom)
      : container.scrollTop + (tRect.top - cRect.top) - headerHeight;
  // Never `scrollIntoView`: that walks ancestor scrollers and would move a host page
  // wrapping the embed iframe.
  container.scrollTo({ top: Math.max(0, nextTop), behavior: scrollBehavior(smooth) });
}

function applyCommand(
  container: HTMLElement,
  lastUserId: string | undefined,
  itemAttr: string,
  command: ScrollCommand,
  headerHeight: number,
): void {
  if (command.type === "none") {
    return;
  }
  if (command.type === "reserve") {
    container.style.setProperty("--turn-min-height", `${String(command.px)}px`);
    return;
  }
  if (command.type === "scrollToBottom") {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: scrollBehavior(command.smooth),
    });
    return;
  }
  if (lastUserId === undefined) {
    return;
  }
  applyScrollToAnchor(container, lastUserId, itemAttr, command.align, command.smooth, headerHeight);
}

/**
 * Adapter for `createScrollAnchor`. Observes the stable turn wrapper (A4), not AnswerCard —
 * that remounts when the outcome lands in playground and embed.
 *
 * Commands only mutate `container` (`scrollTo`, a CSS custom property). No `scrollIntoView`,
 * no `window`/`document` scrolling — the embed lives in a guest iframe and must not move the host.
 *
 * Does not touch the stream hook or the watchdog. No rAF loop — growth is a ResizeObserver.
 * `overflow-anchor` is left at the browser default.
 */
export function useScrollAnchor({
  containerRef,
  lastUserId,
  lastAssistantId,
  assistantWaiting,
  assistantStreaming,
  itemAttr = "data-message-id",
  enabled = true,
}: UseScrollAnchorArgs): void {
  const machineRef = useRef<ScrollAnchor | null>(null);
  const idsRef = useRef({ lastUserId, lastAssistantId, itemAttr });
  idsRef.current = { lastUserId, lastAssistantId, itemAttr };

  const openingRef = useRef(true);
  const prevWaitingRef = useRef(assistantWaiting);
  const prevStreamingRef = useRef(assistantStreaming);
  const waitingRef = useRef(assistantWaiting);
  waitingRef.current = assistantWaiting;

  if (machineRef.current === null) {
    machineRef.current = createScrollAnchor({
      measure: () =>
        measure(containerRef.current, idsRef.current.lastUserId, idsRef.current.itemAttr),
      bottomInset: () => readBottomInset(containerRef.current),
    });
  }

  const dispatch = useCallback(
    (command: ScrollCommand | readonly ScrollCommand[]) => {
      const container = containerRef.current;
      const machine = machineRef.current;
      if (container === null || machine === null) {
        return;
      }
      const commands = Array.isArray(command) ? command : [command];
      const headerHeight = Number.parseFloat(getComputedStyle(container).paddingTop) || 0;
      for (const item of commands) {
        applyCommand(container, idsRef.current.lastUserId, idsRef.current.itemAttr, item, headerHeight);
      }
    },
    [containerRef],
  );

  // Opening an existing thread (or a roleplay greeting with no user turn yet): jump to the end,
  // no animation, no reservation. A new user id after that first layout is a submit.
  useLayoutEffect(() => {
    if (!enabled) {
      openingRef.current = true;
      return;
    }
    const container = containerRef.current;
    const machine = machineRef.current;
    if (container === null || machine === null) {
      return;
    }
    if (openingRef.current) {
      openingRef.current = false;
      if (lastUserId !== undefined || idsRef.current.lastAssistantId !== undefined) {
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
      }
      return;
    }
    if (lastUserId === undefined) {
      return;
    }
    dispatch(machine.submit());
    if (!waitingRef.current) {
      dispatch(machine.firstToken());
    }
  }, [containerRef, dispatch, enabled, lastUserId]);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    const machine = machineRef.current;
    if (machine === null) {
      return;
    }
    if (prevWaitingRef.current && !assistantWaiting) {
      dispatch(machine.firstToken());
    }
    if (prevStreamingRef.current && !assistantStreaming) {
      dispatch(machine.turnEnd());
    }
    prevWaitingRef.current = assistantWaiting;
    prevStreamingRef.current = assistantStreaming;
  }, [assistantStreaming, assistantWaiting, dispatch, enabled]);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    const container = containerRef.current;
    const machine = machineRef.current;
    if (container === null || machine === null || lastAssistantId === undefined) {
      return;
    }
    const target = container.querySelector(itemSelector(itemAttr, lastAssistantId));
    if (!(target instanceof HTMLElement)) {
      return;
    }
    let skipInitial = true;
    const observer = new ResizeObserver(() => {
      if (skipInitial) {
        skipInitial = false;
        return;
      }
      dispatch(machine.contentGrew());
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [containerRef, dispatch, enabled, itemAttr, lastAssistantId]);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    const container = containerRef.current;
    const machine = machineRef.current;
    if (container === null || machine === null) {
      return;
    }

    const onIntent = (): void => {
      dispatch(machine.userIntent());
    };

    const onWheel = (): void => {
      onIntent();
    };
    const onTouchMove = (): void => {
      onIntent();
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (isScrollbarPointer(event, container)) {
        onIntent();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!SCROLL_KEYS.has(event.key) || isTypingTarget(event.target)) {
        return;
      }
      if (!(event.target instanceof Node)) {
        return;
      }
      if (!container.contains(event.target) && document.activeElement !== container) {
        return;
      }
      onIntent();
    };

    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });
    container.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [containerRef, dispatch, enabled]);
}
