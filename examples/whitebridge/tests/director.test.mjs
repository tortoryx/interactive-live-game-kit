import test from 'node:test';
import assert from 'node:assert/strict';
import { Director } from '../src/director.mjs';
import { Engine } from '../src/engine.mjs';
const response = value => new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 400, output_tokens: 20 } }));
test('provider receives only game data, cannot add tools, and quota is reserved before network', async () => {
  const order = []; const engine = new Engine(); engine.ownerPrivateCanary = 'PRIVATE_CANARY';
  const director = new Director({ provider: { enabled: true, apiKey: 'test-secret-only', maxCalls: 1 }, persist: () => order.push('persist'), fetcher: async (url, init) => {
    order.push('network'); assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(init.redirect, 'error');
    const payload = JSON.parse(init.body); assert.equal(payload.store, false); assert.equal(payload.tools, undefined); assert.equal(init.body.includes('PRIVATE_CANARY'), false); assert.equal(payload.max_output_tokens, 160);
    return response({ action: 'climb', line: 'steady' });
  } });
  assert.deepEqual(await director.decide(engine, 100000), { action: 'climb', line: 'steady' }); assert.deepEqual(order, ['persist', 'network']);
  assert.equal(await director.decide(engine, 200000), null); assert.equal(director.summary().remaining, 0); assert.equal(JSON.stringify(director.summary()).includes('test-secret'), false);
});
test('failed or malformed calls still consume quota and never auto-retry', async () => {
  let calls = 0; const director = new Director({ provider: { enabled: true, apiKey: 'test-secret-only', maxCalls: 2 }, fetcher: async () => { calls++; return response({ action: 'exec', line: 'hello' }); } });
  assert.equal(await director.decide(new Engine(), 100000), null); assert.equal(director.status, 'invalid_output'); assert.equal(director.remaining(), 1); assert.equal(calls, 1);
  assert.equal(await director.decide(new Engine(), 100010), null); assert.equal(calls, 1);
});
test('storage failure prevents a paid request; abort is propagated to in-flight fetch', async () => {
  let calls = 0;
  const failing = new Director({ provider: { enabled: true, apiKey: 'test-secret-only', maxCalls: 2 }, persist: () => { throw new Error('disk'); }, fetcher: async () => { calls++; } });
  await failing.decide(new Engine(), 100000); assert.equal(calls, 0); assert.equal(failing.status, 'storage_failed');
  let started; const ready = new Promise(resolve => { started = resolve; });
  const active = new Director({ provider: { enabled: true, apiKey: 'test-secret-only', maxCalls: 2 }, fetcher: (_, init) => new Promise((resolve, reject) => { started(); init.signal.addEventListener('abort', () => reject(new Error('aborted'))); }) });
  const pending = active.decide(new Engine(), 100000); await ready; active.cancel(); assert.equal(await pending, null); assert.equal(active.busy, false);
});
