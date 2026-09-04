import {
  accumulateTraceItems,
  AnswerCard,
  AnswerTrace,
  Card,
  CitationBlock,
  createStreamWatchdog,
  Field,
  IconButton,
  RefusalNotice,
  traceItemsFromEvent,
  traceSummaryLabel,
  usePacedTrace,
  useScrollAnchor,
  type AnswerTraceItem,
} from "@wunderstack/ui";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Starters, resolveStarterCategories } from "./starters";
import {
  chatEventSchema,
  embedConfigSchema,
  type ChatEvent,
  type EmbedCitation,
  type EmbedConfig,
  type EmbedLayout,
} from "./types";

/** Silence budget: three server heartbeats (10s). Embed is an IIFE — no NEXT_PUBLIC_* env. */
const CHAT_INACTIVITY_MS = 30_000;
const INACTIVITY_ERROR =
  "De verbinding met de assistent viel stil. Probeer je vraag opnieuw te stellen.";
const GENERIC_ERROR = "Er ging iets mis. Probeer het later opnieuw.";

interface Turn {
  role: "user" | "agent";
  text: string;
  citations?: EmbedCitation[];
  refused?: boolean;
  turnOutcome?: { outcome: string; outcomeReason: string | null };
  /** What the runtime reported doing this turn, in arrival order (drives `AnswerTrace`). */
  trace?: AnswerTraceItem[];
  /** Measured retrieval totals for the summary line; null until a retrieval event arrives. */
  retrieval?: {
    considered: number;
    aboveThreshold: number;
    used?: number;
  } | null;
  /** Grounded follow-up chips from the `followups` stream event. */
  followUpQuestions?: string[];
}

interface Props {
  endpoint: string;
  agentKey: string | null;
  /** Snippet `data-agent` hint. After GET /config, a mismatch is ignored (key decides the agent). */
  agentId: string;
  /** `inline` = in-page panel (marketing / dedicated page). Default is the fund-site launcher. */
  layout?: EmbedLayout;
}

const DEFAULT_ARTICLE_50 =
  "Je praat met een AI-assistent. Antwoorden kunnen onjuist zijn; controleer belangrijke informatie bij de bron.";

/** Head line of the progress trace, per agent. Unknown agents get the neutral wording. */
const TRACE_HEADS: Record<string, string> = {
  cao: "Zoeken in de CAO",
  arbo: "Zoeken in de Arbocatalogus",
};

/** Corpus wording for the finished summary line. */
const SEARCHED_LABELS: Record<string, string> = {
  cao: "Gezocht in de CAO",
  arbo: "Gezocht in de Arbocatalogus",
};

function traceHead(agentId: string): string {
  return TRACE_HEADS[agentId] ?? "Zoeken in de bronnen";
}

function searchedLabel(agentId: string): string {
  return SEARCHED_LABELS[agentId] ?? "Gezocht in de bronnen";
}

/**
 * The wait UI. Its own component because pacing is a hook, and the turn list is rendered in a map.
 */
function AgentWait({ head, trace }: { head: string; trace: AnswerTraceItem[] }) {
  const paced = usePacedTrace(trace);
  return <AnswerTrace head={head} steps={accumulateTraceItems(paced)} inFlight size="sm" />;
}

const TRACE_OUTCOMES = ["answered", "refused", "clarified", "error"] as const;

/**
 * The stream mirror types `outcome` as a plain string so a runtime that adds a value does not break
 * an older bundle (see types.ts). An outcome this bundle does not know is therefore not a verdict it
 * can render, so it yields no line at all rather than guessing.
 */
function knownOutcome(
  value: string | undefined,
): (typeof TRACE_OUTCOMES)[number] | null {
  return TRACE_OUTCOMES.find((outcome) => outcome === value) ?? null;
}

function TraceRecap({
  agentId,
  turn,
  className,
}: {
  agentId: string;
  turn: Turn;
  className?: string;
}) {
  const steps = accumulateTraceItems(turn.trace ?? []);
  const outcome = knownOutcome(turn.turnOutcome?.outcome);
  if (outcome === null || steps.length === 0) {
    return null;
  }
  const summary = traceSummaryLabel({
    outcome,
    searchedLabel: searchedLabel(agentId),
    considered: turn.retrieval?.considered ?? 0,
    aboveThreshold: turn.retrieval?.aboveThreshold ?? 0,
    ...(turn.retrieval?.used === undefined ? {} : { used: turn.retrieval.used }),
  });
  if (summary === null) {
    return null;
  }
  return (
    <AnswerTrace
      head={traceHead(agentId)}
      steps={steps}
      inFlight={false}
      summary={summary}
      size="sm"
      {...(className === undefined ? {} : { className })}
    />
  );
}

/** Same key as the playground: one identity model across surfaces (DECISION-analytics-retention). */
const SESSION_STORAGE_KEY = "wunderstack-session-id";

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

/**
 * A stable id for this browser session, shared with the Langfuse trace + interaction event-log.
 *
 * Persisted in sessionStorage, which survives navigation within the tab. A fresh id per component
 * mount made every page view on the fund's site a new conversation: measured 1 September 2026, embed
 * traffic came out at 1.00–1.14 questions per conversation while playground traffic sat at 2.7
 * (DECISION-dashboard-indeling.md A6). Storage access is guarded — privacy mode throws.
 */
function readOrCreateSessionId(): string {
  try {
    const existing = globalThis.sessionStorage?.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }
  } catch {
    /* storage unavailable — fall through to a fresh id */
  }
  const id = newId();
  try {
    globalThis.sessionStorage?.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    /* best-effort */
  }
  return id;
}

function lastUserTurnIndex(turns: Turn[]): number | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === "user") {
      return i;
    }
  }
  return undefined;
}

function lastAgentTurnIndex(turns: Turn[]): number | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === "agent") {
      return i;
    }
  }
  return undefined;
}

/** Map the curated tenant theme onto the design tokens (runtime theming, D17). */
function themeStyle(theme: EmbedConfig["theme"] | undefined): CSSProperties {
  const style: Record<string, string> = {};
  if (theme?.primary) {
    style["--color-primary"] = theme.primary;
    style["--color-primary-hover"] = theme.primary;
    style["--color-primary-tint"] = `color-mix(in srgb, ${theme.primary} 12%, white)`;
  }
  if (theme?.radius) {
    style["--radius-control"] = theme.radius;
    style["--radius-card"] = theme.radius;
  }
  return style as CSSProperties;
}

export function EmbedApp({ endpoint, agentKey, agentId, layout = "launcher" }: Props) {
  const inline = layout === "inline";
  const [open, setOpen] = useState(inline);
  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sessionId] = useState(readOrCreateSessionId);

  useEffect(() => {
    let cancelled = false;
    fetch(`${endpoint}/api/config`, {
      headers: agentKey ? { "x-wunderstack-key": agentKey } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled || data === null) return;
        // Validate the external response at the boundary (300-typescript); drop a malformed /config
        // so nothing unvalidated (e.g. theme.primary) reaches the UI. Defaults still apply.
        const parsed = embedConfigSchema.safeParse(data);
        if (parsed.success) setConfig(parsed.data);
      })
      .catch(() => {
        /* config is best-effort; the embed still works with defaults */
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, agentKey]);

  const lastUserIndex = lastUserTurnIndex(turns);
  const lastAgentIndex = lastAgentTurnIndex(turns);
  const lastAgent = lastAgentIndex === undefined ? undefined : turns[lastAgentIndex];
  useScrollAnchor({
    containerRef: scrollRef,
    lastUserId: lastUserIndex === undefined ? undefined : String(lastUserIndex),
    lastAssistantId: lastAgentIndex === undefined ? undefined : String(lastAgentIndex),
    assistantWaiting: lastAgent !== undefined && lastAgent.turnOutcome === undefined && busy,
    assistantStreaming: busy,
    itemAttr: "data-turn-index",
    enabled: open,
  });

  const article50 = config?.article50 ?? DEFAULT_ARTICLE_50;
  const tagline = config?.texts.tagline ?? "Stel je vraag";
  const logo = config?.theme.logo;
  const snippetHint = agentId.trim();
  const resolvedAgentId = config?.agentId ?? (snippetHint || "cao");
  useEffect(() => {
    if (!config || snippetHint.length === 0) return;
    if (snippetHint === config.agentId) return;
    console.warn(
      `[wunderstack-embed] data-agent="${snippetHint}" does not match this key's agent "${config.agentId}"; ignoring hint.`,
    );
  }, [config, snippetHint]);

  function updateLast(fn: (turn: Turn) => Turn): void {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      next[next.length - 1] = fn(next[next.length - 1] as Turn);
      return next;
    });
  }

  function applyEvent(event: ChatEvent): void {
    if (event.type === "status" || event.type === "retrieval") {
      const items = traceItemsFromEvent(event);
      updateLast((turn) => ({
        ...turn,
        ...(items.length > 0 ? { trace: [...(turn.trace ?? []), ...items] } : {}),
        ...(event.type === "retrieval"
          ? {
              retrieval: {
                considered: event.considered,
                aboveThreshold: event.aboveThreshold,
                ...(event.used === undefined ? {} : { used: event.used }),
              },
            }
          : {}),
      }));
    } else if (event.type === "text") {
      updateLast((turn) => ({ ...turn, text: turn.text + event.delta }));
    } else if (event.type === "citations") {
      const clarifyItems = traceItemsFromEvent(event);
      updateLast((turn) => ({
        ...turn,
        text: event.answer || turn.text,
        citations: event.citations,
        turnOutcome: event.turnOutcome,
        refused: event.turnOutcome.outcome === "refused",
        ...(clarifyItems.length > 0
          ? { trace: [...(turn.trace ?? []), ...clarifyItems] }
          : {}),
      }));
    } else if (event.type === "followups") {
      updateLast((turn) => ({ ...turn, followUpQuestions: event.questions }));
    } else if (event.type === "error") {
      updateLast((turn) => ({
        ...turn,
        text: event.message,
        turnOutcome: { outcome: "error", outcomeReason: "provider_error" },
      }));
    }
  }

  async function send(questionOverride?: string): Promise<void> {
    const question = (questionOverride ?? input).trim();
    if (!question || busy) return;
    if (!questionOverride) setInput("");
    const history = turns
      .slice(-6)
      .map((turn) => ({ role: turn.role === "agent" ? "assistant" : "user", content: turn.text }))
      .filter((message) => message.content.length > 0);
    setTurns((prev) => [
      ...prev,
      { role: "user", text: question },
      // Empty trace: the head line carries the wait until the first measured event lands (B1).
      { role: "agent", text: "", trace: [] },
    ]);
    setBusy(true);

    const controller = new AbortController();
    let abortedForInactivity = false;
    const watchdog = createStreamWatchdog({
      timeoutMs: CHAT_INACTIVITY_MS,
      onTimeout: () => {
        abortedForInactivity = true;
        controller.abort();
      },
    });

    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(agentKey ? { "x-wunderstack-key": agentKey } : {}),
        },
        body: JSON.stringify({
          question,
          history,
          sessionId,
          channel: "embed",
          ...(config?.fund ? { fund: config.fund } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("request_failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          watchdog.signal();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const raw of lines) {
            if (!raw.trim()) continue;
            let json: unknown;
            try {
              json = JSON.parse(raw);
            } catch {
              continue; /* ignore a partial/garbled line */
            }
            // Validate each stream event at the boundary; skip anything off-contract.
            const parsed = chatEventSchema.safeParse(json);
            if (parsed.success) applyEvent(parsed.data);
          }
        }
      } finally {
        watchdog.stop();
      }
    } catch {
      if (abortedForInactivity) {
        updateLast((turn) => ({
          ...turn,
          text: turn.text || INACTIVITY_ERROR,
          turnOutcome: turn.turnOutcome ?? { outcome: "error", outcomeReason: "timeout" },
        }));
      } else if (!controller.signal.aborted) {
        updateLast((turn) => ({
          ...turn,
          text: turn.text || GENERIC_ERROR,
          turnOutcome: turn.turnOutcome ?? { outcome: "error", outcomeReason: "provider_error" },
        }));
      }
    } finally {
      watchdog.stop();
      setBusy(false);
    }
  }

  const panel = (
    <Card
      variant={inline ? "flush" : "elevated"}
      className={
        inline
          ? "flex h-full w-full flex-col overflow-hidden p-0"
          : "flex h-[70vh] max-h-[600px] w-[min(92vw,380px)] flex-col overflow-hidden p-0"
      }
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
        {logo ? <img src={logo} alt="" className="h-6 w-auto" /> : null}
        <p className="min-w-0 truncate text-sm font-semibold text-text">{tagline}</p>
        {inline ? null : (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Sluiten"
            className="ml-auto rounded p-1 text-text-muted hover:text-text"
          >
            ✕
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-chat-scroll
          className="absolute inset-0 overflow-y-auto bg-page px-4 py-4"
        >
        {turns.length === 0 ? (
          <Starters
            categories={resolveStarterCategories(config?.texts)}
            onPick={(question) => void send(question)}
            {...(config?.texts.tagline ? { title: config.texts.tagline } : {})}
            {...(config?.texts.intro ? { intro: config.texts.intro } : {})}
          />
        ) : (
        <div className="flex flex-col gap-3" data-message-list>
        {turns.map((turn, index) => {
          // Text can land before the citations event that carries the outcome. Keep the live
          // trace on the in-flight agent turn until that outcome arrives (A2 layout stability).
          const agentWaiting =
            turn.role === "agent" &&
            turn.turnOutcome === undefined &&
            index === turns.length - 1 &&
            busy;
          return (
          <div
            key={index}
            data-turn-index={index}
            className={
              index === turns.length - 1
                ? "flex min-h-[var(--turn-min-height,0px)] flex-col gap-2"
                : "flex flex-col gap-2"
            }
          >
            {agentWaiting ? (
              <AgentWait head={traceHead(resolvedAgentId)} trace={turn.trace ?? []} />
            ) : turn.refused ? (
              <>
                <TraceRecap agentId={resolvedAgentId} turn={turn} />
                <RefusalNotice>{turn.text}</RefusalNotice>
              </>
            ) : (
              <>
                {turn.role === "agent" ? (
                  <TraceRecap agentId={resolvedAgentId} turn={turn} />
                ) : null}
                <AnswerCard
                  role={turn.role}
                  {...(turn.role === "agent"
                    ? { agentLabel: "AI-assistent", agentSubLabel: resolvedAgentId }
                    : {})}
                >
                  {turn.text}
                </AnswerCard>
              </>
            )}
            {turn.citations && turn.citations.length > 0 ? (
              <div className="flex flex-col gap-2">
                {turn.citations.map((citation) => (
                  <CitationBlock
                    key={citation.ref}
                    refNumber={citation.ref}
                    verification="verified"
                    label={citation.heading ?? citation.sourceRef ?? citation.title}
                    quote={citation.snippet || citation.quote}
                  />
                ))}
              </div>
            ) : null}
            {turn.role === "agent" &&
            !turn.refused &&
            turn.followUpQuestions &&
            turn.followUpQuestions.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-medium text-text-muted">Handige vervolgvragen</p>
                <div className="flex flex-wrap gap-1.5">
                  {turn.followUpQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      disabled={busy}
                      onClick={() => void send(question)}
                      className="w-fit max-w-full rounded-pill bg-primary-tint px-2.5 py-1 text-left text-xs text-text hover:bg-primary/10 disabled:opacity-50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          );
        })}
        </div>
        )}
        </div>
      </div>

      <form
        className="bg-page px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="flex items-end gap-2 rounded-pill bg-surface p-2 shadow-[var(--elevation-raised)]">
          <Field
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Typ je vraag…"
            disabled={busy}
            className="flex-1 border-none bg-transparent shadow-none focus-visible:ring-0"
          />
          <IconButton
            type="submit"
            label="Verstuur"
            disabled={busy || input.trim().length === 0}
            className="h-8 w-8 shrink-0"
          >
            {/* Inline arrow-up — embed has no lucide dep */}
            <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path d="M8 13V3m0 0L4 7m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
      </form>

      <p className="border-t border-border bg-surface px-4 py-2 text-[11px] leading-snug text-text-subtle">
        {article50}
      </p>
    </Card>
  );

  return (
    <div
      data-agent={resolvedAgentId}
      style={themeStyle(config?.theme)}
      className={inline ? "h-full w-full font-sans" : "fixed bottom-4 right-4 z-[2147483647] font-sans"}
    >
      {inline || open ? (
        panel
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-pill bg-primary px-5 py-3 text-sm font-medium text-on-primary shadow-[var(--elevation-glow)] hover:bg-primary-hover"
        >
          {tagline}
        </button>
      )}
    </div>
  );
}
