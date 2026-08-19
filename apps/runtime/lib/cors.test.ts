import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { corsHeaders } from "./cors.js";

describe("corsHeaders", () => {
  it("allows the local marketing origin in development even when the tenant allowlist is empty", () => {
    const headers = corsHeaders(
      new Request("http://localhost:3000/api/config", {
        headers: { origin: "http://localhost:3003" },
      }),
      [],
      "development",
    );
    assert.equal(headers["access-control-allow-origin"], "http://localhost:3003");
  });

  it("does not allow the marketing origin in production unless it is on the tenant allowlist", () => {
    const denied = corsHeaders(
      new Request("http://localhost:3000/api/config", {
        headers: { origin: "http://localhost:3003" },
      }),
      [],
      "production",
    );
    assert.equal(denied["access-control-allow-origin"], undefined);

    const allowed = corsHeaders(
      new Request("http://localhost:3000/api/config", {
        headers: { origin: "https://wunderling.nl" },
      }),
      ["https://wunderling.nl"],
      "production",
    );
    assert.equal(allowed["access-control-allow-origin"], "https://wunderling.nl");
  });
});
