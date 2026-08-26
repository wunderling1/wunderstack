import { after } from "next/server";
import { createRoleplayAgent, resolvePublishedScenario, startSession } from "@wunderstack/agents";
import { consumeLti11Launch } from "@wunderstack/db";
import { env, roleplayStartRequestSchema, roleplayStartResponseSchema } from "@wunderstack/shared";

import {
  checkRoleplayDailyCap,
  gateRoleplayRequest,
  roleplayPreflight,
} from "@/lib/roleplay-request";
import { resolveRoleplayFund } from "@/lib/roleplay-scope";
import { processDueDeliveries } from "@/lib/roleplay-delivery";
import { assertSafeDeliveryUrl } from "@/lib/safe-delivery-url";
import { acquireSlot, releaseSlot } from "@/lib/rate-limit";

/**
 * POST /api/roleplay/start — open a roleplay session.
 *
 * A thin controller (200-architecture.mdc): validate, authorize the fund, resolve the scenario,
 * delegate the opening line to the agent seam, persist. Prompt and persona logic live in
 * `@wunderstack/agents`; the fund schema is reached through that package because an app may not
 * import fund tables itself (`no-apps-to-fund-schema`).
 *
 * Plain JSON rather than NDJSON: the opening line is one short generation with nothing to report
 * progressively. The turn endpoint streams because a turn can take tens of seconds and needs
 * heartbeats.
 *
 * `origin: "webhook"` snapshots a delivery URL onto the session. An LTI launch (Fase 8) does the
 * same from the signed token — the client cannot set `origin` or `resultTarget` on that path.
 * `after()` also drains due deliveries from earlier sessions, so retries do not wait for another
 * review.
 */

export const runtime = "nodejs";

export async function OPTIONS(request: Request): Promise<Response> {
  return roleplayPreflight(request);
}

export async function POST(request: Request): Promise<Response> {
  const gate = await gateRoleplayRequest(request, "start");
  if (!gate.ok) {
    return gate.response;
  }
  const { cors } = gate;

  const parsed = roleplayStartRequestSchema.safeParse(gate.json);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
  }

  const ltiLaunch = gate.ltiLaunch;
  if (ltiLaunch && parsed.data.scenarioSlug !== ltiLaunch.scenarioSlug) {
    return Response.json({ error: "scenario_mismatch" }, { status: 403, headers: cors });
  }
  if (ltiLaunch && parsed.data.fund && parsed.data.fund !== ltiLaunch.fundKey) {
    return Response.json({ error: "fund_mismatch" }, { status: 403, headers: cors });
  }

  const scope = resolveRoleplayFund(gate.config, ltiLaunch?.fundKey ?? parsed.data.fund);
  if (!scope.ok) {
    return Response.json({ error: scope.error }, { status: scope.status, headers: cors });
  }
  const { fund } = scope;
  if (ltiLaunch && fund !== ltiLaunch.fundKey) {
    return Response.json({ error: "fund_mismatch" }, { status: 403, headers: cors });
  }

  // Draft, archived and non-existent all answer the same way: a caller must not be able to discover
  // which slugs exist as unpublished drafts by comparing 404s against 403s.
  const scenario = await resolvePublishedScenario(
    fund,
    parsed.data.scenarioSlug,
    parsed.data.difficulty,
  );
  if (!scenario) {
    return Response.json({ error: "scenario_not_found" }, { status: 404, headers: cors });
  }

  const origin = ltiLaunch ? "lti11" : (parsed.data.origin ?? "embed");
  let ltiResultTarget = ltiLaunch?.resultTarget;
  if (ltiResultTarget) {
    try {
      await assertSafeDeliveryUrl(ltiResultTarget.outcomeServiceUrl);
    } catch {
      ltiResultTarget = undefined;
    }
  }
  if (origin === "webhook") {
    if (!env.WEBHOOK_SIGNING_SECRET) {
      return Response.json({ error: "webhook_not_configured" }, { status: 503, headers: cors });
    }
    const target = parsed.data.resultTarget;
    if (!target) {
      return Response.json({ error: "invalid_request" }, { status: 400, headers: cors });
    }
    try {
      await assertSafeDeliveryUrl(target.url);
    } catch {
      return Response.json({ error: "unsafe_delivery_url" }, { status: 400, headers: cors });
    }
  }

  // Single-use launch: consume before paying for the opening line so a parallel start cannot share
  // the same lis_result_sourcedid and overwrite the LMS grade.
  if (ltiLaunch) {
    const consumed = await consumeLti11Launch(ltiLaunch.launchId);
    if (!consumed) {
      return Response.json({ error: "launch_already_used" }, { status: 409, headers: cors });
    }
  }

  const capped = checkRoleplayDailyCap(cors);
  if (capped) {
    return capped;
  }
  if (!acquireSlot()) {
    return Response.json(
      { error: "server_busy" },
      { status: 503, headers: { "retry-after": "5", ...cors } },
    );
  }

  try {
    const { snapshot, maxTurns } = scenario;
    const opening = await createRoleplayAgent().openingLine(
      { scenario: snapshot.prompt },
      { signal: request.signal },
    );

    const sessionId = await startSession({
      fund,
      slug: snapshot.slug,
      snapshot,
      promptVersion: opening.promptVersion,
      maxTurns,
      origin,
      opening: opening.text,
      externalUserRef: ltiLaunch ? ltiLaunch.externalUserRef : parsed.data.externalUserRef,
      externalContextRef: ltiLaunch
        ? (ltiLaunch.externalContextRef ?? undefined)
        : parsed.data.externalContextRef,
      resultTarget: ltiLaunch
        ? ltiResultTarget
        : origin === "webhook"
          ? parsed.data.resultTarget
          : undefined,
    });

    after(() => processDueDeliveries(fund));

    return Response.json(
      roleplayStartResponseSchema.parse({
        sessionId,
        title: snapshot.display.title,
        // The briefing goes to the learner and never to the model — it is not part of the prompt
        // snapshot at all, which is why it is read from the display half here.
        briefing: snapshot.display.briefing,
        opening: opening.text,
        partnerRole: snapshot.prompt.partnerRole,
        userTitle: snapshot.prompt.userTitle,
        turnsUsed: 0,
        maxTurns,
      }),
      { headers: { "cache-control": "no-store", ...cors } },
    );
  } catch (error) {
    console.error("[api/roleplay/start] failed to start session:", error);
    return Response.json({ error: "start_failed" }, { status: 502, headers: cors });
  } finally {
    releaseSlot();
  }
}
