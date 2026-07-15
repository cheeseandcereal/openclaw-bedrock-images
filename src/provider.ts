// Image-generation provider: maps OpenClaw requests to Bedrock InvokeModel calls.
import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  sniffImageMimeType,
  type GeneratedImageAsset,
  type ImageGenerationOutputFormat,
  type ImageGenerationProvider,
  type ImageGenerationRequest,
} from "openclaw/plugin-sdk/image-generation";
import { isProviderApiKeyConfigured } from "openclaw/plugin-sdk/provider-auth";
import { resolveApiKeyForProvider } from "openclaw/plugin-sdk/provider-auth-runtime";
import {
  hasConfiguredSecretInput,
  resolveConfiguredSecretInputString,
} from "openclaw/plugin-sdk/secret-input-runtime";
import { createBedrockRuntimeClient, resolveClientRegion } from "./client.js";
import {
  API_KEY_CONFIG_PATH,
  readConfiguredProviderApiKey,
  readPluginConfig,
  type BedrockImagesPluginConfig,
} from "./config.js";
import {
  BUILT_IN_MODELS,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  FAMILY_SPECS,
  PROVIDER_ID,
  SUPPORTED_ASPECT_RATIOS,
  detectFamily,
  imageToImageKind,
  type SchemaFamily,
} from "./models.js";

const OUTPAINT_DIRECTIONS = ["left", "right", "up", "down"] as const;

function modelOptionsConfigPath(model: string, field: string): string {
  return `plugins.entries.${PROVIDER_ID}.config.models["${model}"].options.${field}`;
}

/** Builds the InvokeModel JSON body for a request. Exported for tests. */
export function buildRequestBody(params: {
  model: string;
  family: SchemaFamily;
  prompt: string;
  aspectRatio?: string;
  outputFormat?: ImageGenerationOutputFormat;
  /** Base64-encoded input images, in request order. */
  inputImages: readonly string[];
  /** Static per-model options from plugin config. */
  options?: Record<string, unknown>;
}): Record<string, unknown> {
  const spec = FAMILY_SPECS[params.family];
  const body: Record<string, unknown> = { ...params.options };
  const [firstImage, secondImage, ...extraImages] = params.inputImages;

  // Prompt
  const prompt = params.prompt.trim();
  if (spec.prompt === "required" && !prompt) {
    throw new Error(`${params.model} (${spec.label}) requires a prompt`);
  }
  if (spec.prompt !== "none" && prompt) {
    body.prompt = prompt;
  }

  // Input images
  if (spec.image === "required" && !firstImage) {
    throw new Error(
      `${params.model} (${spec.label}) requires an input image; pass it via the image parameter`,
    );
  }
  if (extraImages.length > 0) {
    throw new Error(`${params.model} (${spec.label}) supports at most 2 input images`);
  }
  if (secondImage && spec.secondImage === "none") {
    throw new Error(`${params.model} (${spec.label}) supports at most 1 input image`);
  }
  if (spec.secondImage === "required" && !secondImage) {
    throw new Error(
      `${params.model} (${spec.label}) requires 2 input images: images[0] is the image to restyle, images[1] is the style reference`,
    );
  }

  let imageToImage = false;
  if (firstImage) {
    if (params.family === "text-to-image") {
      const kind = imageToImageKind(params.model);
      if (kind === "none") {
        throw new Error(
          `${params.model} does not support input images; use stability.sd3-5-large-v1:0, stability.stable-image-ultra-v1:1, or a us.stability.* image service instead`,
        );
      }
      imageToImage = true;
      body.image = firstImage;
      if (kind === "mode") {
        body.mode = "image-to-image";
        if (body.strength === undefined) {
          body.strength = 0.5;
        }
      }
    } else {
      body[spec.imageField] = firstImage;
    }
  }
  if (secondImage && spec.secondImageField) {
    body[spec.secondImageField] = secondImage;
  }

  // Aspect ratio: only valid for text-to-image requests and the style-guide service.
  if (params.aspectRatio && spec.supportsAspectRatio && !imageToImage) {
    const aspectRatio = params.aspectRatio.trim();
    if (!(SUPPORTED_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)) {
      throw new Error(
        `${params.model} supports aspectRatio values: ${SUPPORTED_ASPECT_RATIOS.join(", ")}`,
      );
    }
    body.aspect_ratio = aspectRatio;
  }

  if (params.outputFormat) {
    body.output_format = params.outputFormat;
  }

  // Fields that can only come from static config (not expressible via the shared tool).
  for (const field of spec.requiredBodyFields ?? []) {
    if (body[field] === undefined) {
      throw new Error(
        `${params.model} (${spec.label}) requires "${field}"; set ${modelOptionsConfigPath(params.model, field)}`,
      );
    }
  }
  if (spec.requiresOutpaintDirection) {
    const hasDirection = OUTPAINT_DIRECTIONS.some(
      (direction) => typeof body[direction] === "number" && (body[direction] as number) > 0,
    );
    if (!hasDirection) {
      throw new Error(
        `${params.model} (${spec.label}) requires at least one outpaint direction; set ${modelOptionsConfigPath(params.model, "left/right/up/down")}`,
      );
    }
  }

  return body;
}

/** Parses a Stability InvokeModel response body. Exported for tests. */
export function parseInvokeResponse(
  payload: unknown,
  model: string,
): { base64Images: string[]; seeds?: unknown[] } {
  if (typeof payload !== "object" || payload === null) {
    throw new Error(`${model} returned a malformed response`);
  }
  const record = payload as Record<string, unknown>;
  const finishReasons = Array.isArray(record.finish_reasons) ? record.finish_reasons : [];
  const filterReasons = finishReasons.filter(
    (reason): reason is string => typeof reason === "string" && reason.trim() !== "",
  );
  const images = (Array.isArray(record.images) ? record.images : []).filter(
    (image): image is string => typeof image === "string" && image.trim() !== "",
  );
  if (images.length === 0) {
    if (filterReasons.length > 0) {
      throw new Error(`${model} request was filtered: ${filterReasons.join("; ")}`);
    }
    throw new Error(`${model} response contained no image data`);
  }
  const seeds = Array.isArray(record.seeds) ? record.seeds : undefined;
  return { base64Images: images, ...(seeds ? { seeds } : {}) };
}

function fallbackMimeTypeForFormat(format: ImageGenerationOutputFormat | undefined): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function describeInvokeError(error: unknown, model: string, region: string): Error {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  let hint = "";
  if (name === "AccessDeniedException" || name === "UnrecognizedClientException") {
    hint =
      " (check that your Bedrock API key or AWS credentials are valid and have access to this model in this region)";
  } else if (name === "ResourceNotFoundException" || name === "ValidationException") {
    hint =
      " (check that the model id is available in this region; Stability image services use inference-profile ids like us.stability.stable-image-inpaint-v1:0)";
  } else if (name === "ThrottlingException") {
    hint = " (request was throttled; retry later)";
  } else if (name === "TimeoutError" || name === "AbortError") {
    hint = " (request timed out; raise timeoutMs or agents.defaults.imageGenerationModel.timeoutMs)";
  }
  return new Error(`${PROVIDER_ID}: ${model} invoke failed in ${region}: ${message}${hint}`, {
    cause: error,
  });
}

/** Resolves the bearer API key per auth mode and source precedence. Exported for tests. */
export async function resolveBearerApiKey(
  req: ImageGenerationRequest,
  pluginCfg: BedrockImagesPluginConfig,
): Promise<string | undefined> {
  if ((pluginCfg.auth ?? "api-key") === "aws-sdk") {
    return undefined;
  }
  // 1. Explicit plugin config: a literal string, "${ENV_VAR}", or a SecretRef
  //    ({ source: "env" | "file" | "exec", ... }) resolved through OpenClaw's
  //    secret machinery (including secret broker plugins).
  if (hasConfiguredSecretInput(pluginCfg.apiKey)) {
    const resolved = await resolveConfiguredSecretInputString({
      config: req.cfg,
      env: process.env,
      value: pluginCfg.apiKey,
      path: API_KEY_CONFIG_PATH,
    });
    if (resolved.value?.trim()) {
      return resolved.value.trim();
    }
    // A configured-but-unresolved secret is a hard error; silently falling back
    // to other sources would mask broken secret wiring.
    throw new Error(
      `${PROVIDER_ID}: configured API key did not resolve. ${resolved.unresolvedRefReason ?? `${API_KEY_CONFIG_PATH} resolved to an empty value.`}`,
    );
  }
  // 2. Stored auth profiles (onboarding / `openclaw models auth login`); this
  //    can throw when nothing is configured.
  let profileKey: string | undefined;
  try {
    const auth = await resolveApiKeyForProvider({
      provider: PROVIDER_ID,
      cfg: req.cfg,
      ...(req.agentDir ? { agentDir: req.agentDir } : {}),
      ...(req.authStore ? { store: req.authStore } : {}),
    });
    profileKey = auth.apiKey?.trim() || undefined;
  } catch {
    // fall through to the standard AWS env var below
  }
  // 3. The standard AWS env var.
  const apiKey =
    profileKey ||
    process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() ||
    readConfiguredProviderApiKey(req.cfg);
  if (!apiKey) {
    throw new Error(
      `${PROVIDER_ID}: no Bedrock API key found. Set ${API_KEY_CONFIG_PATH} (string or SecretRef), set the AWS_BEARER_TOKEN_BEDROCK env var, or set plugins.entries.${PROVIDER_ID}.config.auth to "aws-sdk" to use the AWS credential chain.`,
    );
  }
  return apiKey;
}

export function buildBedrockImagesProvider(): ImageGenerationProvider {
  const editModelAspectRatioOverrides: Record<string, string[]> = {};
  for (const model of BUILT_IN_MODELS) {
    const family = detectFamily(model);
    if (family !== "text-to-image" && family !== "style-guide") {
      editModelAspectRatioOverrides[model] = [];
    }
  }

  return {
    id: PROVIDER_ID,
    label: "Bedrock Images (Stability AI)",
    defaultModel: DEFAULT_MODEL,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    models: [...BUILT_IN_MODELS],
    isConfigured: (ctx) => {
      const pluginCfg = readPluginConfig(ctx.cfg);
      if (pluginCfg.auth === "aws-sdk") {
        return true;
      }
      if (hasConfiguredSecretInput(pluginCfg.apiKey)) {
        return true;
      }
      if (process.env.AWS_BEARER_TOKEN_BEDROCK?.trim()) {
        return true;
      }
      if (readConfiguredProviderApiKey(ctx.cfg)) {
        return true;
      }
      return isProviderApiKeyConfigured({
        provider: PROVIDER_ID,
        ...(ctx.agentDir ? { agentDir: ctx.agentDir } : {}),
      });
    },
    capabilities: {
      generate: {
        maxCount: 1,
        supportsSize: false,
        supportsAspectRatio: true,
        supportsResolution: false,
      },
      edit: {
        enabled: true,
        maxCount: 1,
        maxInputImages: 1,
        maxInputImagesByModel: {
          "us.stability.stable-image-inpaint-v1:0": 2,
          "us.stability.stable-image-erase-object-v1:0": 2,
          "us.stability.stable-style-transfer-v1:0": 2,
        },
        supportsSize: false,
        supportsAspectRatio: true,
        supportsResolution: false,
      },
      geometry: {
        aspectRatios: [...SUPPORTED_ASPECT_RATIOS],
        aspectRatiosByModel: editModelAspectRatioOverrides,
      },
      output: {
        formats: ["png", "jpeg", "webp"],
      },
    },
    async generateImage(req) {
      const pluginCfg = readPluginConfig(req.cfg);
      const model = req.model?.trim() || pluginCfg.defaultModel || DEFAULT_MODEL;
      const modelCfg = pluginCfg.models?.[model];
      const family = modelCfg?.family ?? detectFamily(model);

      if ((req.count ?? 1) > 1) {
        throw new Error(`${PROVIDER_ID} generates one image per request`);
      }

      const body = buildRequestBody({
        model,
        family,
        prompt: req.prompt,
        ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}),
        ...(req.outputFormat ? { outputFormat: req.outputFormat } : {}),
        inputImages: (req.inputImages ?? []).map((image) => image.buffer.toString("base64")),
        ...(modelCfg?.options ? { options: modelCfg.options } : {}),
      });

      const apiKey = await resolveBearerApiKey(req, pluginCfg);
      const client = createBedrockRuntimeClient({
        ...(pluginCfg.region ? { region: pluginCfg.region } : {}),
        ...(apiKey ? { apiKey } : {}),
      });
      try {
        const region = await resolveClientRegion(client);
        const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        let payload: unknown;
        try {
          const response = await client.send(
            new InvokeModelCommand({
              modelId: model,
              contentType: "application/json",
              accept: "application/json",
              body: JSON.stringify(body),
            }),
            { abortSignal: AbortSignal.timeout(timeoutMs) },
          );
          payload = JSON.parse(new TextDecoder().decode(response.body));
        } catch (error) {
          throw describeInvokeError(error, model, region);
        }

        const parsed = parseInvokeResponse(payload, model);
        const fallbackMimeType = fallbackMimeTypeForFormat(req.outputFormat);
        const images: GeneratedImageAsset[] = parsed.base64Images.map((base64, index) => {
          const buffer = Buffer.from(base64, "base64");
          const detected = sniffImageMimeType(buffer, fallbackMimeType);
          return {
            buffer,
            mimeType: detected.mimeType,
            fileName: `image-${index + 1}.${detected.extension}`,
          };
        });
        return {
          images,
          model,
          ...(parsed.seeds ? { metadata: { seeds: parsed.seeds } } : {}),
        };
      } finally {
        client.destroy();
      }
    },
  };
}
