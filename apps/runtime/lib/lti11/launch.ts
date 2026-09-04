import {
  acquireLti11Nonce,
  getActiveLti11ConsumerByKey,
  getScenario,
  insertLti11Launch,
  releaseLti11Nonce,
} from "@wunderstack/db";
import { env, roleplayScenarioSlugSchema } from "@wunderstack/shared";

import { opaqueLtiRef } from "./opaque-ref";
import { validateSignature } from "./oauth";
import { mintLtiSessionToken } from "./session-token";

/** 90 minutes — clock skew between LMS and runtime. Same window as the nonce TTL. */
export const LTI11_MAX_TIMESTAMP_SKEW_SECONDS = 90 * 60;

export interface LaunchPathHint {
  slug: string;
}

export type PrepareLaunchResult =
  | { ok: false; response: Response }
  | {
      ok: true;
      appUrl: string;
      consumerKey: string;
      nonce: string;
      scenarioSlug: string;
      launchId: string;
    };

export function parseLaunchPathHint(segments: readonly string[]): LaunchPathHint | null {
  if (segments.length !== 2 || segments[0] !== "gesprek" || !segments[1]) {
    return null;
  }
  const slug = roleplayScenarioSlugSchema.safeParse(segments[1]);
  return slug.success ? { slug: slug.data } : null;
}

export function collectLaunchParams(form: FormData, search: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = value.toString();
  });
  search.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

export function resolveScenarioSlug(params: Record<string, string>, pathHint: LaunchPathHint | null): string | null {
  const raw =
    pathHint?.slug ||
    params["custom_template_slug"] ||
    params["custom_scenario_slug"] ||
    params["templateSlug"] ||
    params["template_slug"] ||
    params["scenarioSlug"] ||
    params["scenario_slug"] ||
    null;
  if (!raw) {
    return null;
  }
  const parsed = roleplayScenarioSlugSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function publicOrigin(): string | null {
  const raw = env.ROLEPLAY_PUBLIC_URL;
  if (!raw) {
    return null;
  }
  return raw.replace(/\/$/, "");
}

function fail(message: string, status: number): PrepareLaunchResult {
  return { ok: false, response: new Response(message, { status }) };
}

/**
 * Shared LTI 1.1 validation (steps 1–9 of Qonvo's prepareLti11Launch), minus user provisioning.
 *
 * Non-negotiable: nonce is claimed atomically, and the caller MUST release it if anything after
 * the claim fails — otherwise a browser retry is treated as a replay.
 */
export async function prepareLti11Launch(
  request: Request,
  pathHint: LaunchPathHint | null,
): Promise<PrepareLaunchResult> {
  const appUrl = publicOrigin();
  if (!appUrl) {
    return fail("ROLEPLAY_PUBLIC_URL is not configured", 503);
  }
  if (!env.LTI_SESSION_SECRET) {
    return fail("LTI_SESSION_SECRET is not configured", 503);
  }

  const url = new URL(request.url);
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Expected an application/x-www-form-urlencoded launch", 400);
  }
  const params = collectLaunchParams(formData, url.searchParams);

  const consumerKey = params["oauth_consumer_key"];
  const messageType = params["lti_message_type"];
  const timestamp = Number.parseInt(params["oauth_timestamp"] ?? "0", 10);
  const nonce = params["oauth_nonce"];

  if (messageType !== "basic-lti-launch-request") {
    return fail("Unsupported lti_message_type", 400);
  }
  if (!consumerKey || !nonce || !Number.isFinite(timestamp) || timestamp === 0) {
    return fail("Missing OAuth parameters", 400);
  }

  const consumer = await getActiveLti11ConsumerByKey(consumerKey);
  if (!consumer) {
    return fail("Unknown consumer", 403);
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > LTI11_MAX_TIMESTAMP_SKEW_SECONDS) {
    return fail("Timestamp expired", 403);
  }

  const baseUrl = `${appUrl}${url.pathname}`;
  if (!validateSignature("POST", baseUrl, params, consumer.consumerSecret)) {
    return fail("Invalid signature", 403);
  }

  const claimed = await acquireLti11Nonce(consumerKey, nonce);
  if (!claimed) {
    return fail("Nonce already used (replay detected)", 403);
  }

  const ltiUserId = params["user_id"]?.trim();
  if (!ltiUserId) {
    await releaseLti11Nonce(consumerKey, nonce);
    return fail("Missing user_id", 400);
  }

  // Names, emails and roles are deliberately unread (R3). Qonvo's matchOrCreateLti11User is not ported.

  const scenarioSlug = resolveScenarioSlug(params, pathHint);
  if (!scenarioSlug) {
    await releaseLti11Nonce(consumerKey, nonce);
    return fail("Missing or invalid scenario", 400);
  }

  const scenario = await getScenario(consumer.fundKey, scenarioSlug);
  if (!scenario || scenario.status !== "published") {
    await releaseLti11Nonce(consumerKey, nonce);
    return fail("Unknown or unpublished scenario", 404);
  }

  const opaqueUser = opaqueLtiRef(env.LTI_SESSION_SECRET, "user", consumer.id, ltiUserId);
  const contextRaw = params["context_id"]?.trim() || null;
  const opaqueContext = contextRaw
    ? opaqueLtiRef(env.LTI_SESSION_SECRET, "context", consumer.id, contextRaw)
    : null;

  let launchId: string | null = null;
  try {
    const launch = await insertLti11Launch({
      consumerId: consumer.id,
      ltiUserId: opaqueUser,
      resourceLinkId: params["resource_link_id"]?.trim() || null,
      contextId: opaqueContext,
      outcomeServiceUrl: params["lis_outcome_service_url"]?.trim() || null,
      resultSourcedId: params["lis_result_sourcedid"]?.trim() || null,
      scenarioSlug,
    });
    launchId = launch?.id ?? null;
  } catch (error) {
    console.error("[lti11] launch insert failed:", error);
  }

  if (!launchId) {
    await releaseLti11Nonce(consumerKey, nonce);
    return fail("Could not store launch", 500);
  }

  return {
    ok: true,
    appUrl,
    consumerKey,
    nonce,
    scenarioSlug,
    launchId,
  };
}

export async function handleLti11Launch(
  request: Request,
  pathHint: LaunchPathHint | null,
): Promise<Response> {
  const prep = await prepareLti11Launch(request, pathHint);
  if (!prep.ok) {
    return prep.response;
  }

  const { appUrl, consumerKey, nonce, scenarioSlug, launchId } = prep;

  let ltiToken: string;
  try {
    ltiToken = mintLtiSessionToken({ launchId });
  } catch (error) {
    console.error("[lti11] token mint failed:", error);
    await releaseLti11Nonce(consumerKey, nonce);
    return new Response("LTI session could not be created", { status: 503 });
  }

  const redirectUrl = new URL("/", appUrl);
  redirectUrl.searchParams.set("scenario", scenarioSlug);
  redirectUrl.searchParams.set("ltiToken", ltiToken);

  return new Response(null, {
    status: 302,
    headers: {
      Location: redirectUrl.toString(),
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}

export function lti11MethodNotAllowed(): Response {
  return new Response("LTI 1.1 launch accepts POST only", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
