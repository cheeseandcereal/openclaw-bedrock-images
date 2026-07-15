// Stability AI on Amazon Bedrock: schema families, model detection, and built-in model list.

export const PROVIDER_ID = "bedrock-images";

export const DEFAULT_MODEL = "stability.sd3-5-large-v1:0";

/** Default provider operation timeout (upscale-to-4K services can be slow). */
export const DEFAULT_TIMEOUT_MS = 180_000;

/** Aspect ratios accepted by Stability text-to-image and style-guide requests. */
export const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "21:9",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "9:16",
  "9:21",
] as const;

/** Request-body schema families for Stability AI models on Amazon Bedrock. */
export type SchemaFamily =
  | "text-to-image"
  | "inpaint"
  | "erase"
  | "remove-background"
  | "search-replace"
  | "search-recolor"
  | "outpaint"
  | "creative-upscale"
  | "conservative-upscale"
  | "fast-upscale"
  | "control-sketch"
  | "control-structure"
  | "style-guide"
  | "style-transfer";

export const SCHEMA_FAMILIES: readonly SchemaFamily[] = [
  "text-to-image",
  "inpaint",
  "erase",
  "remove-background",
  "search-replace",
  "search-recolor",
  "outpaint",
  "creative-upscale",
  "conservative-upscale",
  "fast-upscale",
  "control-sketch",
  "control-structure",
  "style-guide",
  "style-transfer",
];

type Requirement = "required" | "optional" | "none";

export type FamilySpec = {
  label: string;
  /** Whether the request body accepts/requires a prompt. */
  prompt: Requirement;
  /** Whether the request requires an input image (first `images` entry). */
  image: Requirement;
  /** Body field name for the first input image. */
  imageField: string;
  /** Whether a second input image is accepted (mask / style image). */
  secondImage: Requirement;
  /** Body field name for the second input image. */
  secondImageField?: "mask" | "style_image";
  /** Whether aspect_ratio is a valid body field. */
  supportsAspectRatio: boolean;
  /** Fields that must be present in the merged body (typically via config options). */
  requiredBodyFields?: readonly string[];
  /** Outpaint: at least one of left/right/up/down must be a positive number. */
  requiresOutpaintDirection?: boolean;
};

export const FAMILY_SPECS: Record<SchemaFamily, FamilySpec> = {
  "text-to-image": {
    label: "text to image",
    prompt: "required",
    image: "optional",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: true,
  },
  inpaint: {
    label: "inpaint",
    prompt: "required",
    image: "required",
    imageField: "image",
    secondImage: "optional",
    secondImageField: "mask",
    supportsAspectRatio: false,
  },
  erase: {
    label: "erase object",
    prompt: "none",
    image: "required",
    imageField: "image",
    secondImage: "optional",
    secondImageField: "mask",
    supportsAspectRatio: false,
  },
  "remove-background": {
    label: "remove background",
    prompt: "none",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
  },
  "search-replace": {
    label: "search and replace",
    prompt: "required",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
    requiredBodyFields: ["search_prompt"],
  },
  "search-recolor": {
    label: "search and recolor",
    prompt: "required",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
    requiredBodyFields: ["select_prompt"],
  },
  outpaint: {
    label: "outpaint",
    prompt: "optional",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
    requiresOutpaintDirection: true,
  },
  "creative-upscale": {
    label: "creative upscale",
    prompt: "required",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
  },
  "conservative-upscale": {
    label: "conservative upscale",
    prompt: "required",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
  },
  "fast-upscale": {
    label: "fast upscale",
    prompt: "none",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
  },
  "control-sketch": {
    label: "control sketch",
    prompt: "required",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
  },
  "control-structure": {
    label: "control structure",
    prompt: "required",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: false,
  },
  "style-guide": {
    label: "style guide",
    prompt: "required",
    image: "required",
    imageField: "image",
    secondImage: "none",
    supportsAspectRatio: true,
  },
  "style-transfer": {
    label: "style transfer",
    prompt: "optional",
    image: "required",
    imageField: "init_image",
    secondImage: "required",
    secondImageField: "style_image",
    supportsAspectRatio: false,
  },
};

/**
 * Returns the model id portion after the `stability.` vendor prefix, ignoring
 * any regional inference-profile prefix (`us.`, `eu.`, `apac.`, ...).
 */
export function modelSlug(modelId: string): string {
  const marker = "stability.";
  const index = modelId.indexOf(marker);
  return index >= 0 ? modelId.slice(index + marker.length) : modelId;
}

/** Ordered service-slug patterns; version suffixes and region prefixes are ignored. */
const FAMILY_PATTERNS: readonly (readonly [string, SchemaFamily])[] = [
  ["stable-image-inpaint", "inpaint"],
  ["stable-image-erase", "erase"],
  ["stable-image-remove-background", "remove-background"],
  ["stable-image-search-replace", "search-replace"],
  ["stable-image-search-recolor", "search-recolor"],
  ["stable-outpaint", "outpaint"],
  ["stable-creative-upscale", "creative-upscale"],
  ["stable-conservative-upscale", "conservative-upscale"],
  ["stable-fast-upscale", "fast-upscale"],
  ["stable-image-control-sketch", "control-sketch"],
  ["stable-image-control-structure", "control-structure"],
  ["stable-image-style-guide", "style-guide"],
  ["stable-style-transfer", "style-transfer"],
];

/** Detects the request-schema family for a model id. Unknown ids fall back to text-to-image. */
export function detectFamily(modelId: string): SchemaFamily {
  const slug = modelSlug(modelId);
  for (const [pattern, family] of FAMILY_PATTERNS) {
    if (slug.includes(pattern)) {
      return family;
    }
  }
  return "text-to-image";
}

/**
 * How a text-to-image family model accepts an input image:
 * - "mode": SD3-style `mode: "image-to-image"` + `image` + `strength`
 * - "plain": Ultra-style `image` (+ optional `strength`) without a mode field
 * - "none": text-to-image only (Stable Image Core)
 */
export function imageToImageKind(modelId: string): "mode" | "plain" | "none" {
  const slug = modelSlug(modelId);
  if (slug.includes("stable-image-core")) {
    return "none";
  }
  if (slug.includes("stable-image-ultra")) {
    return "plain";
  }
  // sd3* and unknown models use the SD3-style contract.
  return "mode";
}

/** Known model ids advertised by default (verified against the AWS Bedrock docs). */
export const BUILT_IN_MODELS: readonly string[] = [
  "stability.sd3-5-large-v1:0",
  "stability.stable-image-core-v1:1",
  "stability.stable-image-ultra-v1:1",
  "us.stability.stable-image-inpaint-v1:0",
  "us.stability.stable-image-erase-object-v1:0",
  "us.stability.stable-image-remove-background-v1:0",
  "us.stability.stable-image-search-replace-v1:0",
  "us.stability.stable-image-search-recolor-v1:0",
  "us.stability.stable-outpaint-v1:0",
  "us.stability.stable-creative-upscale-v1:0",
  "us.stability.stable-conservative-upscale-v1:0",
  "us.stability.stable-fast-upscale-v1:0",
  "us.stability.stable-image-control-sketch-v1:0",
  "us.stability.stable-image-control-structure-v1:0",
  "us.stability.stable-image-style-guide-v1:0",
  "us.stability.stable-style-transfer-v1:0",
];
