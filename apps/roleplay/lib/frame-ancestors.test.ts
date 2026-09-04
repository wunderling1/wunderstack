import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAllowedOrigins, roleplayFrameAncestors } from "./frame-ancestors";

describe("parseAllowedOrigins", () => {
  it("accepts a comma-separated list of http(s) origins", () => {
    assert.deepEqual(
      parseAllowedOrigins("https://lms.fonds.nl, http://localhost:8080"),
      ["https://lms.fonds.nl", "http://localhost:8080"],
    );
  });

  it("rejects a wildcard — any site wrapping the learner UI is the failure this list exists to prevent", () => {
    assert.deepEqual(parseAllowedOrigins("*"), []);
    assert.deepEqual(parseAllowedOrigins("https://*"), []);
  });

  it("rejects a URL with a path, because frame-ancestors takes origins not paths", () => {
    assert.deepEqual(parseAllowedOrigins("https://lms.fonds.nl/lti"), []);
    assert.deepEqual(parseAllowedOrigins("https://lms.fonds.nl/"), []);
  });

  it("rejects javascript: and data: schemes", () => {
    assert.deepEqual(parseAllowedOrigins("javascript:alert(1)"), []);
    assert.deepEqual(parseAllowedOrigins("data:text/html,x"), []);
  });

  it("deduplicates and skips empty entries", () => {
    assert.deepEqual(
      parseAllowedOrigins("https://a.nl,,https://a.nl, https://b.nl"),
      ["https://a.nl", "https://b.nl"],
    );
  });
});

describe("roleplayFrameAncestors", () => {
  it("falls back to 'self' when nothing valid is configured", () => {
    assert.equal(roleplayFrameAncestors(undefined), "'self'");
    assert.equal(roleplayFrameAncestors(""), "'self'");
    assert.equal(roleplayFrameAncestors("not-a-url"), "'self'");
  });

  it("joins valid origins with a space, the CSP list syntax", () => {
    assert.equal(
      roleplayFrameAncestors("https://a.nl,https://b.nl"),
      "https://a.nl https://b.nl",
    );
  });
});
