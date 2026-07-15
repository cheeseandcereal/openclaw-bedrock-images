// Bedrock runtime client factory: Bedrock API key (bearer) or AWS SDK credential chain.
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";

export function createBedrockRuntimeClient(params: {
  region?: string;
  /** Bedrock API key. When set, requests use bearer-token auth instead of SigV4. */
  apiKey?: string;
}): BedrockRuntimeClient {
  const base = params.region ? { region: params.region } : {};
  if (params.apiKey) {
    return new BedrockRuntimeClient({
      ...base,
      token: { token: params.apiKey },
      authSchemePreference: ["httpBearerAuth"],
    });
  }
  return new BedrockRuntimeClient(base);
}

/**
 * Resolves the effective region for a client, throwing a config-pointing error
 * when the AWS SDK region chain has nothing to offer.
 */
export async function resolveClientRegion(client: BedrockRuntimeClient): Promise<string> {
  try {
    const region = await client.config.region();
    if (typeof region === "string" && region.trim()) {
      return region;
    }
  } catch {
    // fall through to the config-pointing error below
  }
  throw new Error(
    'AWS region is not configured. Set plugins.entries.bedrock-images.config.region (or AWS_REGION / an AWS config profile). Stability text-to-image models are commonly in us-west-2; the us.stability.* image services use us-east-1/us-west-2 inference profiles.',
  );
}
