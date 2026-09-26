# Runtime checks and tested environments

[简体中文](../zh-CN/VALIDATION.md) · [Home](../../README.md)

After the [play walkthrough](../../examples/whitebridge/README.md), use these checks when changing code, moving computers or connecting a room.

## Check local play

- Join a faction as one test identity, send `参战`, and find that viewer's troop and feedback.
- Send `2` to retreat. Switch identity and join the other faction.
- Trigger a simulated gift and check the expected unit or effect.
- Enable music and effects, pause and resume, then stop the service with `Ctrl+C`.

These steps use local messages and require no real gifts.

## Check a code change

Run from the project folder:

```sh
npm test
npm run docs:check
npm run privacy:check
```

Tests cover duplicate events, ownership, combat, revival and dialogue scheduling. Documentation checks find missing pages and broken links. The privacy scan checks common secret and private-path patterns. Try visuals and sound in the game as well.

To generate OBS configuration or a source package:

```sh
npm run obs:export
npm run release
```

Documentation, scanning and packaging commands require Python 3.8+. `npm run test:full` includes a larger historical regression collection; some scenarios retain old rule assumptions. It was not included in the 0.3.0 release test result.

## Check each external service

| Addition | Expected result |
| --- | --- |
| AI | A real request succeeds, the reply fits the question, and usage is recorded |
| Voice and character | The reply is audible, lips follow playback, and stopping does not play queued stale lines |
| Bilibili chat | An incoming message appears in the connection records and affects the correct viewer |
| Bilibili gift | The sender receives the effect once, even if the same event is delivered again |
| OBS | A recording contains only the game and intended audio while you switch other windows |

Setup: [AI and speech](AI-AND-MEMORY.md), [Bilibili and OBS](BILIBILI-AND-OBS.md). Automated adapter tests use simulated responses; these checks need your own service and room.

## 0.3.0 test record

Release checks used macOS, Node 24.11.1 and Python 3.8+. The maintained suite passed 218 tests. A fresh folder started and handled local enlistment and simulated gifts. Checks also covered documentation links, asset hashes, OBS template structure and the package manifest.

That record describes 0.3.0 rather than every streaming setup. Full Windows/Linux setup, audience bursts, unattended sessions and actual broadcast delivery need testing. The optional voice installer had its plan checked; a full fresh model download was not repeated for that release.
