/**
 * Headers for playground calls that proxy to the runtime. When the fondsinstance has embed auth
 * configured (tenant_config.publicKey), browser requests must carry the public tenant-key — same
 * header the embed widget uses (`x-wunderstack-key`). The key is a public identifier (see
 * DECISION-embed-api.md), so exposing it via NEXT_PUBLIC_* matches the embed snippet model.
 */
export function runtimeApiHeaders(extra?: HeadersInit): HeadersInit {
  const key = process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY?.trim();
  return {
    "content-type": "application/json",
    ...(key ? { "x-wunderstack-key": key } : {}),
    ...extra,
  };
}
