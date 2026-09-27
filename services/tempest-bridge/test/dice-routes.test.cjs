const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startTempestBridge } = require('../dist');

async function readSseEvent(reader, decoder, eventName) {
  let buffered = '';
  for (let index = 0; index < 20; index++) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const events = buffered.split('\n\n');
    buffered = events.pop() || '';
    for (const event of events) {
      const lines = event.split('\n');
      if (lines[0] === `event: ${eventName}` && lines[1]?.startsWith('data: ')) return JSON.parse(lines[1].slice(6));
    }
  }
  throw new Error(`SSE event ${eventName} was not received.`);
}

test('serves bundled Dice Box physics locally and accepts only authenticated roll controls', async (context) => {
  const runtime = await startTempestBridge({
    port: 0,
    dataDirectory: await mkdtemp(path.join(os.tmpdir(), 'tempest-dice-routes-')),
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());

  const page = await fetch(`${runtime.baseUrl}/dice-overlay`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(page.headers.get('content-security-policy'), /worker-src blob: data:/);
  assert.match(page.headers.get('content-security-policy'), /media-src 'self' blob:/);
  assert.match(await page.text(), /Tempest Studio 3D Dice/);

  const client = await fetch(`${runtime.baseUrl}/dice-overlay/client.js`);
  assert.equal(client.status, 200);
  assert.match(await client.text(), /new DiceBox/);
  const vendor = await fetch(`${runtime.baseUrl}/dice-overlay/vendor/dice-box.es.min.js`);
  assert.equal(vendor.status, 200);
  assert.match(await vendor.text(), /OffscreenCanvas/);
  const world = await fetch(`${runtime.baseUrl}/dice-overlay/vendor/world.offscreen.min.js`);
  assert.equal(world.status, 200);
  assert.ok((await world.text()).length > 1_000_000);
  const dice = await fetch(`${runtime.baseUrl}/dice-overlay/vendor/Dice.min.js`);
  assert.equal(dice.status, 200);
  const theme = await fetch(`${runtime.baseUrl}/dice-overlay/assets/themes/default/theme.config.json`);
  assert.equal(theme.status, 200);
  assert.deepEqual((await theme.json()).diceAvailable, ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
  const wasm = await fetch(`${runtime.baseUrl}/dice-overlay/assets/ammo/ammo.wasm.wasm`);
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');

  assert.equal((await fetch(`${runtime.baseUrl}/v1/dice-overlay`)).status, 401);
  const stream = await fetch(`${runtime.baseUrl}/dice-overlay/events`);
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  await readSseEvent(reader, decoder, 'init');

  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  const rolling = fetch(`${runtime.baseUrl}/v1/dice-overlay/roll`, {
    method: 'POST', headers, body: JSON.stringify({ expression: '3d6+2', reason: 'Stream challenge', rollerName: 'Operator' })
  });
  const request = await readSseEvent(reader, decoder, 'roll-request');
  assert.equal(request.count, 3);
  assert.equal(request.physicalSides, 6);
  const completion = await fetch(`${runtime.baseUrl}/dice-overlay/result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: request.id, token: request.token, values: [2, 4, 6] })
  });
  assert.equal(completion.status, 200);

  const response = await rolling;
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.roll.expression, '3d6+2');
  assert.equal(result.roll.reason, 'Stream challenge');
  assert.deepEqual(result.roll.dice.map((die) => die.value), [2, 4, 6]);
  assert.equal(result.roll.total, 14);
  assert.equal(result.latestRoll.id, result.roll.id);
  assert.equal(result.history.length, 1);
  await reader.cancel();
});
