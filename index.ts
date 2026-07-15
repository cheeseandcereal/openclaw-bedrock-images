// Plugin entrypoint: Stability AI image generation on Amazon Bedrock.
import {
  definePluginEntry,
  type OpenClawPluginDefinition,
} from "openclaw/plugin-sdk/plugin-entry";
import { createBedrockImagesAuthProvider } from "./src/auth-provider.js";
import { PROVIDER_ID } from "./src/models.js";
import { buildBedrockImagesProvider } from "./src/provider.js";

const plugin: OpenClawPluginDefinition = definePluginEntry({
  id: PROVIDER_ID,
  name: "Bedrock Images",
  description: "Stability AI image generation and editing on Amazon Bedrock via InvokeModel",
  register(api) {
    api.registerProvider(createBedrockImagesAuthProvider());
    api.registerImageGenerationProvider(buildBedrockImagesProvider());
  },
});

export default plugin;
