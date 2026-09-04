import type { AgentChannel } from "@wunderstack/shared";

/**
 * Where one conversation ends and the next begins — the only definition (S22/D10).
 *
 * `interaction_events.session_id` is not a conversation. The playground keeps it in
 * `sessionStorage` without an expiry, so it lives as long as the browser tab. Measured on
 * 1 September 2026 across `fund_oomt` and `fund_elektronische-detailhandel`: 224 questions fell
 * into 38 raw session ids (5.90 each), with one session spanning 63 questions over 34 hours and a
 * 12h17 gap inside it. Splitting on 30 minutes of silence turns that into 89 conversations
 * (2.52 each). Without the split, the adoption figure would be inflated 2.3x by parked dev tabs.
 *
 * Derived rather than stored (D10): one definition covers the rows that already existed as well as
 * new ones, where a column would mean deriving the old and assigning the new — two definitions of
 * one concept. Promotion to a column stays open for when the evidence anchor or the volume asks
 * for it.
 */
export const CONVERSATION_GAP_MINUTES = 30;

/**
 * Channels whose calls carry no thread id, so every question is its own conversation. `/api/mcp` is
 * deliberately stateless (`createMcpHandler`, PLAN-mcp-server M2): the host has a conversation but
 * hands us nothing to thread turns onto. Measured: 10 MCP questions, 10 conversations, exactly
 * 1.00. That is the truth of the channel, not a measurement error — so these are named as
 * standalone questions instead of counted as an adoption signal.
 */
export const UNTHREADED_CHANNELS = ["mcp", "api"] as const satisfies readonly AgentChannel[];

/**
 * Null means a row from before the channel dimension existed (PLAN-mcp-server Fase 1a). Those are
 * playground and embed traffic and do group — one measured session holds 21 of them.
 */
export function isThreadedChannel(channel: string | null): boolean {
  if (channel === null) return true;
  return !(UNTHREADED_CHANNELS as readonly string[]).includes(channel);
}

/** The fields the boundary needs. Callers pass their own row type through. */
export interface ConversationBoundaryRow {
  id: string;
  sessionId: string;
  agentKey: string;
  occurredAt: Date;
  channel: string | null;
}

export interface ConversationGroup<T> {
  /**
   * The first question's event id. Stable for a given set of rows, but window-dependent: a shorter
   * period can put a later question first. That is why a permalink stays an event id and the detail
   * page resolves it to its conversation, instead of addressing this value (A6).
   */
  id: string;
  sessionId: string;
  agentKey: string;
  /** Chronological, oldest first. Typed non-empty so reading the first question needs no assertion. */
  questions: [T, ...T[]];
}

function compareRows(a: ConversationBoundaryRow, b: ConversationBoundaryRow): number {
  if (a.sessionId !== b.sessionId) return a.sessionId < b.sessionId ? -1 : 1;
  if (a.agentKey !== b.agentKey) return a.agentKey < b.agentKey ? -1 : 1;
  const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Group turns into conversations: same session, same agent, no longer than `gapMinutes` of silence
 * between two questions.
 *
 * The agent is part of the key, not just the session: the playground shares one `sessionStorage`
 * key across agents, and two measured sessions in `fund_oomt` carry both `cao` and `arbo`. S22 says
 * one visitor, one agent.
 */
export function groupIntoConversations<T extends ConversationBoundaryRow>(
  rows: readonly T[],
  gapMinutes: number = CONVERSATION_GAP_MINUTES,
): Array<ConversationGroup<T>> {
  const gapMs = gapMinutes * 60_000;
  const groups: Array<ConversationGroup<T>> = [];
  let current: ConversationGroup<T> | undefined;
  let previousAt = 0;

  for (const row of [...rows].sort(compareRows)) {
    const at = row.occurredAt.getTime();
    const rowThreaded = isThreadedChannel(row.channel);
    const continues =
      current !== undefined &&
      rowThreaded &&
      isThreadedChannel(current.questions[0].channel) &&
      current.sessionId === row.sessionId &&
      current.agentKey === row.agentKey &&
      at - previousAt <= gapMs;

    if (current !== undefined && continues) {
      current.questions.push(row);
    } else {
      current = {
        id: row.id,
        sessionId: row.sessionId,
        agentKey: row.agentKey,
        questions: [row],
      };
      groups.push(current);
    }
    previousAt = at;
  }

  return groups;
}
