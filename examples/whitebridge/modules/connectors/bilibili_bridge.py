"""Private, receive-only bridge around the pinned blivedm OpenLiveClient.

stdout is a private pipe to the owner process, never an OBS source. No browser
profile, microphone, native chat posting, or model tools are used here.
"""
import argparse
import asyncio
import json
import logging
import os
from pathlib import Path
import signal
import struct
import sys
from urllib.parse import urlparse
import zlib

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "vendor" / "blivedm"))

REQUIRED = ("BILI_OPEN_ACCESS_KEY_ID", "BILI_OPEN_ACCESS_KEY_SECRET",
            "BILI_OPEN_APP_ID", "BILI_OPEN_ANCHOR_CODE", "BILI_OPEN_ROOM_ID")
COMMANDS = {"LIVE_OPEN_PLATFORM_DM", "LIVE_OPEN_PLATFORM_SEND_GIFT", "LIVE_OPEN_PLATFORM_LIKE"}
FIELDS = {"room_id", "msg_id", "open_id", "timestamp", "msg", "gift_id",
          "gift_num", "paid", "combo_gift", "blind_gift", "like_count"}
HEADER = struct.Struct(">IHHII")


def config_check(env):
    missing = [name for name in REQUIRED if not env.get(name)]
    invalid = [name for name in ("BILI_OPEN_APP_ID", "BILI_OPEN_ROOM_ID")
               if env.get(name) and (not env[name].isascii() or not env[name].isdigit()
                                    or not 0 < int(env[name]) < 2**53)]
    return {"configured": not missing and not invalid, "missing": missing, "invalid": invalid}


def bounded_packets(data, depth=0, budget=None):
    """Validate before calling upstream's otherwise unbounded packet decoder."""
    budget = budget if budget is not None else [0, 0]
    budget[0] += len(data)
    if depth > 3 or budget[0] > 1024 * 1024:
        raise ValueError("packet_budget")
    offset = 0
    while offset < len(data):
        if len(data) - offset < HEADER.size:
            raise ValueError("truncated_packet")
        size, header, version, operation, sequence = HEADER.unpack_from(data, offset)
        budget[1] += 1
        if header != 16 or size < 16 or size > len(data) - offset or budget[1] > 256:
            raise ValueError("invalid_packet")
        body = data[offset + 16:offset + size]
        offset += size
        if operation == 5 and version == 2:
            inflater = zlib.decompressobj()
            raw = inflater.decompress(body, 1024 * 1024 - budget[0] + 1)
            if not inflater.eof or inflater.unused_data:
                raise ValueError("compressed_packet_budget")
            yield from bounded_packets(raw, depth + 1, budget)
        elif operation == 5 and version != 0:
            raise ValueError("unsupported_packet_version")
        else:
            yield (size, header, version, operation, sequence), body


def make_client_class():
    # --check-config works without dependencies installed and never starts a socket.
    from blivedm import OpenLiveClient
    from blivedm.clients.ws_base import AuthError, HeaderTuple

    class ReceiveOnlyClient(OpenLiveClient):
        def __init__(self, *args, expected_room, emit, **kwargs):
            super().__init__(*args, **kwargs)
            self.expected_room = expected_room
            self.emit = emit
            self.authenticated = False
            self.set_reconnect_policy(lambda retry, total: min(30, 2 ** min(retry, 5)))

        def report(self, state):
            self.emit({"type": "status", "platform": "bilibili", "state": state})

        async def init_room(self):
            self.authenticated = False
            ok = await super().init_room()
            if not ok or self.room_id != self.expected_room:
                self.report("room_or_authorization_failed")
                return False
            return True

        def _get_ws_url(self, retry_count):
            url = super()._get_ws_url(retry_count)
            parsed = urlparse(url)
            host = parsed.hostname or ""
            allowed = any(host == domain or host.endswith("." + domain)
                          for domain in ("bilibili.com", "biliapi.com", "biliapi.net"))
            if parsed.scheme != "wss" or not allowed or parsed.username or parsed.password:
                raise ValueError("unexpected_platform_endpoint")
            return url

        async def _on_ws_close(self):
            self.authenticated = False
            self.report("disconnected")
            await super()._on_ws_close()

        async def _send_game_heartbeat(self):
            ok = await super()._send_game_heartbeat()
            if not ok:
                self.authenticated = False
                self.report("application_heartbeat_failed")
                if self._websocket is not None:
                    await self._websocket.close()
            return ok

        async def _parse_ws_message(self, data):
            try:
                # Validate the entire frame before allowing any side effects.
                packets = list(bounded_packets(data))
                for values, body in packets:
                    header = HeaderTuple(*values)
                    if header.operation == 8:
                        self.authenticated = False
                        await super()._parse_business_message(header, body)
                        self.authenticated = True
                        self.report("authenticated")
                    elif header.operation == 3:
                        if self.authenticated:
                            self.report("heartbeat")
                    elif header.operation == 5:
                        await super()._parse_business_message(header, body)
            except Exception:
                self.authenticated = False
                self.report("protocol_or_authentication_failed")
                if self._websocket is not None:
                    await self._websocket.close()
                raise AuthError("platform_packet_rejected") from None

        def _handle_command(self, command):
            if not isinstance(command, dict):
                return
            if command.get("cmd") == "LIVE_OPEN_PLATFORM_INTERACTION_END":
                if command.get("data", {}).get("game_id") == self.game_id:
                    self.authenticated = False
                    self.report("interaction_ended")
                return super()._handle_command(command)
            if not self.authenticated or command.get("cmd") not in COMMANDS:
                return
            data = command.get("data")
            if not isinstance(data, dict) or data.get("room_id") != self.expected_room:
                self.report("wrong_room_event")
                return
            clean = {key: value for key, value in data.items() if key in FIELDS}
            # Never forward unknown nested payloads, profile URLs, or chat content.
            if "blind_gift" in clean:
                blind = clean["blind_gift"]
                clean["blind_gift"] = {"status": blind.get("status")} if isinstance(blind, dict) else None
            if isinstance(clean.get("msg"), str) and len(clean["msg"]) > 80:
                return
            envelope = {"type": "event", "platform": "bilibili", "family": "open-live-v2",
                        "event": {"cmd": command["cmd"], "data": clean}}
            if len(json.dumps(envelope).encode()) <= 8192:
                self.emit(envelope)

    return ReceiveOnlyClient


async def live_main(env, emit):
    import aiohttp
    logging.disable(logging.CRITICAL)  # Upstream debug/error paths can print raw packets.
    cls = make_client_class()
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10),
                                     cookie_jar=aiohttp.DummyCookieJar(), trust_env=False) as session:
        client = cls(env[REQUIRED[0]], env[REQUIRED[1]], int(env[REQUIRED[2]]), env[REQUIRED[3]],
                     expected_room=int(env[REQUIRED[4]]), emit=emit, session=session)
        client.start()
        waiter = asyncio.create_task(stop.wait())
        joined = asyncio.create_task(client.join())
        try:
            await asyncio.wait((waiter, joined), return_when=asyncio.FIRST_COMPLETED)
        finally:
            waiter.cancel()
            await client.stop_and_close()
            await asyncio.gather(waiter, joined, return_exceptions=True)
            emit({"type": "status", "platform": "bilibili", "state": "stopped"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--check-config", action="store_true")
    args = parser.parse_args()
    check = config_check(os.environ)
    if args.check_config or not args.live:
        print(json.dumps({"mode": "configuration_only", **check}))
        return 0
    if not check["configured"]:
        print(json.dumps({"mode": "not_connected", **check}))
        return 2
    def emit(event):
        print(json.dumps(event, ensure_ascii=False, separators=(",", ":")), flush=True)
    try:
        asyncio.run(live_main(os.environ, emit))
    except Exception:
        emit({"type": "status", "platform": "bilibili", "state": "bridge_failed"})
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
