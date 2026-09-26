# Interactive Live Game Kit

**Let viewers play through chat, with an AI host reacting alongside them.**

[简体中文](README.zh-CN.md) · **English**

A viewer sends a message and a soldier bearing their name enters the battlefield. Another message tells that squad to retreat. Viewers can send reinforcements, talk to the host, or put their own avatar in charge of a new faction.

This repository contains **a game you can try on your computer, chat and gift integration code, and guides to building and broadcasting your own interactive game.** Keep the example or work with an AI coding assistant to turn it into tower defense, a race, or another format.

![The example battlefield: viewer-owned troops, contested sites and independent factions](docs/demo.png)

## What you can do with it

- **Try it yourself.** Send test chat messages, deploy units and switch between simulated viewers. No streaming account or gift purchase is needed.
- **Add a speaking host.** Configure a language model and speech service, then install a licensed Live2D character to comment on the game and respond to viewers.
- **Connect your Bilibili room.** Use platform authorization to receive real chat and gifts, then broadcast the game and its audio through OBS.
- **Make your own version.** Change the rules, characters, commands and gift effects. The guides explain how to develop these changes with an AI coding assistant.

The included game, *Human–Demon Battle*, pits two armies against viewer-created factions. When a commander falls, an older relative takes over—and inherits the growing stack of crowns. It is a working starting point for the broader livestream workflow.

## Start here

**[Download the project and deploy your first soldier →](examples/whitebridge/README.md)**

The guide starts with downloading a ZIP and opening a terminal. You can try the game before reading source code or applying for platform access.

Already familiar with Node.js? Use version 24.11 or a newer 24.x release, then run these commands in the project folder:

```sh
npm ci
npm start
```

Open [http://127.0.0.1:4391/](http://127.0.0.1:4391/), click `继续` (Resume), and send `参战` in the test-chat field at the bottom. To stop, press `Ctrl+C` in the terminal running the project.

## Where to go next

| I want to… | Guide |
| --- | --- |
| Play the example | [Setup and controls](examples/whitebridge/README.md) |
| Develop an interaction with an AI assistant | [Development workflow](docs/en/WORKFLOW.md) |
| Add the animated host and voice | [Host, speech and memory](docs/en/AI-AND-MEMORY.md) |
| Receive chat and broadcast the game | [Bilibili and OBS](docs/en/BILIBILI-AND-OBS.md) |
| Build a different game | [Adapt the example](docs/en/REPLACE-EXAMPLE.md) |
| Find the code for a feature | [Code map](docs/en/ARCHITECTURE.md) |
| Read how the project developed | [Development story](docs/en/BUILD-STORY.md) |

## What needs separate setup

Local play includes the battlefield, pixel characters, music and effects. **The witch model shown in the video must be obtained and installed separately.** AI commentary needs a model service; spoken commentary also needs speech setup. You can play without either.

Bilibili requires your own room, developer access and application authorization. Xiaohongshu, YouTube and Twitch chat/gifts are not ready-to-connect integrations in this kit. The guides are bilingual; the game UI is currently mainly Chinese, with translated controls in the English play guide. See [checks and tested environments](docs/en/VALIDATION.md).

Project code and guides use the [MIT license](LICENSE). Art, audio and optional Live2D models have their own [licenses and attribution](docs/en/THIRD_PARTY_NOTICES.md).

[Contribute](docs/en/CONTRIBUTING.md) · [Settings and data](docs/en/SECURITY.md) · [Share your version](docs/en/SHARING.md) · [Languages](docs/LANGUAGES.md)
