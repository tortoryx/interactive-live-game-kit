import asyncio
import hashlib
import hmac
import json
import logging
from pathlib import Path
import struct
import sys
import time
import unittest
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'modules' / 'connectors'))
from bilibili_bridge import bounded_packets, config_check, make_client_class
import aiohttp
from aiohttp import web

logging.disable(logging.CRITICAL)


def packet(body, operation=5, version=0):
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    return struct.pack('>IHHII', len(raw) + 16, 16, version, operation, 1) + raw


def gift(room=42):
    return {'cmd': 'LIVE_OPEN_PLATFORM_SEND_GIFT', 'data': {
        'room_id': room, 'msg_id': 'fixture-gift-1', 'open_id': 'fixture-viewer',
        'timestamp': int(time.time()), 'gift_id': 123, 'gift_num': 2, 'paid': True,
        'uname': 'DO_NOT_FORWARD_PROFILE', 'uface': 'https://example.invalid/private',
    }}


class PacketTests(unittest.TestCase):
    def test_bounded_decompression_and_invalid_frames(self):
        self.assertEqual(len(list(bounded_packets(packet(zlib.compress(packet(gift()) * 2), version=2)))), 2)
        for data in (packet(gift())[:-1], packet(zlib.compress(b'x' * 2000000), version=2),
                     packet(gift(), version=3), struct.pack('>IHHII', 0, 16, 0, 5, 1)):
            with self.assertRaises(ValueError):
                list(bounded_packets(data))

    def test_configuration_check_returns_field_names_only(self):
        result = config_check({'BILI_OPEN_ACCESS_KEY_ID': 'SECRET_SENTINEL', 'BILI_OPEN_APP_ID': 'bad'})
        self.assertFalse(result['configured'])
        self.assertNotIn('SECRET_SENTINEL', json.dumps(result))
        self.assertIn('BILI_OPEN_APP_ID', result['invalid'])


class ConnectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_local_http_and_websocket_use_upstream_signing_auth_heartbeats_and_end(self):
        events, calls, signatures = [], [], []
        received = asyncio.Event()
        secret = 'fixture-access-secret'
        address = {}

        async def api(request):
            body = await request.read()
            calls.append(request.path)
            headers = {key.lower(): value for key, value in request.headers.items()
                       if key.lower().startswith('x-bili-')}
            signature = hmac.new(secret.encode(), '\n'.join(f'{k}:{v}' for k, v in sorted(headers.items())).encode(), hashlib.sha256).hexdigest()
            signatures.append(signature == request.headers.get('Authorization') and headers['x-bili-content-md5'] == hashlib.md5(body).hexdigest())
            if request.path.endswith('/start'):
                return web.json_response({'code': 0, 'data': {
                    'game_info': {'game_id': 'fixture-game'},
                    'websocket_info': {'wss_link': [address['ws']], 'auth_body': '{"key":"fixture-ws-token"}'},
                    'anchor_info': {'room_id': 42, 'uid': 123, 'open_id': 'fixture-anchor'},
                }})
            return web.json_response({'code': 0, 'data': {}})

        async def socket(request):
            ws = web.WebSocketResponse()
            await ws.prepare(request)
            # A valid-looking event before the AUTH_REPLY is not accepted.
            await ws.send_bytes(packet(gift()))
            async for message in ws:
                if message.type != aiohttp.WSMsgType.BINARY:
                    continue
                operation = struct.unpack_from('>I', message.data, 8)[0]
                if operation == 7:
                    self.assertEqual(json.loads(message.data[16:])['key'], 'fixture-ws-token')
                    await ws.send_bytes(packet({'code': 0}, operation=8, version=1))
                elif operation == 2:
                    await ws.send_bytes(packet((0).to_bytes(4, 'big'), operation=3, version=1))
                    await ws.send_bytes(packet(zlib.compress(packet(gift()) + packet(gift(room=9))), version=2))
            return ws

        app = web.Application()
        app.router.add_post('/v2/app/{action}', api)
        app.router.add_get('/ws', socket)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '127.0.0.1', 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        address['http'] = f'http://127.0.0.1:{port}'
        address['ws'] = f'ws://127.0.0.1:{port}/ws'
        base = make_client_class()

        class LocalFixtureClient(base):
            # Only this test rewrites fixed production URLs to a loopback server.
            def _request_open_live(self, url, body):
                return super()._request_open_live(address['http'] + '/v2/app/' + url.rsplit('/', 1)[-1], body)

            def _get_ws_url(self, retry_count):
                return address['ws']

        def emit(event):
            events.append(event)
            if event['type'] == 'event':
                received.set()

        try:
            async with aiohttp.ClientSession(cookie_jar=aiohttp.DummyCookieJar(), trust_env=False) as session:
                client = LocalFixtureClient('fixture-id', secret, 12, 'fixture-anchor-code',
                                            expected_room=42, emit=emit, session=session)
                client.start()
                try:
                    await asyncio.wait_for(received.wait(), 5)
                    self.assertTrue(await client._send_game_heartbeat())
                finally:
                    await client.stop_and_close()
            actual = [e for e in events if e['type'] == 'event']
            self.assertEqual(len(actual), 1)  # pre-auth and wrong-room messages rejected
            self.assertEqual(actual[0]['event']['data']['gift_num'], 2)
            for private in ('DO_NOT_FORWARD_PROFILE', 'example.invalid', secret, 'fixture-ws-token'):
                self.assertNotIn(private, json.dumps(events))
            for action in ('start', 'heartbeat', 'end'):
                self.assertIn('/v2/app/' + action, calls)
            self.assertTrue(all(signatures))
            self.assertFalse(client.authenticated)
        finally:
            await runner.cleanup()

    async def test_production_endpoint_and_failed_auth_are_rejected(self):
        events = []
        async with aiohttp.ClientSession() as session:
            client = make_client_class()('fixture', 'fixture-secret', 12, 'fixture-code',
                                        expected_room=42, emit=events.append, session=session)
            try:
                for url in ('ws://broadcast.chat.bilibili.com/sub', 'wss://bilibili.com.attacker.invalid/sub', 'wss://user@broadcast.chat.bilibili.com/sub'):
                    client._host_server_url_list = [url]
                    with self.assertRaises(ValueError):
                        client._get_ws_url(0)
                with self.assertRaises(Exception):
                    await client._parse_ws_message(packet({'code': -101}, operation=8, version=1))
                self.assertFalse(client.authenticated)
                client._handle_command(gift())
                self.assertFalse(any(e['type'] == 'event' for e in events))
            finally:
                await client.close()


if __name__ == '__main__':
    unittest.main()
