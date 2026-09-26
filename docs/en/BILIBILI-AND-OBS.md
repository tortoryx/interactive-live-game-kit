# Connect the game to a Bilibili room

[简体中文](../zh-CN/BILIBILI-AND-OBS.md) · [Home](../../README.md)

Complete the [local walkthrough](../../examples/whitebridge/README.md) first. There are two connections to make: **Bilibili sends chat and gifts to the game; OBS sends the game's picture and sound to Bilibili.** OBS is the software that encodes and uploads your broadcast.

## 1. Prepare your room and application

Broadcast eligibility and access to interaction events are separate. Platform requirements can change; use your current account console, [Open Live](https://open-live.bilibili.com/) and the [official documentation](https://open-live.bilibili.com/document/849b924b-b421-8586-3e5e-765a72ec3840) when applying.

1. Complete the platform's identity and live-room requirements. Confirm that your account and current location are eligible to broadcast.
2. Apply for Open Live developer access, describing your actual chat/gift game.
3. Keep the issued Access Key ID and Access Key Secret locally. Create an application and record its `app_id`. The keys identify your application to the platform.
4. Obtain the broadcaster identity code through the current platform flow and record your `room_id`. This code binds the broadcaster; it is not a website cookie.
5. Follow the console's testing, upload and review requirements. Test access may be limited to your own room.

Enter credentials only in local settings. Remove them from any screenshot you use to report an issue.

## 2. Receive a real chat message

With the game running, open [http://127.0.0.1:4391/settings.html](http://127.0.0.1:4391/settings.html). Enter the details under `B站 · 开放平台授权` and click `保存并连接` (Save and connect). Open the platform connection page.

A **receipt** is a processing record for an incoming event. It shows whether the event arrived and what happened to it.

In your Bilibili room, send `加入人族`, `参战` and `2`. Look for faction feedback, your troop and its retreat, together with matching receipt records. The platform controls which events are available before a stream starts. If no receipt arrives, investigate authorization or the connection before changing deployment rules.

## 3. Map gift effects

Enable `允许真实礼物进入战场` (Allow real gifts into the game) separately. This makes received gift events affect play; it neither buys a gift nor starts a stream.

Map gift IDs from your actual room to game effects. The package contains six example bindings. Use the room's current names, prices, availability and event data. The included box icons are generic illustrations.

Try simulated gifts locally before testing the real connection. If you choose to send one low-cost real gift, verify that it takes effect once and belongs to the correct viewer. A duplicate event after reconnecting must not deploy another reward.

## 4. Send the game through OBS

Install [OBS Studio](https://obsproject.com/). Create a scene and add a [Browser Source](https://obsproject.com/kb/browser-source) using one URL:

```text
http://127.0.0.1:4390/?side=demon&broadcast=1
http://127.0.0.1:4390/?side=human&broadcast=1
```

These follow the demon or human perspective respectively. Set **1920 × 1080**, initially at **30 FPS**. Port 4390 is the audience output; 4391 is the control page with operator buttons.

Disable “Shutdown source when not visible” and “Refresh browser when scene becomes active.” Lock the source position. Disable desktop and microphone audio, retaining game browser audio. With only the game source in the scene, opening other computer windows does not change what is captured.

Alternatively run `npm run obs:export` in the project folder, then import `.local/obs/demon.json` or `human.json` through OBS Scene Collection → Import. Check the resulting sources and audio.

Configure OBS using the stream credentials or sign-in method actually offered to your account. The project cannot supply streaming permission the platform has not granted.

## 5. Record, then go live

Make a short local recording: deploy a unit, trigger an event, play sound, then switch windows and desktops. Play the recording and confirm it contains only the game and intended audio.

Set the title, cover and category, check that the game is running, and start broadcasting from your streaming software. Watch on another device to check commands, sound and stutter. Diagnose stutter in order: local rendering, OBS render/encoding drops, upload, then viewer buffering. Start with the first stage showing a problem.

A dedicated browser source still needs the game service running. Sleep, stopping the service, switching OBS scenes or adding another capture source can affect output.

## 6. End the session

Stop streaming, confirm the room is offline, then press `Ctrl+C` in the game terminal. The next start is paused; check connection and gift settings again.

## Other platforms

Xiaohongshu's computer-stream code and stream key publish video; they do not provide chat/gift access. The kit has an event-ingress format for an external program, but no ready-to-use authorized collector. YouTube and Twitch also need additional adapters. They are not ready-to-connect options in this version.
