import {
  AnswerCard,
  AnswerProgress,
  Card,
  CardSection,
  CitationBlock,
  Composer,
  Pill,
  RefusalNotice,
} from "@wunderstack/ui";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Starters, resolveStarterCategories } from "./starters";
import {
  chatEventSchema,
  embedConfigSchema,
  type ChatEvent,
  type EmbedCitation,
  type EmbedConfig,
  type EmbedLayout,
  type RetrievedPassage,
} from "./types";

interface Turn {
  role: "user" | "agent";
  text: string;
  citations?: EmbedCitation[];
  /** Early retrieval stubs — "Gevonden in de CAO", cleared when verified citations arrive. */
  passages?: RetrievedPassage[];
  refused?: boolean;
  /** Grounded follow-up chips from the `followups` stream event. */
  followUpQuestions?: string[];
  /** Progress phase while waiting for the first answer tokens. */
  phase?: "searching" | "retrieved" | "generating" | null;
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

const PROGRESS_STEPS = [
  { id: "searching", label: "CAO doorzoeken" },
  { id: "retrieved", label: "Passages beoordelen" },
  { id: "generating", label: "Bronvermelding controleren" },
];

/** Friendly agent sub-label — same copy as the playground. */
function agentSubLabel(agentId: string): string {
  if (agentId === "arbo") return "Arbocatalogus";
  if (agentId === "cao") return "CAO-agent";
  return agentId;
}

/** Align a new turn to the top of the thread so the answer is readable from the start. */
function scrollChildToStart(
  container: HTMLElement,
  child: HTMLElement,
  behavior: ScrollBehavior,
): void {
  const nextTop =
    container.scrollTop + (child.getBoundingClientRect().top - container.getBoundingClientRect().top);
  container.scrollTo({ top: Math.max(0, nextTop), behavior });
}

function lastUserTurnIndex(turns: Turn[]): number {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]?.role === "user") {
      return i;
    }
  }
  return -1;
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
  const [busy, setBusy] = useState(false);
  /** True once `citations` arrived — composer unlocks while follow-ups may still stream. */
  const [answerSettled, setAnswerSettled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserIndex = lastUserTurnIndex(turns);
  const alignedUserIndexRef = useRef(-1);
  const sessionId = useMemo(
    () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`${endpoint}/api/config`, {
      headers: agentKey ? { "x-wunderstack-key": agentKey } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (cancelled || data === null) return;
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

  useEffect(() => {
    if (!open || lastUserIndex < 0) return;
    const container = scrollRef.current;
    const target = container?.querySelector(`[data-turn-index="${String(lastUserIndex)}"]`);
    if (!container || !(target instanceof HTMLElement)) return;
    const isNewQuestion = alignedUserIndexRef.current !== lastUserIndex;
    alignedUserIndexRef.current = lastUserIndex;
    scrollChildToStart(container, target, isNewQuestion ? "smooth" : "auto");
  }, [lastUserIndex, open]);

  const article50 = config?.article50 ?? DEFAULT_ARTICLE_50;
  const tagline = config?.texts.tagline ?? "Stel je vraag";
  const logo = config?.theme.logo;
  const snippetHint = agentId.trim();
  const resolvedAgentId = config?.agentId ?? (snippetHint || "cao");
  const composerLocked = busy && !answerSettled;
  const chipsLocked = busy;
  const showStop = busy && !answerSettled;

  useEffect(() => {
    if (!config || snippetHint.length === 0) return;
    if (snippetHint === config.agentId) return;
    console.warn(
      `[wunderstack-embed] data-agent="${snippetHint}" does not match this key's agent "${config.agentId}"; ignoring hint.`,
    );
  }, [config, snippetHint]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function closePanel(): void {
    abortRef.current?.abort();
    setOpen(false);
  }

  function stopTurn(): void {
    abortRef.current?.abort();
  }

  function updateLast(fn: (turn: Turn) => Turn): void {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      next[next.length - 1] = fn(next[next.length - 1] as Turn);
      return next;
    });
  }

  function applyEvent(event: ChatEvent): void {
    if (event.type === "status") {
      const phase =
        event.phase === "searching" || event.phase === "retrieved" || event.phase === "generating"
          ? event.phase
          : null;
      updateLast((turn) => ({
        ...turn,
        phase,
        ...(event.phase === "retrieved" && event.passages !== undefined
          ? { passages: event.passages }
          : {}),
      }));
    } else if (event.type === "text") {
      updateLast((turn) => ({ ...turn, text: turn.text + event.delta, phase: null }));
    } else if (event.type === "citations") {
      setAnswerSettled(true);
      updateLast((turn) => ({
        ...turn,
        text: event.answer || turn.text,
        citations: event.citations,
        passages: undefined,
        refused: !event.found && !event.needsClarification,
        phase: null,
      }));
    } else if (event.type === "followups") {
      updateLast((turn) => ({ ...turn, followUpQuestions: event.questions }));
    } else if (event.type === "error") {
      setAnswerSettled(true);
      updateLast((turn) => ({ ...turn, text: event.message, phase: null }));
    }
  }

  async function send(question: string): Promise<void> {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    const history = turns
      .slice(-6)
      .map((turn) => ({ role: turn.role === "agent" ? "assistant" : "user", content: turn.text }))
      .filter((message) => message.content.length > 0);
    setTurns((prev) => [
      ...prev,
      { role: "user", text: trimmed },
      { role: "agent", text: "", phase: "searching" },
    ]);
    setBusy(true);
    setAnswerSettled(false);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(agentKey ? { "x-wunderstack-key": agentKey } : {}),
        },
        body: JSON.stringify({
          question: trimmed,
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
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          let json: unknown;
          try {
            json = JSON.parse(raw);
          } catch {
            continue;
          }
          const parsed = chatEventSchema.safeParse(json);
          if (parsed.success) applyEvent(parsed.data);
        }
      }
    } catch {
      if (controller.signal.aborted) {
        /* keep whatever we already painted */
      } else {
        setAnswerSettled(true);
        updateLast((turn) => ({
          ...turn,
          text: turn.text || "Er ging iets mis. Probeer het later opnieuw.",
          phase: null,
        }));
      }
    } finally {
      setBusy(false);
      setAnswerSettled(true);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
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
            onClick={closePanel}
            aria-label="Sluiten"
            className="ml-auto rounded p-1 text-text-muted hover:text-text"
          >
            ✕
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-page px-4 py-4">
        {turns.length === 0 ? (
          <Starters
            categories={resolveStarterCategories(config?.texts)}
            onPick={(question) => void send(question)}
            {...(config?.texts.tagline ? { title: config.texts.tagline } : {})}
            {...(config?.texts.intro ? { intro: config.texts.intro } : {})}
          />
        ) : null}
        {turns.map((turn, index) => {
          const waiting = turn.role === "agent" && turn.text.length === 0 && !turn.refused;
          return (
            <div key={index} data-turn-index={index} className="flex flex-col gap-2">
              {turn.refused ? (
                <RefusalNotice size="sm">{turn.text}</RefusalNotice>
              ) : turn.role === "user" ? (
                <AnswerCard role="user" size="sm">
                  {turn.text}
                </AnswerCard>
              ) : (
                <AnswerCard
                  role="agent"
                  size="sm"
                  agentLabel="AI-assistent"
                  agentSubLabel={agentSubLabel(resolvedAgentId)}
                  footer={
                    <>
                      {turn.citations && turn.citations.length > 0 ? (
                        <CardSection heading="Bronnen" size="sm">
                          <ul className="flex flex-col gap-2">
                            {turn.citations.map((citation) => (
                              <li key={citation.ref}>
                                <CitationBlock
                                  size="sm"
                                  refNumber={citation.ref}
                                  verification="verified"
                                  label={citation.sourceRef ?? citation.heading ?? citation.title}
                                  quote={citation.snippet || citation.quote}
                                />
                              </li>
                            ))}
                          </ul>
                        </CardSection>
                      ) : turn.passages && turn.passages.length > 0 ? (
                        <CardSection heading="Gevonden in de CAO" size="sm" muted>
                          <ul className="flex flex-col gap-2">
                            {turn.passages.map((passage) => (
                              <li key={passage.ref}>
                                <CitationBlock
                                  size="sm"
                                  refNumber={passage.ref}
                                  verification="caution"
                                  label={
                                    passage.sourceRef ??
                                    (passage.article ? `Artikel ${passage.article}` : passage.title)
                                  }
                                />
                              </li>
                            ))}
                          </ul>
                        </CardSection>
                      ) : null}
                      {turn.followUpQuestions && turn.followUpQuestions.length > 0 ? (
                        <CardSection size="sm">
                          <p className="mb-1.5 text-[11px] font-medium text-text-muted">
                            Handige vervolgvragen
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {turn.followUpQuestions.map((question) => (
                              <button
                                key={question}
                                type="button"
                                disabled={chipsLocked}
                                onClick={() => void send(question)}
                                className="disabled:opacity-50"
                              >
                                <Pill
                                  variant="primary"
                                  size="sm"
                                  className="max-w-full cursor-pointer hover:bg-primary/10"
                                >
                                  {question}
                                </Pill>
                              </button>
                            ))}
                          </div>
                        </CardSection>
                      ) : null}
                    </>
                  }
                >
                  {waiting ? (
                    <AnswerProgress
                      size="sm"
                      steps={PROGRESS_STEPS}
                      activeId={turn.phase ?? "searching"}
                    />
                  ) : (
                    turn.text
                  )}
                </AnswerCard>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-page px-3 py-3">
        <Composer
          size="sm"
          multiline={false}
          disabled={composerLocked && !showStop}
          stopping={showStop}
          onSend={(q) => void send(q)}
          onStop={stopTurn}
          placeholder="Typ je vraag…"
        />
      </div>

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
