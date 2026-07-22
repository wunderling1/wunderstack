import {
  AnswerCard,
  Button,
  Card,
  CitationBlock,
  Field,
  RefusalNotice,
} from "@wunderstack/ui";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  chatEventSchema,
  embedConfigSchema,
  type ChatEvent,
  type EmbedCitation,
  type EmbedConfig,
} from "./types";

interface Turn {
  role: "user" | "agent";
  text: string;
  citations?: EmbedCitation[];
  refused?: boolean;
}

interface Props {
  endpoint: string;
  agentKey: string | null;
  agentId: string;
}

const DEFAULT_ARTICLE_50 =
  "Je praat met een AI-assistent. Antwoorden kunnen onjuist zijn; controleer belangrijke informatie bij de bron.";

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

export function EmbedApp({ endpoint, agentKey, agentId }: Props) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, open]);

  const article50 = config?.article50 ?? DEFAULT_ARTICLE_50;
  const tagline = config?.texts.tagline ?? "Stel je vraag over de CAO";
  const logo = config?.theme.logo;

  function updateLast(fn: (turn: Turn) => Turn): void {
    setTurns((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice();
      next[next.length - 1] = fn(next[next.length - 1] as Turn);
      return next;
    });
  }

  function applyEvent(event: ChatEvent): void {
    if (event.type === "text") {
      updateLast((turn) => ({ ...turn, text: turn.text + event.delta }));
    } else if (event.type === "citations") {
      updateLast((turn) => ({
        ...turn,
        text: event.answer || turn.text,
        citations: event.citations,
        refused: !event.found && !event.needsClarification,
      }));
    } else if (event.type === "error") {
      updateLast((turn) => ({ ...turn, text: event.message }));
    }
  }

  async function send(): Promise<void> {
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    const history = turns
      .slice(-6)
      .map((turn) => ({ role: turn.role === "agent" ? "assistant" : "user", content: turn.text }))
      .filter((message) => message.content.length > 0);
    setTurns((prev) => [...prev, { role: "user", text: question }, { role: "agent", text: "" }]);
    setBusy(true);

    try {
      const res = await fetch(`${endpoint}/api/chat`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(agentKey ? { "x-wunderstack-key": agentKey } : {}),
        },
        body: JSON.stringify({ question, history, sessionId }),
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
            continue; /* ignore a partial/garbled line */
          }
          // Validate each stream event at the boundary; skip anything off-contract.
          const parsed = chatEventSchema.safeParse(json);
          if (parsed.success) applyEvent(parsed.data);
        }
      }
    } catch {
      updateLast((turn) => ({
        ...turn,
        text: turn.text || "Er ging iets mis. Probeer het later opnieuw.",
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-agent={agentId}
      style={themeStyle(config?.theme)}
      className="fixed bottom-4 right-4 z-[2147483647] font-sans"
    >
      {open ? (
        <Card className="flex h-[70vh] max-h-[600px] w-[min(92vw,380px)] flex-col overflow-hidden p-0 shadow-xl">
          <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
            {logo ? <img src={logo} alt="" className="h-6 w-auto" /> : null}
            <p className="min-w-0 truncate text-sm font-semibold text-text">{tagline}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluiten"
              className="ml-auto rounded p-1 text-text-muted hover:text-text"
            >
              ✕
            </button>
          </div>

          <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto bg-page px-4 py-4">
            {turns.length === 0 ? <p className="text-sm text-text-muted">{tagline}</p> : null}
            {turns.map((turn, index) => (
              <div key={index} className="flex flex-col gap-2">
                {turn.refused ? (
                  <RefusalNotice>{turn.text}</RefusalNotice>
                ) : (
                  <AnswerCard role={turn.role}>
                    {turn.text || (turn.role === "agent" ? "…" : "")}
                  </AnswerCard>
                )}
                {turn.citations && turn.citations.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {turn.citations.map((citation) => (
                      <CitationBlock
                        key={citation.ref}
                        refNumber={citation.ref}
                        verification="verified"
                        label={citation.sourceRef ?? citation.heading ?? citation.title}
                        quote={citation.snippet || citation.quote}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <form
            className="flex items-end gap-2 border-t border-border bg-surface px-3 py-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <Field
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Typ je vraag…"
              disabled={busy}
              className="flex-1"
            />
            <Button type="submit" disabled={busy || input.trim().length === 0}>
              {busy ? "…" : "Stuur"}
            </Button>
          </form>

          <p className="border-t border-border bg-surface px-4 py-2 text-[11px] leading-snug text-text-subtle">
            {article50}
          </p>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-pill bg-primary px-5 py-3 text-sm font-medium text-on-primary shadow-lg hover:bg-primary-hover"
        >
          Vraag de CAO-agent
        </button>
      )}
    </div>
  );
}
