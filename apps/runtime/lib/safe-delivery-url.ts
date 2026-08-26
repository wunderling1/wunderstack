import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guard for URLs the customer chooses and we fetch server-side.
 *
 * Ported from Qonvo's LTI Basic Outcomes guard (`src/lib/lti11/outcomes.ts`). Lives here, not in
 * the LTI adapter, because the webhook-delivery URL is the same class of input: a caller-supplied
 * address we POST to from inside the runtime. Private, loopback, link-local and CGNAT addresses
 * must not be reachable through it — including via DNS that resolves to one of those.
 *
 * Redirects are refused by the caller (`redirect: "error"`). This module only answers "may we even
 * open a connection to this URL?".
 */

export class UnsafeDeliveryUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeDeliveryUrlError";
  }
}

export type DnsLookup = (hostname: string) => Promise<readonly { address: string }[]>;

const defaultLookup: DnsLookup = async (hostname) => dnsLookup(hostname, { all: true });

/**
 * Is this a private / internal / loopback / link-local / CGNAT address? Unknown formats fail closed.
 */
export function isPrivateIp(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const candidate = mapped?.[1] ?? ip;

  const ipv4 = isIP(candidate);
  if (ipv4 === 4) {
    const [a, b] = candidate.split(".").map(Number);
    if (a === undefined || b === undefined) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (ipv4 === 6) {
    const lower = candidate.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80")) return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    return false;
  }

  return true;
}

/**
 * Only HTTPS, no credentials in the URL, and no resolved address in a private range.
 * `lookup` is injectable so the range checks can run without touching the network.
 */
export async function assertSafeDeliveryUrl(
  rawUrl: string,
  lookup: DnsLookup = defaultLookup,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeDeliveryUrlError("Delivery URL is not a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new UnsafeDeliveryUrlError("Delivery URL must use HTTPS.");
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new UnsafeDeliveryUrlError("Delivery URL must not contain credentials.");
  }

  const host = parsed.hostname;
  if (host === "") {
    throw new UnsafeDeliveryUrlError("Delivery URL has no host.");
  }

  if (host.toLowerCase() === "localhost") {
    throw new UnsafeDeliveryUrlError("Delivery URL resolves to a private address.");
  }

  if (isIP(host) !== 0) {
    if (isPrivateIp(host)) {
      throw new UnsafeDeliveryUrlError("Delivery URL resolves to a private address.");
    }
    return parsed;
  }

  const resolved = await lookup(host);
  if (resolved.length === 0) {
    throw new UnsafeDeliveryUrlError("Delivery URL host did not resolve.");
  }
  for (const { address } of resolved) {
    if (isPrivateIp(address)) {
      throw new UnsafeDeliveryUrlError("Delivery URL resolves to a private address.");
    }
  }
  return parsed;
}
