import { randomBytes, randomUUID } from "node:crypto";
import { getLti11ConsumerForDelivery } from "@wunderstack/db";
import type { RoleplayLti11Target, RoleplayResultEnvelope } from "@wunderstack/shared";

import { assertSafeDeliveryUrl, type DnsLookup } from "../safe-delivery-url";
import {
  buildSignatureBaseString,
  computeBodyHash,
  computeSignature,
  pctEncode,
} from "./oauth";

const OUTCOMES_TIMEOUT_MS = 20_000;

export type OutcomesFetch = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    redirect: "error";
    signal: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; text?: () => Promise<string> }>;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** IMS POX replaceResultRequest. Score is 0.0–1.0 with a point decimal. */
export function buildReplaceResultXml(sourcedId: string, score: number, messageId: string = randomUUID()): string {
  const normalized = Math.max(0, Math.min(1, score)).toFixed(4);
  return `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader>
    <imsx_POXRequestHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>${messageId}</imsx_messageIdentifier>
    </imsx_POXRequestHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>
    <replaceResultRequest>
      <resultRecord>
        <sourcedGUID>
          <sourcedId>${escapeXml(sourcedId)}</sourcedId>
        </sourcedGUID>
        <result>
          <resultScore>
            <language>en</language>
            <textString>${normalized}</textString>
          </resultScore>
        </result>
      </resultRecord>
    </replaceResultRequest>
  </imsx_POXBody>
</imsx_POXEnvelopeRequest>`;
}

/**
 * OAuth 1.0a base URI is scheme://authority/path — no query, no fragment. LMS POX URLs often carry
 * query params; putting them in the base string breaks the signature.
 */
export function oauthBaseUri(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export function buildOutcomesAuthHeader(
  url: string,
  consumerKey: string,
  consumerSecret: string,
  bodyHash: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  nonce = randomBytes(16).toString("hex"),
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(nowSeconds),
    oauth_nonce: nonce,
    oauth_version: "1.0",
    oauth_body_hash: bodyHash,
  };
  oauthParams["oauth_signature"] = computeSignature(
    buildSignatureBaseString("POST", oauthBaseUri(url), oauthParams),
    consumerSecret,
  );
  const header = Object.entries(oauthParams)
    .map(([key, value]) => `${pctEncode(key)}="${pctEncode(value)}"`)
    .join(",");
  return `OAuth ${header}`;
}

/**
 * Did the LMS accept the grade? A 2xx with `imsx_codeMajor` set to failure/error/unsupported is a
 * rejection even when the HTTP status is 200 — treating that as delivered leaves no retry.
 * Soft-accept only when the body has no codeMajor at all (some LMSes return bare 200).
 */
export function lti11OutcomeAccepted(status: number, responseText: string): boolean {
  if (status < 200 || status >= 300) {
    return false;
  }
  const codeMajor = responseText.match(/imsx_codeMajor\s*>\s*([^<\s]+)/i)?.[1]?.toLowerCase();
  if (codeMajor === undefined) {
    return true;
  }
  if (codeMajor === "failure" || codeMajor === "error" || codeMajor === "unsupported") {
    return false;
  }
  return codeMajor === "success";
}

/**
 * POST a Basic Outcomes replaceResult. Throws on a failed send so the outbox retries.
 * Inactive / passback-disabled consumers are a silent success: the admin opted out.
 */
export async function deliverLti11Outcome(
  target: RoleplayLti11Target,
  envelope: RoleplayResultEnvelope,
  deps: { fetch: OutcomesFetch; lookup: DnsLookup },
): Promise<void> {
  const consumer = await getLti11ConsumerForDelivery(target.consumerId);
  if (!consumer) {
    throw new Error("lti11_consumer_not_found");
  }
  if (consumer.status !== "active" || !consumer.gradePassbackEnabled) {
    return;
  }

  await assertSafeDeliveryUrl(target.outcomeServiceUrl, deps.lookup);

  const xmlBody = buildReplaceResultXml(target.resultSourcedId, envelope.data.normalizedScore);
  const bodyHash = computeBodyHash(xmlBody);
  const authHeader = buildOutcomesAuthHeader(
    target.outcomeServiceUrl,
    consumer.consumerKey,
    consumer.consumerSecret,
    bodyHash,
  );

  const response = await deps.fetch(target.outcomeServiceUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/xml",
    },
    body: xmlBody,
    redirect: "error",
    signal: AbortSignal.timeout(OUTCOMES_TIMEOUT_MS),
  });
  const responseText = typeof response.text === "function" ? await response.text() : "";
  if (!lti11OutcomeAccepted(response.status, responseText)) {
    throw new Error(`LTI outcome endpoint returned ${String(response.status)}.`);
  }
}
