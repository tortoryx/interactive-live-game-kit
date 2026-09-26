# Add a speaking host

[简体中文](../zh-CN/AI-AND-MEMORY.md) · [Home](../../README.md)

The corner host has three parts: **a language model writes her lines, a speech service reads them, and Live2D provides the animated character.** You can change each separately. Complete the [local walkthrough](../../examples/whitebridge/README.md), then add these parts in order.

## 1. Generate a reply

Commentary uses a model API. Obtain an API key from your chosen provider; requests are charged by that service.

Copy `.env.example` to `.env` in the project folder. For DeepSeek, fill in:

| Setting | Value |
| --- | --- |
| `DEEPSEEK_API_KEY` | Your API key |
| `DEEPSEEK_MODEL` | A model ID currently available to your account |
| `DEEPSEEK_INPUT_USD_PER_MILLION` | Input price in USD per million tokens |
| `DEEPSEEK_OUTPUT_USD_PER_MILLION` | Output price in USD per million tokens |

Example values are not a live price list; check the provider console. Restart the game, open http://127.0.0.1:4391/settings.html , set a budget under `魔女解说 · DeepSeek API`, and click `保存并连接` (Save and connect).

Ask a question through test chat and check the model status and reply. Before installing the character and speech, use the settings/status page to check generation. Silence alone does not tell you whether text generation succeeded.

For another provider, fill in `AI_MODEL`, `AI_CHAT_URL`, `AI_API_KEY` and the two prices in `.env.example`. This custom path expects Chat Completions and JSON Schema output; compatibility needs more than changing a model name.

## 2. Add speech

TTS means text-to-speech. A working language-model connection still needs a speech service to produce audible commentary.

### Local synthesis on Apple Silicon Macs

Install [uv](https://docs.astral.sh/uv/), then run from the project folder:

```sh
npm run voice:install -- --plan
npm run voice:install
```

The first command shows the plan. The second downloads dependencies and the Qwen3-TTS / MLX model. Reserve about **8 GiB of disk** and **6.5 GiB of available memory** for cold start. Installation needs internet access; the installed synthesis worker is denied networking.

Restart the game and click `启用本机解说声音` (Enable local commentary voice) under `解说语音 · 本地女声`, then wait for warm-up. The project includes a fixed synthetic adult female voice reference, reused across passages. Runtime settings live in `examples/whitebridge/.runtime/`.

### Cloud synthesis

For other computers, or to avoid running the local model, use the Bailian speech option in Settings. Enter your own key, matching region and character limits, then choose `保存并启用语音` (Save and enable speech). Speech and language-model usage are billed separately; check that your account supports the configured service.

## 3. Install a Live2D character

A Live2D / Cubism model comes as a folder containing `model3.json`, model data and textures. Choose one licensed for your use and streaming, and preserve its folder structure. The witch seen in the video is obtained separately; this repository supplies the driving code.

The installer expects a Cubism 4 model and four runtime files:

| Filename | Source / version |
| --- | --- |
| `live2dcubismcore.min.js` | [Official Live2D Web SDK](https://www.live2d.com/en/sdk/download/web/), under its terms |
| `pixi.min.js` | PixiJS 6.5.10 |
| `unsafe-eval.min.js` | A matching @pixi/unsafe-eval build |
| `cubism4.min.js` | Cubism 4 build of pixi-live2d-display 0.4.0 |

Put the four files in one runtime folder. Replace both sample paths below with your own:

```sh
npm run host:install -- --model "/path/to/model.model3.json" --runtime "/path/to/runtime-folder"
```

Refresh the game. Check blinking, breathing, head/body movement and lips following speech playback. Models expose different parameters, so motion may need adjustment. Set framing through `height` and `offsetY` in `examples/whitebridge/modules/pixel-war/public/empress/config.json`.

## Context and memory

The host receives limited battle facts and selected viewer messages. Viewer questions take priority over background chatter. Repeated free enlistments, unchanged health and the same location should not be narrated repeatedly. Commander and soldier bubbles use local rules, without model calls or spoken voices.

Viewer messages and published replies are stored locally in SQLite by platform identity. Relevant history is retrieved when a viewer returns. Unplayed drafts are not treated as something both parties have heard. See [data management](SECURITY.md) for retention and deletion.

The model has no computer-control tools. Output is validated before use; game rules control deployment, damage and outcomes.

## Check cost and playback

The DeepSeek path limits concurrent requests and has hourly/daily request and money budgets. The custom path also limits request frequency. Displayed cost is an estimate; the provider's bill is authoritative. Budget or authentication failures stop generation without stopping basic gameplay.

Speech is synthesized as complete passages to reduce voice changes between sentences. Make an [OBS recording](BILIBILI-AND-OBS.md) to hear the balance of speech, music and effects and check lip timing. An enabled setting is only the start of that check.
