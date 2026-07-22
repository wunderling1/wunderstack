import { getTenantId } from "@wunderstack/tenant";

// Minimal health page. The runtime's real surface is under /api/*; this exists so operators can
// eyeball that the instance is up and which tenant it is pinned to.
export default function HealthPage() {
  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: "2rem" }}>
      <h1>Wunderstack runtime</h1>
      <p>tenant: {getTenantId()}</p>
      <p>API surface: /api/chat, /api/passage, /api/feedback, /api/webhook</p>
    </main>
  );
}
