import { listModelPricing, type ModelPriceEntry } from "@wunderstack/ai";
import { env } from "@wunderstack/shared";
import { z } from "zod";

/**
 * Sync our model list prices into Langfuse so that traces show accurate cost.
 *
 * Why this exists: Mastra exports token usage on every generation, but neither Mastra nor the
 * Langfuse exporter attaches a cost. Langfuse computes cost itself by matching the generation's
 * model name against a model-price definition in the project. Without a matching definition the
 * cost column stays $0.00. This makes @wunderstack/ai's price table the single source of truth
 * and pushes it into Langfuse over the public REST API (no extra SDK dependency, matching the
 * thin-fetch seams we use for Mistral and Scaleway).
 *
 * Run it once after changing prices (or pointing at a fresh Langfuse project); it is idempotent.
 * Cost is applied at ingestion time, so it affects traces created after the sync, not past ones.
 */

const DEFAULT_LANGFUSE_BASE_URL = "https://cloud.langfuse.com";

/** Langfuse stores prices as USD per single unit; our table is USD per 1M tokens. */
const TOKENS_PER_MILLION = 1_000_000;

/** A Langfuse model-price definition as we send it on create. */
interface ModelDefinition {
  modelName: string;
  matchPattern: string;
  unit: "TOKENS";
  inputPrice: number;
  outputPrice: number;
}

/** Existing definitions can differ from ours by rounding; treat tiny deltas as equal. */
const PRICE_EPSILON = 1e-12;

const listedModelSchema = z.object({
  modelName: z.string(),
  matchPattern: z.string(),
  isLangfuseManaged: z.boolean(),
  inputPrice: z.number().nullable(),
  outputPrice: z.number().nullable(),
});

const paginatedModelsSchema = z.object({
  data: z.array(listedModelSchema),
  meta: z.object({
    page: z.number(),
    totalPages: z.number(),
  }),
});

type ListedModel = z.infer<typeof listedModelSchema>;

/** Exact, case-insensitive match on the model name Mastra reports (e.g. `mistral-large-latest`). */
function exactMatchPattern(model: string): string {
  return `(?i)^${model.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

function toModelDefinition(entry: ModelPriceEntry): ModelDefinition {
  return {
    modelName: entry.model,
    matchPattern: exactMatchPattern(entry.model),
    unit: "TOKENS",
    inputPrice: entry.pricing.inputPerMTok / TOKENS_PER_MILLION,
    outputPrice: entry.pricing.outputPerMTok / TOKENS_PER_MILLION,
  };
}

/** The model-price definitions this project expects Langfuse to know about. */
export function buildModelDefinitions(): ModelDefinition[] {
  return listModelPricing().map(toModelDefinition);
}

function pricesMatch(a: number, b: number | null): boolean {
  return b !== null && Math.abs(a - b) <= PRICE_EPSILON;
}

function isUpToDate(target: ModelDefinition, existing: ListedModel[]): boolean {
  return existing.some(
    (model) =>
      !model.isLangfuseManaged &&
      model.matchPattern === target.matchPattern &&
      pricesMatch(target.inputPrice, model.inputPrice) &&
      pricesMatch(target.outputPrice, model.outputPrice),
  );
}

interface LangfuseCredentials {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

function resolveCredentials(): LangfuseCredentials {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    throw new Error(
      "LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set to sync model prices (see .env.example).",
    );
  }
  const baseUrl = (env.LANGFUSE_BASE_URL ?? DEFAULT_LANGFUSE_BASE_URL).replace(/\/+$/, "");
  return { publicKey: env.LANGFUSE_PUBLIC_KEY, secretKey: env.LANGFUSE_SECRET_KEY, baseUrl };
}

function authHeader(credentials: LangfuseCredentials): string {
  const token = Buffer.from(`${credentials.publicKey}:${credentials.secretKey}`).toString("base64");
  return `Basic ${token}`;
}

async function listExistingModels(credentials: LangfuseCredentials): Promise<ListedModel[]> {
  const models: ListedModel[] = [];
  for (let page = 1; ; page += 1) {
    const url = `${credentials.baseUrl}/api/public/models?page=${String(page)}&limit=100`;
    const response = await fetch(url, {
      headers: { Authorization: authHeader(credentials) },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Langfuse model list failed (${String(response.status)}): ${detail}`);
    }
    const parsed = paginatedModelsSchema.parse(await response.json());
    models.push(...parsed.data);
    if (page >= parsed.meta.totalPages) {
      return models;
    }
  }
}

async function createModel(
  credentials: LangfuseCredentials,
  definition: ModelDefinition,
): Promise<void> {
  const response = await fetch(`${credentials.baseUrl}/api/public/models`, {
    method: "POST",
    headers: {
      Authorization: authHeader(credentials),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(definition),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Langfuse model create for "${definition.modelName}" failed (${String(response.status)}): ${detail}`,
    );
  }
}

export interface SyncResult {
  created: string[];
  unchanged: string[];
}

/** Push our model-price table into Langfuse, creating only the definitions that are missing. */
export async function syncLangfuseModelPrices(): Promise<SyncResult> {
  const credentials = resolveCredentials();
  const targets = buildModelDefinitions();
  const existing = await listExistingModels(credentials);

  const created: string[] = [];
  const unchanged: string[] = [];
  for (const target of targets) {
    if (isUpToDate(target, existing)) {
      unchanged.push(target.modelName);
      continue;
    }
    await createModel(credentials, target);
    created.push(target.modelName);
  }
  return { created, unchanged };
}
