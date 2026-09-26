# How this project developed

[简体中文](../zh-CN/BUILD-STORY.md) · [Home](../../README.md)

I started with a question: could an AI host a stream and earn money through audience participation? A viewer would send a message and a character would act on it. Some viewers would help, others would cause trouble, and the host would react.

I worked with an AI coding assistant on a browser game, applied for Bilibili Open Live access, connected chat and gifts, and tried real broadcasts. This repository collects the implementation and the process.

## Playing it shaped the game

The first characters and battlefield were not enough. Viewers could lose track of the troops they sent. A close camera hid the battle. Commanders kept fighting at the bridge without much changing. Each play session exposed another specific problem to fix.

Characters became composable pixel bodies, equipment, weapons and animations. Viewer troops gained portraits, arrival close-ups and off-screen indicators. Independent factions let a viewer use their avatar as a general and invite others to join.

Commander succession grew into a recurring joke: defeat one family member and an older one arrives, picking up the fallen crowns and adding them to the stack. A game character is retired; the underlying model service is not deleted.

## The host and the game have different jobs

Early experiments generated dialogue for both commanders. Queues, voice transitions and repeated lines interrupted viewing. The current version uses one corner host for AI commentary and viewer chat. Commanders and soldiers keep locally generated text bubbles.

The animated host uses an existing Live2D model, driven by code for blinking, breathing, body movement and lips. A fixed voice reference helps keep speech consistent across turns. You can install a character you have permission to use; the [host guide](AI-AND-MEMORY.md) covers model and speech setup.

Deployment, orders and faction choices run directly through game rules. A late comment should not delay a viewer's command.

## Working with an AI coding assistant

I chose the format, played each version, judged the results and handled my platform account and broadcasts. The assistant implemented rules, rendering, integrations and tests, then revised them from play feedback.

The most useful requests were specific: “that portrait covers the soldier,” “enlistment gives no feedback,” or “she mentioned the same granary three times.” Those were easier to fix than “make it more entertaining.” The [development workflow](WORKFLOW.md) explains how to break your own ideas into similar tasks.

Broadcasting exposed another set of problems. A received message still needed to produce the right unit. Audio that sounded fine locally could sound wrong to viewers. Switching desktops could affect capture. Test messages, processing records, a dedicated output page and OBS setup tools grew out of those checks.

## Why share it

The implementation and guides give you a starting point: continue the game or use its chat, host and broadcast pieces for another format. Defense, racing or a map changed by viewer votes can all start with one local test message.

If you build a version, share a short demonstration of what viewers can do. It makes the idea easier to understand than source code alone. See [contributing](CONTRIBUTING.md).
