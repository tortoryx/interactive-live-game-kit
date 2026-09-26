# First play: download, start, deploy

[简体中文](README.zh-CN.md) · [Project home](../../README.md)

Run *Human–Demon Battle* on your own computer and use test chat to act as a viewer. You do not need a streaming account or an AI key for this walkthrough.

## 1. Download and start

1. On the [repository home page](../../README.md), choose the green **Code → Download ZIP** button. Extract the ZIP. The project folder should contain `package.json` and `scripts`.
2. Install [Node.js](https://nodejs.org/) **24.11 or a newer 24.x release**. Node runs the game service; its installer also provides the `npm` command.
3. Open Terminal on macOS or PowerShell on Windows. Type `cd ` with a trailing space, drag the extracted project folder into the terminal, and press Enter. Put the path in double quotes if it contains spaces.
4. Run these commands one at a time, waiting for the first to finish:

```sh
npm ci
npm start
```

The first command downloads dependencies and needs internet access. Once the terminal prints `Open http://127.0.0.1:4391/ to play`, open [http://127.0.0.1:4391/](http://127.0.0.1:4391/) in a browser. This address points to your own computer.

macOS is the tested environment. The same Node commands are the starting point on Windows/Linux, but the full setup has not been verified there. Local speech has separate system requirements.

## 2. Deploy your first soldier

The game UI is mainly Chinese. You can copy the commands below into its chat field.

1. Click `继续` (Resume) at the top.
2. Find the test-chat field at the bottom. Keep the identity set to `测试玩家` (Test player).
3. Send `加入人族` (Join humans), then send `参战` (Enlist).
4. Look for the deployment feedback and your identity marker on the new troop. Send `2` to make your troops retreat.
5. Change the identity to `试玩乙` (Test player B). Send `加入魔族` (Join demons), then `参战`. You can now test both sides as different viewers.

The `模拟礼物 · 不扣费` controls simulate gifts locally without buying anything. Click `开启声音` to enable music and effects. Spoken host commentary needs separate AI and voice setup.

## 3. Viewer commands

| Message | Effect |
| --- | --- |
| `加入人族` / `加入魔族` | Join humans / demons; otherwise participation assigns a faction |
| `参战` | Deploy one free soldier; repeat to deploy more, with no 30-second enlistment cooldown |
| `1` / `2` / `3` / `4` / `5` | Advance / retreat / attack / guard / collect nearby supplies |
| `自立门户` | Found a faction with your avatar as a general who has one life |
| `加入X族` | Join a player faction; replace X族 with its displayed name |
| `复活` | Check the rescue credit needed for your fallen troops |
| The eight-character spells shown on screen | Trigger their events; one spell per viewer every 30 seconds |

Orders affect the current viewer's own troops. Surviving troops keep their wounds across rounds. Humans and demons each receive a formation of weak system soldiers every minute; viewers can keep adding their own units.

## 4. Stop and return later

`暂停` pauses the battle. **Closing the browser does not stop the service.** To finish, return to the terminal running `npm start` and press `Ctrl+C`. Run `npm start` in the same folder next time; it starts paused.

Saves and personal settings live in the project's `.local/` folder. To clear them, stop the service and back up or move that folder. This also removes saved platform configuration from the running setup.

## Troubleshooting

| What you see | What to check |
| --- | --- |
| `npm` not found | Finish installing Node, reopen the terminal, then try `node --version` |
| `package.json` not found | Enter the extracted project folder rather than its parent |
| `EADDRINUSE` | Another copy may already be running; stop that copy in its terminal |
| Browser cannot connect | Check that the startup terminal is still running without errors |
| No sound | Enable sound in the game; check tab mute and system volume |
| No witch or commentary | Follow the separate host setup guide below |

Next: [add a host and voice](../../docs/en/AI-AND-MEMORY.md) · [connect Bilibili and OBS](../../docs/en/BILIBILI-AND-OBS.md) · [make another game](../../docs/en/REPLACE-EXAMPLE.md).
