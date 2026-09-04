import {
  and,
  asc,
  eq,
  getDb,
  roleplayMessages,
  roleplayReviews,
  roleplayScenarios,
  roleplaySessions,
  sql,
  withFundSchema,
} from "@wunderstack/db";
import type {
  RoleplayCriterionScore,
  RoleplayDifficulty,
  RoleplayEndReason,
  RoleplayOrigin,
} from "@wunderstack/shared";
import { roleplayEndReasonSchema } from "@wunderstack/shared";

import { resolveRubric } from "./rubric";
import {
  parseScenarioSnapshot,
  type RoleplayScenarioSnapshot,
} from "./snapshot";
import type { RoleplayMessage } from "./types";

/**
 * Persistence for roleplay sessions.
 *
 * This lives in `@wunderstack/agents` rather than in `apps/runtime` because the boundary rule
 * `no-apps-to-fund-schema` forbids an app from touching `packages/db/src/schema/fund/` directly
 * (ADR-multitenant-database): fund data reaches an app through a package that owns it, the way the
 * corpus reaches it through `packages/rag` and the event log through `@wunderstack/analytics`.
 * Roleplay has no such owner, and R6 rules out a new package, so it lands next to the agent that
 * produces the data. The agent seam itself (`agent.ts`) stays database-free; this is a sibling
 * module, not a layer under it.
 *
 * Scenarios are control-plane rows and sessions are fund data, so a session references its scenario
 * by slug and version rather than by a foreign key — the two live in different schemas.
 */

/** A session as the routes need it: identity, budget, and the frozen scenario. */
export interface RoleplaySessionRecord {
  id: string;
  status: "active" | "ended";
  endReason: RoleplayEndReason | null;
  turnsUsed: number;
  maxTurns: number;
  snapshot: RoleplayScenarioSnapshot;
  promptVersion: string;
}

export interface StartSessionInput {
  fund: string;
  slug: string;
  snapshot: RoleplayScenarioSnapshot;
  promptVersion: string;
  maxTurns: number;
  origin: RoleplayOrigin;
  /** The persona's first line. Stored as the opening transcript message (ordinal 0). */
  opening: string;
  externalUserRef?: string;
  externalContextRef?: string;
  resultTarget?: Record<string, unknown>;
}

/** The scenario as authored, resolved for one difficulty and ready to freeze into a session. */
export interface ResolvedScenario {
  snapshot: RoleplayScenarioSnapshot;
  maxTurns: number;
}

/**
 * Load a published scenario and resolve it for the requested difficulty.
 *
 * Only `published` scenarios can start a session: a draft is unfinished work and an archived one was
 * deliberately withdrawn. Returns null for both, and for an unknown slug — the route turns all three
 * into the same 404 so a caller cannot probe which slugs exist as drafts.
 *
 * An unknown difficulty is not an error here: the scenario simply authored no modulation for that
 * level, and the baseline scenario is perfectly playable. `snapshot.difficulty` records null in that
 * case, so a session says truthfully which modulation it ran with.
 */
export async function resolvePublishedScenario(
  fund: string,
  slug: string,
  difficulty?: RoleplayDifficulty,
): Promise<ResolvedScenario | null> {
  const [row] = await getDb()
    .select()
    .from(roleplayScenarios)
    .where(
      and(
        eq(roleplayScenarios.fundKey, fund),
        eq(roleplayScenarios.slug, slug),
        eq(roleplayScenarios.status, "published"),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const modulation = difficulty === undefined ? undefined : row.difficulties[difficulty];
  const snapshot = parseScenarioSnapshot({
    slug: row.slug,
    version: row.version,
    difficulty: modulation === undefined ? null : (difficulty ?? null),
    prompt: {
      partnerRole: row.partnerRole,
      userRole: row.userRole,
      userTitle: row.userTitle,
      persona: row.persona,
      contextDescription: row.contextDescription,
      hiddenInformation: row.hiddenInformation,
      learningObjective: row.learningObjective,
      secondaryObjective: row.secondaryObjective,
      commonPitfalls: row.commonPitfalls,
      instructions: row.instructions,
      openingLine: row.openingLine,
      endCondition: row.endCondition,
      rubric: resolveRubric(row.rubric),
      ...(modulation === undefined ? {} : { difficulty: modulation }),
    },
    display: { title: row.title, briefing: row.briefing },
  });

  return { snapshot, maxTurns: row.maxTurns };
}

/**
 * Create a session and store the opening line as its first message, in one transaction.
 *
 * Both or neither: a session whose opening never landed would show the learner an empty transcript
 * and give the reviewer a conversation that starts mid-sentence.
 */
export async function startSession(input: StartSessionInput): Promise<string> {
  return withFundSchema(input.fund, async (tx) => {
    const [session] = await tx
      .insert(roleplaySessions)
      .values({
        scenarioSlug: input.slug,
        scenarioVersion: input.snapshot.version,
        scenarioSnapshot: input.snapshot,
        promptVersion: input.promptVersion,
        difficulty: input.snapshot.difficulty,
        maxTurns: input.maxTurns,
        origin: input.origin,
        externalUserRef: input.externalUserRef ?? null,
        externalContextRef: input.externalContextRef ?? null,
        resultTarget: input.resultTarget ?? null,
      })
      .returning({ id: roleplaySessions.id });

    if (!session) {
      throw new Error("Failed to create roleplay session.");
    }

    await tx.insert(roleplayMessages).values({
      sessionId: session.id,
      ordinal: 0,
      role: "assistant",
      content: input.opening,
    });

    return session.id;
  });
}

/** The session row, or null when this fund has no such session. Never leaks across funds. */
export async function loadSession(
  fund: string,
  sessionId: string,
): Promise<RoleplaySessionRecord | null> {
  const [row] = await withFundSchema(fund, (tx) =>
    tx.select().from(roleplaySessions).where(eq(roleplaySessions.id, sessionId)).limit(1),
  );
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    status: row.status === "ended" ? "ended" : "active",
    endReason: (() => {
      const parsed = roleplayEndReasonSchema.safeParse(row.endReason);
      return parsed.success ? parsed.data : null;
    })(),
    turnsUsed: row.turnsUsed,
    maxTurns: row.maxTurns,
    snapshot: parseScenarioSnapshot(row.scenarioSnapshot),
    promptVersion: row.promptVersion,
  };
}

/** The transcript, oldest first. */
export async function loadTranscript(
  fund: string,
  sessionId: string,
): Promise<RoleplayMessage[]> {
  const rows = await withFundSchema(fund, (tx) =>
    tx
      .select({ role: roleplayMessages.role, content: roleplayMessages.content })
      .from(roleplayMessages)
      .where(eq(roleplayMessages.sessionId, sessionId))
      .orderBy(asc(roleplayMessages.ordinal)),
  );
  return rows.map((row) => ({
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
  }));
}

export type ClaimTurnResult =
  | { found: false }
  | { found: true; accepted: boolean; turnsUsed: number; maxTurns: number };

/**
 * Spend one turn, atomically.
 *
 * The check and the increment are the same UPDATE (`claim_roleplay_turn`, see fund-ddl.ts), because
 * read-then-write loses a turn when two tabs post at once and a separate pre-flight check lets two
 * concurrent turns both pass and together exceed the budget.
 *
 * Three outcomes, and the caller must tell them apart: no such session (`found: false` — a 404),
 * a session that is finished or out of turns (`accepted: false` — a refusal, not an error), and a
 * granted turn. Collapsing the first two would report a typo'd session id as "conversation over".
 */
export async function claimTurn(fund: string, sessionId: string): Promise<ClaimTurnResult> {
  const rows = (await withFundSchema(fund, (tx) =>
    tx.execute(sql`SELECT * FROM claim_roleplay_turn(${sessionId}::uuid)`),
  )) as unknown as Array<{ turns_used: number; max_turns: number; accepted: boolean }>;

  const row = rows[0];
  if (!row) {
    return { found: false };
  }
  return {
    found: true,
    accepted: row.accepted,
    turnsUsed: Number(row.turns_used),
    maxTurns: Number(row.max_turns),
  };
}

/**
 * Next user/assistant ordinals after the highest already stored. Pure so concurrent appends can be
 * unit-tested: sharing the same `lastOrdinal` without a lock is what produces collisions; with a
 * row lock, callers never observe the same last ordinal.
 */
export function nextMessageOrdinals(lastOrdinal: number | undefined): {
  user: number;
  assistant: number;
} {
  const next = (lastOrdinal ?? -1) + 1;
  return { user: next, assistant: next + 1 };
}

/**
 * Append the learner's line and the persona's reply, and optionally end the session, in one
 * transaction after the model answered.
 *
 * The session row is locked (`FOR UPDATE`) before `MAX(ordinal)` so two concurrent persist
 * callbacks cannot allocate the same ordinals. Ending in the same txn means a review cannot see
 * messages without the matching `status='ended'` (and the reverse).
 *
 * Writing the learner's message before calling the model would leave an unanswered user turn in the
 * transcript whenever generation fails. The turn counter is claimed first and separately — that one
 * must be spent even if generation fails, or a retry loop would be free.
 */
export async function appendTurnAndMaybeEnd(
  fund: string,
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  endReason: RoleplayEndReason | null,
): Promise<void> {
  await withFundSchema(fund, async (tx) => {
    // Serialize ordinal allocation (and the optional end) on the session row.
    await tx
      .select({ id: roleplaySessions.id })
      .from(roleplaySessions)
      .where(eq(roleplaySessions.id, sessionId))
      .for("update");

    const [last] = await tx
      .select({ ordinal: roleplayMessages.ordinal })
      .from(roleplayMessages)
      .where(eq(roleplayMessages.sessionId, sessionId))
      .orderBy(sql`${roleplayMessages.ordinal} DESC`)
      .limit(1);

    const ordinals = nextMessageOrdinals(last?.ordinal);
    await tx.insert(roleplayMessages).values([
      { sessionId, ordinal: ordinals.user, role: "user", content: userMessage },
      { sessionId, ordinal: ordinals.assistant, role: "assistant", content: assistantMessage },
    ]);

    if (endReason !== null) {
      await tx
        .update(roleplaySessions)
        .set({ status: "ended", endReason, endedAt: new Date() })
        .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.status, "active")));
    }
  });
}

/**
 * Append without ending. Prefer `appendTurnAndMaybeEnd` when the turn may also close the session.
 */
export async function appendTurn(
  fund: string,
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  await appendTurnAndMaybeEnd(fund, sessionId, userMessage, assistantMessage, null);
}

/**
 * Close a session. Only an active session is closed, so a second call — a double-click on "stop", a
 * retried request — leaves the original reason and timestamp intact rather than relabelling a
 * completed conversation as abandoned.
 *
 * Returns the reason the session actually ended with, which may not be the one requested.
 */
export async function endSession(
  fund: string,
  sessionId: string,
  endReason: RoleplayEndReason,
): Promise<RoleplayEndReason | null> {
  const updated = await withFundSchema(fund, (tx) =>
    tx
      .update(roleplaySessions)
      .set({ status: "ended", endReason, endedAt: new Date() })
      .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.status, "active")))
      .returning({ endReason: roleplaySessions.endReason }),
  );

  if (updated[0]) {
    return endReason;
  }
  const existing = await loadSession(fund, sessionId);
  return existing?.endReason ?? null;
}

export interface StoredReview {
  criteria: RoleplayCriterionScore[];
  weightedScore: number;
  passed: boolean;
  feedbackSummary: string;
}

/** The stored review for a session, or null when it has not been judged yet. */
export async function loadReview(fund: string, sessionId: string): Promise<StoredReview | null> {
  const [row] = await withFundSchema(fund, (tx) =>
    tx.select().from(roleplayReviews).where(eq(roleplayReviews.sessionId, sessionId)).limit(1),
  );
  if (!row) {
    return null;
  }
  return {
    criteria: row.criterionScores,
    weightedScore: row.weightedScore,
    passed: row.passed,
    feedbackSummary: row.feedbackSummary,
  };
}

/**
 * Store a review. One row per session (unique index). First insert wins — a second claim that
 * slipped through must not overwrite a grade that may already be on the outbox / LMS.
 * Returns true when this call inserted the row (caller should enqueue delivery).
 */
export async function saveReview(
  fund: string,
  sessionId: string,
  review: StoredReview & { reviewModel: string; promptVersion: string },
): Promise<boolean> {
  const inserted = await withFundSchema(fund, (tx) =>
    tx
      .insert(roleplayReviews)
      .values({
        sessionId,
        criterionScores: review.criteria,
        weightedScore: review.weightedScore,
        passed: review.passed,
        feedbackSummary: review.feedbackSummary,
        reviewModel: review.reviewModel,
        promptVersion: review.promptVersion,
      })
      .onConflictDoNothing({ target: roleplayReviews.sessionId })
      .returning({ id: roleplayReviews.id }),
  );
  return inserted.length > 0;
}

/**
 * Claim the right to run the review for this session. First-write-wins across processes: only the
 * caller that sets `review_started_at` proceeds. A second process is a no-op so two model calls
 * cannot race into `saveReview` / the outbox.
 */
export async function claimReview(fund: string, sessionId: string): Promise<boolean> {
  const updated = await withFundSchema(fund, (tx) =>
    tx
      .update(roleplaySessions)
      .set({ reviewStartedAt: new Date() })
      .where(and(eq(roleplaySessions.id, sessionId), sql`${roleplaySessions.reviewStartedAt} IS NULL`))
      .returning({ id: roleplaySessions.id }),
  );
  return updated.length > 0;
}

/**
 * Clear a failed review claim so a later POST can retry (R4). No-op when a review row already
 * exists — that session is done.
 */
export async function clearReviewClaim(fund: string, sessionId: string): Promise<void> {
  if (await loadReview(fund, sessionId)) {
    return;
  }
  await withFundSchema(fund, (tx) =>
    tx
      .update(roleplaySessions)
      .set({ reviewStartedAt: null })
      .where(eq(roleplaySessions.id, sessionId)),
  );
}
