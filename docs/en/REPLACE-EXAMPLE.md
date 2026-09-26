# Replace the example with your own game

[简体中文](../zh-CN/REPLACE-EXAMPLE.md)

Use this guide after trying the example if you want to build defense, racing or another format. Keep test chat, viewer identities and broadcast output while replacing the game rules in small steps.

This requires code changes; the [AI-assisted workflow](WORKFLOW.md) can help. There is no configuration-only plug-in interface for arbitrary games yet.

| Layer | Reusable ideas | Changes |
| --- | --- | --- |
| Platform | Authorization, stable IDs, deduplication, receipts | Fields, permissions, gift catalog and value interpretation |
| Interaction and models | Cooldowns, queues, bounded actions, memory, speech scheduling | Commands, character prompts, action enums and triggers |
| Game | Authoritative state, read-only output, ownership and highlights | Rules, victory conditions, items, art and cameras |

For cooperative tower defense:

1. Define a free input: `repair` restores a wall and displays its cooldown.
2. Create your game under `examples/`, completing repair and feedback with synthetic events before adding payments.
3. Define allowed repair, deploy and upgrade actions. Game rules resolve resources; never execute chat as a function name.
4. Borrow deduplication, receipts, portraits and reply queues. Remove faction, army and generation assumptions. `LiveGame` and `PixelWorld` are coupled; changing a title does not replace the game.
5. For AI, update the prompt, JSON Schema, validator and executor together. Accept only defined actions and preserve deterministic rules on failure.
6. Provide separate capture URLs and owner actions. OBS loads only the capture page.
7. Bind gifts using your platform's current catalog. Verify replay safety before real authorized integration tests.

After changing the rules, send repeated commands as one test viewer, then switch to another. Confirm that each controls only their own character. Disconnect AI and check that basic play continues. Replay one gift event and check that it rewards only once. Finish with the [runtime checks](VALIDATION.md).

Using the workflow does not require copying Whitebridge's story or characters. Reusing its art or audio does require preserving their licenses.
