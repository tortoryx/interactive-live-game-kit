# Toolkit structure and example boundaries

[简体中文](../zh-CN/ARCHITECTURE.md)

```text
README / localized guides       concept → build → connect → verify → share
scripts/                         launcher, OBS export, docs/privacy/release checks
examples/whitebridge/            one concrete game, its runtime, assets and tests
licenses/                        preserved third-party notices
```

The root startup command runs the included example. Its runtime is not yet separated into a game-agnostic engine; importing its broker or `LiveGame` may also import game-specific rules. The guides identify reusable patterns without promising an existing plug-in contract.

```text
Synthetic input / Bilibili events / optional ingress program
                     ↓
Private connection service (4392) → normalization / receipts / avatars
                     ↓
LiveGame + PixelWorld → rules, ownership, commands, persistence, context
          ↓                          ↕
Capture page (4390)             optional AI / TTS
          ↓
Browser / OBS Browser Source

Owner page (4391) → bounded actions with Origin and token checks
```

All ports default to loopback. The public launcher runs services in one Node process; logical separation and ports are not OS isolation. For OS-level separation, configure a dedicated low-privilege account or VM with minimal mounts.

## Reference-code map

All paths below are relative to `examples/whitebridge/modules/`.

| Change | Entry points |
| --- | --- |
| Units, attacks and equipment | `pixel-war/public/catalog.mjs` |
| Gift value and quantity | `pixel-war/public/gifts.mjs`, `gift-tiers.mjs`, `gift-strength.mjs` |
| Free recruitment, cooldowns and feedback | `live-runtime/interaction-feedback.mjs` |
| Troop lifetime and revival | `pixel-war/service-life.mjs`, `live-runtime/rescue.mjs` |
| Sites, front lines and movement | `pixel-war/campaign.mjs`, `navigation.mjs`, `strategy.mjs` |
| Composable characters and weapons | `pixel-war/public/actors.mjs`, `procedural-weapons.mjs` |
| Cameras and ownership indicators | `pixel-war/public/camera.mjs`, `unit-marker-tracker.mjs`, `supporter-guides.mjs` |
| Crowns, succession and settlement | `pixel-war/crown-inheritance.mjs`, `leader-lineage.mjs`, `settlement.mjs` |
| Model prompts and validation | `live-runtime/models.mjs`, `speech-request.mjs` |
| Viewer history and active context | `live-runtime/viewer-history.mjs` and audience modules |
| Bilibili protocol and normalization | `live-runtime/bilibili.mjs`, `connectors/bilibili-events.mjs` |
| Music and speech playback | `pixel-war/public/music.mjs`, `audio-director.mjs`, `speech-playback.mjs` |

Within each cell, shortened filenames share the preceding directory. The server owns game state; editing visuals cannot legitimately increase damage or create paid receipts.

Audio layers are processed mixes separated from a licensed stereo loop, not original isolated instrument stems. Layers share a timeline. Rebuild scripts live under `examples/whitebridge/scripts/`, require extra Python audio dependencies, and run from that example directory. Ordinary play uses bundled audio and does not need rebuilding.

Useful future work includes performance measurements, real provider tests, UI localization, separate platform adapters, privacy retention/deletion tools and extracting genuine game-independent contracts. These are contribution opportunities, not claims that those features already exist.
