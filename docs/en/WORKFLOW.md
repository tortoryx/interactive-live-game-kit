# Build an interactive game with an AI coding assistant

[简体中文](../zh-CN/WORKFLOW.md) · [Home](../../README.md)

This guide is for readers who have [tried the example](../../examples/whitebridge/README.md) and want to change it. Open the project folder in your coding assistant, then keep returning to the game after each change. Problems that are hard to notice in code can be obvious to a viewer.

## Start with one viewer message

Choose one action. For cooperative defense, sending `repair` could restore some wall health and show who repaired it. Make that interaction work before adding upgrades, monsters and gifts.

A useful first request to a coding assistant is:

> Make the viewer message “repair” restore wall health. Start in the local test-chat controls. Show the sender and amount restored; explain when the wall is already full. Identify the files you need to change, implement it, and give me the steps to try it.

You now have something specific to test. It is easier to judge than a request to make an entire entertaining livestream game.

## Make each viewer's effect recognizable

Early versions of the example could spawn troops, but players lost track of them in the crowd. Portraits, arrival close-ups and off-screen arrows made participation visible.

Apply that to your format: a racing player needs to find their car, voters need to see the outcome, and someone casting a spell needs to know whether it worked. They should not have to ask the host to confirm every action.

If an action has a cooldown, show the remaining time. If the platform disconnects, show that state. Deterministic actions such as deployment should happen without waiting for an AI reply.

## Let game rules run the battle

The model can answer viewers, react to reversals or suggest tactics. Game rules calculate damage, units, outcomes and gift effects. A slow model response should not stop play.

For commentary, provide what happened, who was involved and what changed. “Speak less when nothing changes; answer viewers first” works better for a long session than “be enthusiastic all the time.” See [host, speech and memory](AI-AND-MEMORY.md).

## Test locally before connecting a room

The test identities let you act as multiple viewers. Try normal commands, repeated messages, changing faction, losing every troop and simultaneous gifts.

Platform events may be delayed or delivered twice. The code's *receipts* are processing records: they show whether an event arrived, ran, or was recognized as a duplicate. Receiving a gift event twice must not award troops twice.

[Bilibili and OBS](BILIBILI-AND-OBS.md) separates the next steps: receiving chat in the game, then broadcasting its picture and sound. You can apply for platform access while refining the rules.

## Keep a version you can return to

Give the assistant one visible problem at a time, such as troops disappearing behind buildings or abrupt camera movement. Ask what changed, then repeat the same play sequence. Save a Git commit when it works so later regressions have a useful comparison.

Expand the units, effects and audience load after the basic interaction is enjoyable. Use the [code map](ARCHITECTURE.md) to find features and [adapt the example](REPLACE-EXAMPLE.md) when changing the format.
