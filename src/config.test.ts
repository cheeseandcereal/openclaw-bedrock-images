import { describe, expect, it } from "vitest";
import { readConfiguredProviderApiKey, readPluginConfig } from "./config.js";

function wrap(config: unknown) {
  return { plugins: { entries: { "bedrock-images": { config } } } };
}

describe("readPluginConfig", () => {
  it("returns empty config when unset", () => {
    expect(readPluginConfig(undefined)).toEqual({});
    expect(readPluginConfig({})).toEqual({});
    expect(readPluginConfig(wrap(undefined))).toEqual({});
  });

  it("parses region, auth, and defaultModel", () => {
    expect(
      readPluginConfig(
        wrap({ region: "us-west-2", auth: "aws-sdk", defaultModel: "stability.foo-v1:0" }),
      ),
    ).toEqual({ region: "us-west-2", auth: "aws-sdk", defaultModel: "stability.foo-v1:0" });
  });

  it("drops invalid auth values", () => {
    expect(readPluginConfig(wrap({ auth: "iam" }))).toEqual({});
  });

  it("parses per-model family and options", () => {
    const parsed = readPluginConfig(
      wrap({
        models: {
          "us.stability.stable-outpaint-v1:0": { options: { left: 512 } },
          "custom.stability.thing-v9:0": { family: "erase" },
          "invalid-family-model": { family: "not-a-family" },
        },
      }),
    );
    expect(parsed.models).toEqual({
      "us.stability.stable-outpaint-v1:0": { options: { left: 512 } },
      "custom.stability.thing-v9:0": { family: "erase" },
      "invalid-family-model": {},
    });
  });
});

describe("readConfiguredProviderApiKey", () => {
  it("reads models.providers.bedrock-images.apiKey", () => {
    expect(
      readConfiguredProviderApiKey({
        models: { providers: { "bedrock-images": { apiKey: "abc" } } },
      }),
    ).toBe("abc");
  });
  it("returns undefined when unset", () => {
    expect(readConfiguredProviderApiKey({})).toBeUndefined();
    expect(readConfiguredProviderApiKey(undefined)).toBeUndefined();
  });
});
