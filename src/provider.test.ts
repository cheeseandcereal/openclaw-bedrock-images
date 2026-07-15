import { describe, expect, it } from "vitest";
import { buildRequestBody, parseInvokeResponse, resolveBearerApiKey } from "./provider.js";

const IMG_A = Buffer.from("image-a").toString("base64");
const IMG_B = Buffer.from("image-b").toString("base64");

describe("buildRequestBody: text-to-image", () => {
  it("builds a minimal prompt body", () => {
    expect(
      buildRequestBody({
        model: "stability.sd3-5-large-v1:0",
        family: "text-to-image",
        prompt: "a lighthouse",
        inputImages: [],
      }),
    ).toEqual({ prompt: "a lighthouse" });
  });

  it("includes aspect_ratio and output_format", () => {
    expect(
      buildRequestBody({
        model: "stability.stable-image-core-v1:1",
        family: "text-to-image",
        prompt: "a lighthouse",
        aspectRatio: "16:9",
        outputFormat: "jpeg",
        inputImages: [],
      }),
    ).toEqual({ prompt: "a lighthouse", aspect_ratio: "16:9", output_format: "jpeg" });
  });

  it("rejects unsupported aspect ratios", () => {
    expect(() =>
      buildRequestBody({
        model: "stability.sd3-5-large-v1:0",
        family: "text-to-image",
        prompt: "x",
        aspectRatio: "7:3",
        inputImages: [],
      }),
    ).toThrow(/aspectRatio values/);
  });

  it("requires a prompt", () => {
    expect(() =>
      buildRequestBody({
        model: "stability.sd3-5-large-v1:0",
        family: "text-to-image",
        prompt: "  ",
        inputImages: [],
      }),
    ).toThrow(/requires a prompt/);
  });

  it("merges static config options", () => {
    expect(
      buildRequestBody({
        model: "stability.sd3-5-large-v1:0",
        family: "text-to-image",
        prompt: "a lighthouse",
        inputImages: [],
        options: { negative_prompt: "blurry", seed: 42 },
      }),
    ).toEqual({ prompt: "a lighthouse", negative_prompt: "blurry", seed: 42 });
  });
});

describe("buildRequestBody: image-to-image", () => {
  it("uses sd3-style mode + strength", () => {
    expect(
      buildRequestBody({
        model: "stability.sd3-5-large-v1:0",
        family: "text-to-image",
        prompt: "watercolor version",
        inputImages: [IMG_A],
      }),
    ).toEqual({
      prompt: "watercolor version",
      mode: "image-to-image",
      image: IMG_A,
      strength: 0.5,
    });
  });

  it("respects strength from config options", () => {
    const body = buildRequestBody({
      model: "stability.sd3-5-large-v1:0",
      family: "text-to-image",
      prompt: "x",
      inputImages: [IMG_A],
      options: { strength: 0.8 },
    });
    expect(body.strength).toBe(0.8);
  });

  it("uses plain image for ultra (no mode field)", () => {
    expect(
      buildRequestBody({
        model: "stability.stable-image-ultra-v1:1",
        family: "text-to-image",
        prompt: "x",
        inputImages: [IMG_A],
      }),
    ).toEqual({ prompt: "x", image: IMG_A });
  });

  it("rejects input images for core", () => {
    expect(() =>
      buildRequestBody({
        model: "stability.stable-image-core-v1:1",
        family: "text-to-image",
        prompt: "x",
        inputImages: [IMG_A],
      }),
    ).toThrow(/does not support input images/);
  });

  it("silently drops aspect_ratio for image-to-image", () => {
    const body = buildRequestBody({
      model: "stability.sd3-5-large-v1:0",
      family: "text-to-image",
      prompt: "x",
      aspectRatio: "16:9",
      inputImages: [IMG_A],
    });
    expect(body.aspect_ratio).toBeUndefined();
  });
});

describe("buildRequestBody: edit services", () => {
  it("inpaint requires an input image", () => {
    expect(() =>
      buildRequestBody({
        model: "us.stability.stable-image-inpaint-v1:0",
        family: "inpaint",
        prompt: "a red hat",
        inputImages: [],
      }),
    ).toThrow(/requires an input image/);
  });

  it("inpaint maps image + optional mask", () => {
    expect(
      buildRequestBody({
        model: "us.stability.stable-image-inpaint-v1:0",
        family: "inpaint",
        prompt: "a red hat",
        inputImages: [IMG_A, IMG_B],
      }),
    ).toEqual({ prompt: "a red hat", image: IMG_A, mask: IMG_B });
  });

  it("erase drops the prompt and accepts a mask", () => {
    expect(
      buildRequestBody({
        model: "us.stability.stable-image-erase-object-v1:0",
        family: "erase",
        prompt: "erase the lamp",
        inputImages: [IMG_A, IMG_B],
      }),
    ).toEqual({ image: IMG_A, mask: IMG_B });
  });

  it("remove-background sends only the image", () => {
    expect(
      buildRequestBody({
        model: "us.stability.stable-image-remove-background-v1:0",
        family: "remove-background",
        prompt: "remove background",
        inputImages: [IMG_A],
      }),
    ).toEqual({ image: IMG_A });
  });

  it("remove-background rejects a second image", () => {
    expect(() =>
      buildRequestBody({
        model: "us.stability.stable-image-remove-background-v1:0",
        family: "remove-background",
        prompt: "x",
        inputImages: [IMG_A, IMG_B],
      }),
    ).toThrow(/at most 1 input image/);
  });

  it("search-replace requires search_prompt from config", () => {
    expect(() =>
      buildRequestBody({
        model: "us.stability.stable-image-search-replace-v1:0",
        family: "search-replace",
        prompt: "a jacket",
        inputImages: [IMG_A],
      }),
    ).toThrow(/search_prompt.*plugins\.entries\.bedrock-images/);
  });

  it("search-replace works with search_prompt in options", () => {
    expect(
      buildRequestBody({
        model: "us.stability.stable-image-search-replace-v1:0",
        family: "search-replace",
        prompt: "a jacket",
        inputImages: [IMG_A],
        options: { search_prompt: "sweater" },
      }),
    ).toEqual({ prompt: "a jacket", image: IMG_A, search_prompt: "sweater" });
  });

  it("outpaint requires a direction", () => {
    expect(() =>
      buildRequestBody({
        model: "us.stability.stable-outpaint-v1:0",
        family: "outpaint",
        prompt: "extend the scene",
        inputImages: [IMG_A],
      }),
    ).toThrow(/outpaint direction/);
  });

  it("outpaint works with directions from options", () => {
    expect(
      buildRequestBody({
        model: "us.stability.stable-outpaint-v1:0",
        family: "outpaint",
        prompt: "extend the scene",
        inputImages: [IMG_A],
        options: { left: 512, right: 512 },
      }),
    ).toEqual({ prompt: "extend the scene", image: IMG_A, left: 512, right: 512 });
  });

  it("style-transfer requires two images and maps init/style fields", () => {
    expect(() =>
      buildRequestBody({
        model: "us.stability.stable-style-transfer-v1:0",
        family: "style-transfer",
        prompt: "",
        inputImages: [IMG_A],
      }),
    ).toThrow(/requires 2 input images/);
    expect(
      buildRequestBody({
        model: "us.stability.stable-style-transfer-v1:0",
        family: "style-transfer",
        prompt: "",
        inputImages: [IMG_A, IMG_B],
      }),
    ).toEqual({ init_image: IMG_A, style_image: IMG_B });
  });

  it("style-guide accepts aspect_ratio", () => {
    expect(
      buildRequestBody({
        model: "us.stability.stable-image-style-guide-v1:0",
        family: "style-guide",
        prompt: "a castle in this style",
        aspectRatio: "9:16",
        inputImages: [IMG_A],
      }),
    ).toEqual({ prompt: "a castle in this style", image: IMG_A, aspect_ratio: "9:16" });
  });

  it("fast-upscale sends only the image", () => {
    expect(
      buildRequestBody({
        model: "us.stability.stable-fast-upscale-v1:0",
        family: "fast-upscale",
        prompt: "upscale this",
        inputImages: [IMG_A],
      }),
    ).toEqual({ image: IMG_A });
  });
});

describe("parseInvokeResponse", () => {
  it("returns base64 images and seeds", () => {
    expect(
      parseInvokeResponse({ images: ["aGk="], seeds: [123], finish_reasons: [null] }, "m"),
    ).toEqual({ base64Images: ["aGk="], seeds: [123] });
  });

  it("throws on content filter", () => {
    expect(() =>
      parseInvokeResponse({ finish_reasons: ["Filter reason: prompt"] }, "m"),
    ).toThrow(/filtered: Filter reason: prompt/);
  });

  it("throws on empty response", () => {
    expect(() => parseInvokeResponse({}, "m")).toThrow(/no image data/);
    expect(() => parseInvokeResponse(null, "m")).toThrow(/malformed/);
  });
});

describe("resolveBearerApiKey", () => {
  const req = (cfg: unknown = {}) => ({ cfg }) as never;

  it("returns undefined in aws-sdk mode", async () => {
    await expect(resolveBearerApiKey(req(), { auth: "aws-sdk" })).resolves.toBeUndefined();
  });

  it("uses a literal config apiKey", async () => {
    await expect(resolveBearerApiKey(req(), { apiKey: "literal-key" })).resolves.toBe(
      "literal-key",
    );
  });

  it("resolves ${ENV_VAR} shorthand from the environment", async () => {
    process.env.BEDROCK_IMAGES_TEST_KEY = "shorthand-key";
    try {
      await expect(
        resolveBearerApiKey(req(), { apiKey: "${BEDROCK_IMAGES_TEST_KEY}" }),
      ).resolves.toBe("shorthand-key");
    } finally {
      delete process.env.BEDROCK_IMAGES_TEST_KEY;
    }
  });

  it("resolves an env-source SecretRef object", async () => {
    process.env.BEDROCK_IMAGES_TEST_KEY = "ref-key";
    try {
      await expect(
        resolveBearerApiKey(req(), { apiKey: { source: "env", id: "BEDROCK_IMAGES_TEST_KEY" } }),
      ).resolves.toBe("ref-key");
    } finally {
      delete process.env.BEDROCK_IMAGES_TEST_KEY;
    }
  });

  it("fails loudly when a configured SecretRef does not resolve", async () => {
    await expect(
      resolveBearerApiKey(req(), {
        apiKey: { source: "env", id: "BEDROCK_IMAGES_DEFINITELY_MISSING" },
      }),
    ).rejects.toThrow(/configured API key did not resolve.*BEDROCK_IMAGES_DEFINITELY_MISSING/s);
  });
});
