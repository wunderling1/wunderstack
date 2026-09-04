import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertSafeDeliveryUrl, isPrivateIp, UnsafeDeliveryUrlError } from "./safe-delivery-url";

describe("isPrivateIp", () => {
  it("rejects the ranges an SSRF via a customer URL would actually use", () => {
    assert.equal(isPrivateIp("10.0.0.1"), true);
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("0.0.0.0"), true);
    assert.equal(isPrivateIp("169.254.169.254"), true);
    assert.equal(isPrivateIp("172.16.0.1"), true);
    assert.equal(isPrivateIp("172.31.255.255"), true);
    assert.equal(isPrivateIp("192.168.1.1"), true);
    assert.equal(isPrivateIp("100.64.0.1"), true);
    assert.equal(isPrivateIp("::1"), true);
    assert.equal(isPrivateIp("::ffff:127.0.0.1"), true);
    assert.equal(isPrivateIp("fe80::1"), true);
    assert.equal(isPrivateIp("fd12:3456::1"), true);
  });

  it("allows a public address, including the start of ranges that look adjacent", () => {
    assert.equal(isPrivateIp("1.1.1.1"), false);
    assert.equal(isPrivateIp("172.15.0.1"), false);
    assert.equal(isPrivateIp("172.32.0.1"), false);
    assert.equal(isPrivateIp("100.63.255.255"), false);
    assert.equal(isPrivateIp("8.8.8.8"), false);
    assert.equal(isPrivateIp("2001:4860:4860::8888"), false);
  });

  it("fails closed on an unparseable string", () => {
    assert.equal(isPrivateIp("not-an-ip"), true);
  });
});

describe("assertSafeDeliveryUrl", () => {
  const publicLookup = async () => [{ address: "93.184.216.34" }];
  const privateLookup = async () => [{ address: "10.0.0.4" }];

  it("requires HTTPS without credentials", async () => {
    await assert.rejects(
      () => assertSafeDeliveryUrl("http://example.com/hook", publicLookup),
      UnsafeDeliveryUrlError,
    );
    await assert.rejects(
      () => assertSafeDeliveryUrl("https://user:pass@example.com/hook", publicLookup),
      UnsafeDeliveryUrlError,
    );
  });

  it("rejects localhost and IP-literals in private ranges without asking DNS", async () => {
    await assert.rejects(
      () => assertSafeDeliveryUrl("https://localhost/hook", publicLookup),
      UnsafeDeliveryUrlError,
    );
    await assert.rejects(
      () => assertSafeDeliveryUrl("https://192.168.0.10/hook", publicLookup),
      UnsafeDeliveryUrlError,
    );
    await assert.rejects(
      () => assertSafeDeliveryUrl("https://169.254.169.254/latest/meta-data", publicLookup),
      UnsafeDeliveryUrlError,
    );
  });

  it("rejects a public hostname that resolves to a private address", async () => {
    await assert.rejects(
      () => assertSafeDeliveryUrl("https://evil.example/hook", privateLookup),
      UnsafeDeliveryUrlError,
    );
  });

  it("accepts HTTPS to a hostname that resolves only to public addresses", async () => {
    const url = await assertSafeDeliveryUrl("https://fonds.example/hook", publicLookup);
    assert.equal(url.hostname, "fonds.example");
  });

  it("accepts a public IP literal", async () => {
    const url = await assertSafeDeliveryUrl("https://93.184.216.34/hook", publicLookup);
    assert.equal(url.hostname, "93.184.216.34");
  });
});
