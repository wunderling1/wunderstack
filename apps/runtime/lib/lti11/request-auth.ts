import { getUnexpiredLti11Launch, type Lti11LaunchAuth } from "@wunderstack/db";
import { roleplayLti11TargetSchema, type RoleplayLti11Target } from "@wunderstack/shared";

import { verifyLtiSessionToken } from "./session-token.js";

export const LTI_TOKEN_HEADER = "x-lti-token";
export const LTI_TOKEN_QUERY_PARAM = "ltiToken";

export type LtiLaunchBound = {
  launchId: string;
  fundKey: string;
  consumerId: string;
  scenarioSlug: string;
  externalUserRef: string;
  externalContextRef: string | null;
  gradePassbackEnabled: boolean;
  resultTarget: RoleplayLti11Target | undefined;
};

export function readLtiToken(request: Request): string | null {
  const header = request.headers.get(LTI_TOKEN_HEADER)?.trim();
  if (header) {
    return header;
  }
  try {
    const query = new URL(request.url).searchParams.get(LTI_TOKEN_QUERY_PARAM)?.trim();
    return query || null;
  } catch {
    return null;
  }
}

function resultTargetFromLaunch(auth: Lti11LaunchAuth): RoleplayLti11Target | undefined {
  if (!auth.consumer.gradePassbackEnabled) {
    return undefined;
  }
  const url = auth.launch.outcomeServiceUrl?.trim();
  const sourcedId = auth.launch.resultSourcedId?.trim();
  if (!url || !sourcedId) {
    return undefined;
  }
  const parsed = roleplayLti11TargetSchema.safeParse({
    kind: "lti11",
    consumerId: auth.consumer.id,
    outcomeServiceUrl: url,
    resultSourcedId: sourcedId,
  });
  return parsed.success ? parsed.data : undefined;
}

export async function resolveLtiLaunch(request: Request): Promise<
  | { ok: true; launch: LtiLaunchBound | null }
  | { ok: false; error: "invalid_lti_token" | "lti_token_expired"; status: 401 }
> {
  const token = readLtiToken(request);
  if (!token) {
    return { ok: true, launch: null };
  }
  const payload = verifyLtiSessionToken(token);
  if (!payload) {
    return { ok: false, error: "invalid_lti_token", status: 401 };
  }
  const loaded = await getUnexpiredLti11Launch(payload.lid);
  if (!loaded) {
    return { ok: false, error: "lti_token_expired", status: 401 };
  }
  return {
    ok: true,
    launch: {
      launchId: loaded.launch.id,
      fundKey: loaded.consumer.fundKey,
      consumerId: loaded.consumer.id,
      scenarioSlug: loaded.launch.scenarioSlug,
      externalUserRef: loaded.launch.ltiUserId,
      externalContextRef: loaded.launch.contextId,
      gradePassbackEnabled: loaded.consumer.gradePassbackEnabled,
      resultTarget: resultTargetFromLaunch(loaded),
    },
  };
}
