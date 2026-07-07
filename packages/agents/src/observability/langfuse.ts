import { LangfuseExporter } from "@mastra/langfuse";
import { Observability } from "@mastra/observability";
import { env } from "@wunderstack/shared";

/**
 * Langfuse EU Cloud tracing for the CAO-agent (tracing is mandatory — see 500-agents.mdc).
 *
 * Wiring this into the Mastra instance makes every agent run and model generation an exported
 * trace; retrieval evidence (chunk ids + scores) is attached as trace metadata by the agent. When
 * the Langfuse keys are unset (e.g. a local boot without credentials) we return `undefined` and the
 * agent runs untraced, matching how the rest of the codebase treats optional credentials.
 */

const SERVICE_NAME = "wunderstack-cao-agent";

export function buildLangfuseObservability(): Observability | undefined {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    return undefined;
  }

  return new Observability({
    configs: {
      langfuse: {
        serviceName: SERVICE_NAME,
        exporters: [
          new LangfuseExporter({
            publicKey: env.LANGFUSE_PUBLIC_KEY,
            secretKey: env.LANGFUSE_SECRET_KEY,
            ...(env.LANGFUSE_BASE_URL === undefined ? {} : { baseUrl: env.LANGFUSE_BASE_URL }),
            // Flush eagerly outside production so traces show up immediately in the demo.
            realtime: env.NODE_ENV !== "production",
          }),
        ],
      },
    },
  });
}
