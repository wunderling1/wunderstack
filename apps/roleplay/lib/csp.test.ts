import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRoleplayCsp } from "./csp";

describe("buildRoleplayCsp", () => {
  const csp = buildRoleplayCsp({
    nonce: "abc123",
    frameAncestors: "https://lms.example.nl",
    isDev: false,
  });

  it("locks scripts to a nonce and strict-dynamic, without unsafe-inline", () => {
    assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  });

  it("keeps API calls same-origin — the runtime rewrite must not become a second connect-src", () => {
    assert.match(csp, /connect-src 'self'/);
    assert.doesNotMatch(csp, /connect-src[^;]*http/);
  });

  it("puts the LMS origin in frame-ancestors, which is what makes the iframe possible", () => {
    assert.match(csp, /frame-ancestors https:\/\/lms\.example\.nl/);
  });

  it("pins base-uri so an injected <base> cannot retarget the token-session form of fase 8", () => {
    assert.match(csp, /base-uri 'self'/);
  });

  it("allows unsafe-eval only in development, for React Fast Refresh", () => {
    const dev = buildRoleplayCsp({ nonce: "n", frameAncestors: "'self'", isDev: true });
    assert.match(dev, /'unsafe-eval'/);
    assert.doesNotMatch(csp, /'unsafe-eval'/);
  });
});
