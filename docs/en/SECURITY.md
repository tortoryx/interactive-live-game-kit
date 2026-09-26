# Security configuration and data management

[简体中文](../zh-CN/SECURITY.md)

Configure platform and model credentials locally and use a dedicated game capture source. This guide explains how to manage your settings, viewer data and runtime permissions.

## Local storage

| Path | Purpose |
| --- | --- |
| `.local/game.sqlite` | Battles, troop ownership, event receipts and interaction history |
| `.local/connections.sqlite` | Platform settings and pending events; may contain credentials you enter |
| `.env` | Optional model-provider configuration |

The launcher restricts file and directory permissions. Databases are not separately encrypted; other programs running as your OS user may read them. Stop the process before deleting `.local/` and `.env` to clear local saves and settings. Manage backups and provider-side records separately.

## Model permissions

The model receives limited battle context and selected messages, then returns structured dialogue and strategy. The server validates actions, character identity and message age before applying them. Keep this boundary: do not give characters shell access, arbitrary file operations or computer-control tools.

Names, messages and conversation history are external input. Never concatenate them into commands, SQL or executable source. Configure and rehearse dialogue moderation for your audience.

## Services and broadcast output

Owner ports listen on loopback by default. Keep them off the public internet. Origin checks and random tokens support local administration; a public deployment requires a separate authentication and access-control design.

Node runs with the launching user's permissions. For stronger isolation, use a low-privilege user, container or VM with restricted mounts and networking. Load the dedicated capture URL in OBS and check the resulting recording. See [Bilibili and OBS](BILIBILI-AND-OBS.md).

## Viewer data

Cross-day memory retains interaction records. Explain the purpose, choose a retention period and provide a deletion process. The example uses a local database and has no public account-management portal. Use synthetic identities and messages for debugging and issue reports.

## Releasing your version

Run `npm run privacy:check` and review `release-files.json` before packaging. Keep `.env`, runtime databases, logs and browser profiles out of the manifest. The scanner checks common path and credential patterns; review new files, images and videos manually. Preserve third-party authors, source links and licenses.

Security reports should include the affected version, a minimal reproduction and expected behavior. Never post real credentials or viewer records in public issues.
