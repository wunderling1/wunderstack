import { Agent, setGlobalDispatcher } from "undici";

let initialized = false;

/**
 * Tune undici's global HTTP dispatcher for long-lived connections to EU providers
 * (Scaleway embeddings/rerank, Mistral chat). Node's fetch already pools per-origin,
 * but the default 4s idle timeout closes sockets between demo requests — each new
 * question then pays a fresh TLS handshake (~300–500ms per hop).
 */
export function ensureHttpKeepAlive(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  setGlobalDispatcher(
    new Agent({
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 600_000,
    }),
  );
}
