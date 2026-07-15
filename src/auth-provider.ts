// Thin auth-only provider registration so OpenClaw can resolve and onboard the API key.
import { createProviderApiKeyAuthMethod } from "openclaw/plugin-sdk/provider-auth-api-key";
import type { ProviderPlugin } from "openclaw/plugin-sdk/provider-model-shared";
import { DEFAULT_MODEL, PROVIDER_ID } from "./models.js";

export function createBedrockImagesAuthProvider(): ProviderPlugin {
  return {
    id: PROVIDER_ID,
    label: "Bedrock Images",
    envVars: ["AWS_BEARER_TOKEN_BEDROCK"],
    auth: [
      createProviderApiKeyAuthMethod({
        providerId: PROVIDER_ID,
        methodId: "api-key",
        label: "Amazon Bedrock API key",
        hint: "Bedrock API key (bearer token) for image generation",
        optionKey: "bedrockImagesApiKey",
        flagName: "--bedrock-images-api-key",
        envVar: "AWS_BEARER_TOKEN_BEDROCK",
        promptMessage: "Enter your Amazon Bedrock API key",
        defaultModel: `${PROVIDER_ID}/${DEFAULT_MODEL}`,
        wizard: {
          choiceId: "bedrock-images-api-key",
          choiceLabel: "Amazon Bedrock API key",
          choiceHint: "Image generation on Amazon Bedrock",
          groupId: PROVIDER_ID,
          groupLabel: "Bedrock Images",
          groupHint: "Image generation on Amazon Bedrock",
          onboardingScopes: ["image-generation"],
        },
      }),
    ],
  };
}
