/**
 * Headers for playground calls that proxy to the runtime. When the fondsinstance has embed auth
 * configured (agent instance public key), browser requests must carry the public tenant-key — same
 * header the embed widget uses (`x-wunderstack-key`). The key is a public identifier (see
 * DECISION-embed-api.md), so exposing it via NEXT_PUBLIC_* matches the embed snippet model.
 */
import type { PlaygroundAgent } from "./runtime-config";

export function runtimeApiHeaders(agent?: PlaygroundAgent, extra?: HeadersInit): HeadersInit {
  const key =
    agent === "arbo"
      ? process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY_ARBO?.trim()
      : process.env.NEXT_PUBLIC_WUNDERSTACK_TENANT_KEY?.trim();
  return {
    "content-type": "application/json",
    ...(key ? { "x-wunderstack-key": key } : {}),
    ...extra,
  };
}
