import { describe, expect, it } from "vitest";
import { BUILT_IN_MODELS, detectFamily, imageToImageKind, modelSlug } from "./models.js";

describe("modelSlug", () => {
  it("strips the vendor prefix", () => {
    expect(modelSlug("stability.sd3-5-large-v1:0")).toBe("sd3-5-large-v1:0");
  });
  it("strips regional inference-profile prefixes", () => {
    expect(modelSlug("us.stability.stable-image-inpaint-v1:0")).toBe("stable-image-inpaint-v1:0");
    expect(modelSlug("eu.stability.stable-image-ultra-v1:1")).toBe("stable-image-ultra-v1:1");
  });
  it("passes through non-stability ids", () => {
    expect(modelSlug("some-model")).toBe("some-model");
  });
});

describe("detectFamily", () => {
  it.each([
    ["stability.sd3-5-large-v1:0", "text-to-image"],
    ["stability.stable-image-core-v1:1", "text-to-image"],
    ["stability.stable-image-ultra-v1:1", "text-to-image"],
    ["us.stability.stable-image-inpaint-v1:0", "inpaint"],
    ["us.stability.stable-image-erase-object-v1:0", "erase"],
    ["us.stability.stable-image-remove-background-v1:0", "remove-background"],
    ["us.stability.stable-image-search-replace-v1:0", "search-replace"],
    ["us.stability.stable-image-search-recolor-v1:0", "search-recolor"],
    ["us.stability.stable-outpaint-v1:0", "outpaint"],
    ["us.stability.stable-creative-upscale-v1:0", "creative-upscale"],
    ["us.stability.stable-conservative-upscale-v1:0", "conservative-upscale"],
    ["us.stability.stable-fast-upscale-v1:0", "fast-upscale"],
    ["us.stability.stable-image-control-sketch-v1:0", "control-sketch"],
    ["us.stability.stable-image-control-structure-v1:0", "control-structure"],
    ["us.stability.stable-image-style-guide-v1:0", "style-guide"],
    ["us.stability.stable-style-transfer-v1:0", "style-transfer"],
  ] as const)("%s -> %s", (modelId, family) => {
    expect(detectFamily(modelId)).toBe(family);
  });

  it("handles future versions and other region prefixes", () => {
    expect(detectFamily("eu.stability.stable-image-inpaint-v2:0")).toBe("inpaint");
    expect(detectFamily("stability.stable-fast-upscale-v1:1")).toBe("fast-upscale");
  });

  it("falls back to text-to-image for unknown ids", () => {
    expect(detectFamily("stability.some-new-model-v1:0")).toBe("text-to-image");
  });
});

describe("imageToImageKind", () => {
  it("uses mode-style for sd3 and unknown models", () => {
    expect(imageToImageKind("stability.sd3-5-large-v1:0")).toBe("mode");
    expect(imageToImageKind("stability.some-new-model-v1:0")).toBe("mode");
  });
  it("uses plain image for ultra", () => {
    expect(imageToImageKind("stability.stable-image-ultra-v1:1")).toBe("plain");
  });
  it("rejects input images for core", () => {
    expect(imageToImageKind("stability.stable-image-core-v1:1")).toBe("none");
  });
});

describe("BUILT_IN_MODELS", () => {
  it("contains no duplicates", () => {
    expect(new Set(BUILT_IN_MODELS).size).toBe(BUILT_IN_MODELS.length);
  });
});
