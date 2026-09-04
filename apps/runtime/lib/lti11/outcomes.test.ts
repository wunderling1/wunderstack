import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateSignature } from "./oauth";
import {
  buildOutcomesAuthHeader,
  buildReplaceResultXml,
  lti11OutcomeAccepted,
  oauthBaseUri,
} from "./outcomes";

describe("buildReplaceResultXml", () => {
  it("clamps the score to 0-1, escapes the sourcedId, and uses a point decimal", () => {
    const xml = buildReplaceResultXml("a&b<c>", 1.5, "msg-1");
    assert.equal(xml.includes("<textString>1.0000</textString>"), true);
    assert.equal(xml.includes("a&amp;b&lt;c&gt;"), true);
    assert.equal(xml.includes("<textString>1,0000"), false);
  });
});

describe("lti11OutcomeAccepted", () => {
  it("accepts an explicit success codeMajor", () => {
    assert.equal(lti11OutcomeAccepted(200, "<imsx_codeMajor>success</imsx_codeMajor>"), true);
    assert.equal(lti11OutcomeAccepted(200, "imsx_codeMajor>success"), true);
  });

  it("rejects failure/error/unsupported even on HTTP 200", () => {
    assert.equal(lti11OutcomeAccepted(200, "<imsx_codeMajor>failure</imsx_codeMajor>"), false);
    assert.equal(lti11OutcomeAccepted(200, "<imsx_codeMajor>error</imsx_codeMajor>"), false);
    assert.equal(lti11OutcomeAccepted(200, "<imsx_codeMajor>unsupported</imsx_codeMajor>"), false);
  });

  it("soft-accepts 2xx when the body has no codeMajor (bare LMS ack)", () => {
    assert.equal(lti11OutcomeAccepted(200, "<ok/>"), true);
    assert.equal(lti11OutcomeAccepted(200, ""), true);
  });

  it("rejects non-2xx regardless of body", () => {
    assert.equal(lti11OutcomeAccepted(500, "imsx_codeMajor>success"), false);
  });
});

describe("oauthBaseUri", () => {
  it("strips query and fragment so the OAuth base URI is origin+path only", () => {
    assert.equal(
      oauthBaseUri("https://lms.example/pox?sourcedid=1#frag"),
      "https://lms.example/pox",
    );
  });
});

describe("buildOutcomesAuthHeader", () => {
  it("signs oauth_body_hash into an OAuth Authorization header", () => {
    const header = buildOutcomesAuthHeader(
      "https://lms.example/pox",
      "key-1",
      "secret-1",
      "bodyhash==",
      1_788_000_000,
      "nonce-1",
    );
    assert.equal(header.startsWith("OAuth "), true);
    assert.equal(header.includes("oauth_body_hash="), true);
    const params: Record<string, string> = {};
    for (const part of header.slice("OAuth ".length).split(",")) {
      const [rawKey, rawValue] = part.split("=");
      if (!rawKey || rawValue === undefined) continue;
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/^"|"$/g, ""));
    }
    assert.equal(
      validateSignature("POST", "https://lms.example/pox", params, "secret-1"),
      true,
    );
  });

  it("signs against origin+pathname when the outcome URL carries a query string", () => {
    const header = buildOutcomesAuthHeader(
      "https://lms.example/pox?foo=bar",
      "key-1",
      "secret-1",
      "bodyhash==",
      1_788_000_000,
      "nonce-1",
    );
    const params: Record<string, string> = {};
    for (const part of header.slice("OAuth ".length).split(",")) {
      const [rawKey, rawValue] = part.split("=");
      if (!rawKey || rawValue === undefined) continue;
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.replace(/^"|"$/g, ""));
    }
    assert.equal(
      validateSignature("POST", "https://lms.example/pox", params, "secret-1"),
      true,
    );
    assert.equal(
      validateSignature("POST", "https://lms.example/pox?foo=bar", params, "secret-1"),
      false,
    );
  });
});
