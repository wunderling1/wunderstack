import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ARBO_KEY_MISSING_MESSAGE, arboSurfaceError, readArboTenantKey } from "./public-env.js";

describe("arbo playground key (fail closed)", () => {
  it("reports a visible error when NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO is missing", () => {
    const previous = process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO;
    delete process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO;
    try {
      assert.equal(readArboTenantKey(), undefined);
      assert.equal(arboSurfaceError(), ARBO_KEY_MISSING_MESSAGE);
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO;
      } else {
        process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO = previous;
      }
    }
  });

  it("is silent when the arbo key is set", () => {
    const previous = process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO;
    process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO = "pk_test_arbo";
    try {
      assert.equal(readArboTenantKey(), "pk_test_arbo");
      assert.equal(arboSurfaceError(), null);
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO;
      } else {
        process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO = previous;
      }
    }
  });
});
