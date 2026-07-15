# openclaw-bedrock-images

[OpenClaw](https://openclaw.ai) image generation plugin for **Stability AI models on Amazon Bedrock**, using the Bedrock runtime `InvokeModel` API.

- Text-to-image with SD3.5 Large, Stable Image Core, and Stable Image Ultra
- Image editing with the Stability AI Image Services (inpaint, erase, remove background, search & replace, outpaint, upscales, control sketch/structure, style guide/transfer)
- Auth with an [Amazon Bedrock API key](https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started-api-keys.html) (bearer token), or optionally the standard AWS SDK credential chain (SigV4)

## Install

```bash
openclaw plugins install @cheeseandcereal/openclaw-bedrock-images
openclaw gateway restart
```

## Setup

1. Create a Bedrock API key and export it (the standard AWS env var):

   ```bash
   export AWS_BEARER_TOKEN_BEDROCK="your-bedrock-api-key"
   ```

2. Configure the region and (optionally) a default image model:

   ```json5
   {
     plugins: {
       entries: {
         "bedrock-images": {
           config: {
             region: "us-west-2",
           },
         },
       },
     },
     agents: {
       defaults: {
         imageGenerationModel: {
           primary: "bedrock-images/stability.sd3-5-large-v1:0",
         },
       },
     },
   }
   ```

3. Make sure your AWS account has [model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) enabled for the Stability AI models you want, in the region you configured.

That's it — the `image_generate` tool becomes available to your agent, and you can also test from the CLI:

```bash
openclaw infer image generate \
  --model bedrock-images/stability.sd3-5-large-v1:0 \
  --prompt "A lighthouse on a rocky coast at sunset, oil painting style" \
  --output lighthouse.png --json
```

## Configuration reference

All settings live under `plugins.entries.bedrock-images.config`:

| Key | Default | Description |
| --- | --- | --- |
| `region` | AWS SDK region chain (`AWS_REGION`, `~/.aws/config`, ...) | AWS region for the `bedrock-runtime` endpoint |
| `auth` | `"api-key"` | `"api-key"` uses a Bedrock API key (bearer token); `"aws-sdk"` uses the AWS SDK default credential chain (SigV4) |
| `apiKey` | unset | Bedrock API key as a literal string, `"${ENV_VAR}"` shorthand, or a [SecretRef](#api-key-as-a-secret) object |
| `defaultModel` | `stability.sd3-5-large-v1:0` | Model used when a request doesn't specify one |
| `models` | `{}` | Per-model settings map, see below |

API key resolution order: `apiKey` plugin config → stored OpenClaw auth profile → `AWS_BEARER_TOKEN_BEDROCK` env var. With `auth: "aws-sdk"`, no API key is used and the normal AWS credential chain (env keys, `~/.aws/credentials`, SSO, IMDS, ...) signs requests instead.

### API key as a secret

`apiKey` accepts any OpenClaw *SecretInput*, so you never have to put the raw key in your config file:

```json5
{
  plugins: {
    entries: {
      "bedrock-images": {
        config: {
          // Env var (shorthand form):
          apiKey: "${MY_BEDROCK_KEY}",

          // ... or an explicit SecretRef. Sources: "env", "file" (mounted
          // secret files), or "exec" (secret manager CLIs like vault/pass),
          // configured under OpenClaw's `secrets.providers`:
          // apiKey: { source: "exec", provider: "vault", id: "bedrock/api-key" },
          // apiKey: { source: "file", provider: "mounted-json", id: "/bedrock/apiKey" },
        },
      },
    },
  },
}
```

A configured `apiKey` that fails to resolve is a hard error (with the SecretRef named in the message) rather than a silent fallback to other sources. A literal string also works but is discouraged for anything beyond local experiments.

### Per-model settings (`models`)

```json5
{
  plugins: {
    entries: {
      "bedrock-images": {
        config: {
          models: {
            // Static fields merged into the InvokeModel request body:
            "us.stability.stable-image-search-replace-v1:0": {
              options: { search_prompt: "the main subject" },
            },
            "us.stability.stable-outpaint-v1:0": {
              options: { left: 512, right: 512 },
            },
            // Advertise an extra/new model id and/or force its request schema:
            "eu.stability.stable-image-inpaint-v2:0": { family: "inpaint" },
          },
        },
      },
    },
  },
}
```

- `options` — static fields merged into the request body (e.g. `negative_prompt`, `seed`, `style_preset`, `strength`, outpaint directions, `search_prompt`). Per-request values (prompt, images, aspect ratio, output format) win on conflict.
- `family` — overrides request-schema auto-detection. Auto-detection matches the service slug in the model id and ignores region prefixes (`us.`, `eu.`, ...) and version suffixes, so new versions and regions work without configuration. Valid families: `text-to-image`, `inpaint`, `erase`, `remove-background`, `search-replace`, `search-recolor`, `outpaint`, `creative-upscale`, `conservative-upscale`, `fast-upscale`, `control-sketch`, `control-structure`, `style-guide`, `style-transfer`.

Any `stability.*` model id works even if it isn't listed anywhere — unknown ids use the standard text-to-image schema.

## Supported models

Model selection is per request: the agent can pass `model` to `image_generate`, or you set `agents.defaults.imageGenerationModel`. There is no automatic routing to edit services — to use one, select its model id explicitly.

### Text-to-image

| Model | Notes |
| --- | --- |
| `stability.sd3-5-large-v1:0` | Default. Also supports image-to-image (pass a reference image) |
| `stability.stable-image-ultra-v1:1` | Highest quality. Also supports image-to-image |
| `stability.stable-image-core-v1:1` | Fastest/cheapest. Text-to-image only |

Supported aspect ratios: `1:1`, `16:9`, `21:9`, `2:3`, `3:2`, `4:5`, `5:4`, `9:16`, `9:21`. Output formats: `png`, `jpeg`, `webp`. One image per request.

### Image services (editing)

These use cross-region inference-profile ids (note the `us.` prefix) per the [AWS docs](https://docs.aws.amazon.com/bedrock/latest/userguide/stable-image-services.html):

| Model | Inputs |
| --- | --- |
| `us.stability.stable-image-inpaint-v1:0` | prompt + image (+ optional mask as 2nd image) |
| `us.stability.stable-image-erase-object-v1:0` | image (+ optional mask as 2nd image) |
| `us.stability.stable-image-remove-background-v1:0` | image |
| `us.stability.stable-image-search-replace-v1:0` | prompt + image + `search_prompt` via config `options` |
| `us.stability.stable-image-search-recolor-v1:0` | prompt + image + `select_prompt` via config `options` |
| `us.stability.stable-outpaint-v1:0` | image + directions (`left`/`right`/`up`/`down`) via config `options` |
| `us.stability.stable-creative-upscale-v1:0` | prompt + image |
| `us.stability.stable-conservative-upscale-v1:0` | prompt + image |
| `us.stability.stable-fast-upscale-v1:0` | image |
| `us.stability.stable-image-control-sketch-v1:0` | prompt + image |
| `us.stability.stable-image-control-structure-v1:0` | prompt + image |
| `us.stability.stable-image-style-guide-v1:0` | prompt + image (style reference) |
| `us.stability.stable-style-transfer-v1:0` | 2 images: `images[0]` = image to restyle, `images[1]` = style reference |

Input conventions:

- **Mask**: for inpaint/erase, pass the mask as the second reference image (`images[1]`). Without a mask, the image's alpha channel is used.
- **Extra fields** (`search_prompt`, `select_prompt`, outpaint directions, `grow_mask`, `creativity`, ...) are not part of OpenClaw's shared `image_generate` tool, so they come from the per-model `options` config shown above. Requests fail with a config-pointing error when a required field is missing.

Example (CLI):

```bash
openclaw infer image edit \
  --model bedrock-images/us.stability.stable-image-remove-background-v1:0 \
  --file photo.jpg --prompt "remove the background" \
  --output subject.png --json
```

## Region availability

Stability AI models are only available in certain AWS regions (text-to-image models commonly in `us-west-2`; the `us.stability.*` image services via US inference profiles). Check [model support by region](https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html) and set `plugins.entries.bedrock-images.config.region` accordingly. Access/not-found errors from this plugin include the region used to make misconfiguration obvious.

## Development

```bash
npm install
npm test          # vitest unit tests
npm run build     # tsc -> dist/
```

To test a local build against a real OpenClaw install:

```bash
npm pack
openclaw plugins install npm-pack:./cheeseandcereal-openclaw-bedrock-images-<version>.tgz --force
openclaw plugins inspect bedrock-images --runtime --json
```

## License

[Unlicense](./UNLICENSE) — public domain.
