// Plugin config reading for plugins.entries.bedrock-images.config.
import { PROVIDER_ID, SCHEMA_FAMILIES, type SchemaFamily } from "./models.js";

export type BedrockImagesModelConfig = {
  /** Override request-schema family auto-detection. */
  family?: SchemaFamily;
  /** Static fields merged into the InvokeModel request body. */
  options?: Record<string, unknown>;
};

export type BedrockImagesPluginConfig = {
  /** AWS region for the bedrock-runtime endpoint. */
  region?: string;
  /** Auth mode: "api-key" (default, Bedrock API key bearer token) or "aws-sdk" (credential chain). */
  auth?: "api-key" | "aws-sdk";
  /** Default model id when the request does not specify one. */
  defaultModel?: string;
  /** Per-model settings keyed by Bedrock model id. */
  models?: Record<string, BedrockImagesModelConfig>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseModelConfig(value: unknown): BedrockImagesModelConfig {
  if (!isRecord(value)) {
    return {};
  }
  const family = optionalString(value.family);
  return {
    ...(family && (SCHEMA_FAMILIES as readonly string[]).includes(family)
      ? { family: family as SchemaFamily }
      : {}),
    ...(isRecord(value.options) ? { options: value.options } : {}),
  };
}

/** Reads and normalizes this plugin's config from the full OpenClaw config object. */
export function readPluginConfig(cfg: unknown): BedrockImagesPluginConfig {
  if (!isRecord(cfg)) {
    return {};
  }
  const plugins = isRecord(cfg.plugins) ? cfg.plugins : undefined;
  const entries = plugins && isRecord(plugins.entries) ? plugins.entries : undefined;
  const entry = entries && isRecord(entries[PROVIDER_ID]) ? entries[PROVIDER_ID] : undefined;
  const raw = entry && isRecord(entry.config) ? entry.config : undefined;
  if (!raw) {
    return {};
  }
  const auth = optionalString(raw.auth);
  const region = optionalString(raw.region);
  const defaultModel = optionalString(raw.defaultModel);
  const models: Record<string, BedrockImagesModelConfig> = {};
  if (isRecord(raw.models)) {
    for (const [modelId, modelCfg] of Object.entries(raw.models)) {
      models[modelId] = parseModelConfig(modelCfg);
    }
  }
  return {
    ...(region ? { region } : {}),
    ...(auth === "api-key" || auth === "aws-sdk" ? { auth } : {}),
    ...(defaultModel ? { defaultModel } : {}),
    ...(Object.keys(models).length > 0 ? { models } : {}),
  };
}

/** Reads models.providers.bedrock-images.apiKey from config, if present. */
export function readConfiguredProviderApiKey(cfg: unknown): string | undefined {
  if (!isRecord(cfg)) {
    return undefined;
  }
  const models = isRecord(cfg.models) ? cfg.models : undefined;
  const providers = models && isRecord(models.providers) ? models.providers : undefined;
  const provider =
    providers && isRecord(providers[PROVIDER_ID]) ? providers[PROVIDER_ID] : undefined;
  return provider ? optionalString(provider.apiKey) : undefined;
}
