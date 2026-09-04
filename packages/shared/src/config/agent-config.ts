import { z } from "zod";

import { starterCategorySchema } from "../contracts/tenant-config";

/**
 * Per-fund, per-agent tuning knobs stored in `agent_config.config` jsonb.
 * Prompts and refusal sentences stay in code — this holds tuning knobs only.
 */
export const agentConfigDataSchema = z
  .object({
    minScore: z.number().min(0).max(1).optional(),
    corpusVersion: z.string().min(1).optional(),
    validFrom: z.string().min(1).optional(),
    starterCategories: z.array(starterCategorySchema).min(1).max(8).optional(),
    /** Dutch labels for retrieval progress phases (searching / retrieved / generating). */
    statusLabels: z
      .object({
        searching: z.string().min(1).max(80),
        retrieved: z.string().min(1).max(80),
        generating: z.string().min(1).max(80),
      })
      .strict()
      .optional(),
  })
  .strict();

export type AgentConfigData = z.infer<typeof agentConfigDataSchema>;
