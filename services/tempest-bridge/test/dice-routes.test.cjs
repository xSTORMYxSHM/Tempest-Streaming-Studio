const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdir, mkdtemp, writeFile } = require('node:fs/promises');
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
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-dice-routes-'));
  const importedTheme = path.join(dataDirectory, 'dice-themes', 'auroraDice');
  await mkdir(importedTheme, { recursive: true });
  await writeFile(path.join(importedTheme, 'theme.config.json'), JSON.stringify({
    systemName: 'auroraDice', name: 'Aurora Dice', diceAvailable: ['d6', 'd20'],
    material: { type: 'color', diffuseTexture: 'aurora.png' }, meshFile: 'aurora.json'
  }));
  await writeFile(path.join(importedTheme, 'aurora.json'), '{}');
  await writeFile(path.join(importedTheme, 'aurora.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const runtime = await startTempestBridge({
    port: 0,
    dataDirectory,
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());

  const page = await fetch(`${runtime.baseUrl}/dice-overlay`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(page.headers.get('content-security-policy'), /script-src[^;]*'unsafe-inline'/);
  assert.match(page.headers.get('content-security-policy'), /worker-src blob: data:/);
  assert.match(page.headers.get('content-security-policy'), /media-src 'self' blob:/);
  const pageBody = await page.text();
  assert.match(pageBody, /Tempest Studio 3D Dice/);
  assert.match(pageBody, /<script src="\/dice-overlay\/client\.js\?v=[a-f0-9]{16}"><\/script>/);
  assert.doesNotMatch(pageBody, /<script defer/);

  const client = await fetch(`${runtime.baseUrl}/dice-overlay/client.js`);
  assert.equal(client.status, 200);
  const clientBody = await client.text();
  assert.match(clientBody, /window\.__tempestDiceEvents = obsRuntime \? null : new EventSource/);
  assert.match(clientBody, /new DiceBoxClass/);
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
  const woodenTheme = await fetch(`${runtime.baseUrl}/dice-overlay/assets/themes/wooden/theme.config.json`);
  assert.equal(woodenTheme.status, 200);
  assert.deepEqual((await woodenTheme.json()).diceAvailable, ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']);
  const customTheme = await fetch(`${runtime.baseUrl}/dice-overlay/assets/themes/auroraDice/theme.config.json`);
  assert.equal(customTheme.status, 200);
  assert.equal((await customTheme.json()).systemName, 'auroraDice');
  const wasm = await fetch(`${runtime.baseUrl}/dice-overlay/assets/ammo/ammo.wasm.wasm`);
  assert.equal(wasm.status, 200);
  assert.equal(wasm.headers.get('content-type'), 'application/wasm');

  assert.equal((await fetch(`${runtime.baseUrl}/v1/dice-overlay`)).status, 401);
  const stream = await fetch(`${runtime.baseUrl}/dice-overlay/events`);
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  const init = await readSseEvent(reader, decoder, 'init');

  const clientHealth = await fetch(`${runtime.baseUrl}/dice-overlay/client-status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: init.clientId, state: 'ready', theme: 'default', renderer: 'offscreen' })
  });
  assert.equal(clientHealth.status, 200);

  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  const initialStatus = await fetch(`${runtime.baseUrl}/v1/dice-overlay`, { headers });
  assert.equal(initialStatus.status, 200);
  const initialDice = await initialStatus.json();
  assert.ok(initialDice.themes.some((candidate) => candidate.id === 'gemstoneMarble'));
  assert.ok(initialDice.themes.some((candidate) => candidate.id === 'auroraDice' && candidate.custom === true));
  assert.equal(initialDice.settings.gravity, 1);
  assert.equal(initialDice.readyClients, 1);
  const settingsResponse = await fetch(`${runtime.baseUrl}/v1/dice-overlay/settings`, {
    method: 'POST', headers, body: JSON.stringify({ diceTheme: 'auroraDice', themeColor: '#44ccff', gravity: 1.2, restitution: 0.35 })
  });
  assert.equal(settingsResponse.status, 200);
  const updatedSettings = (await settingsResponse.json()).settings;
  assert.equal(updatedSettings.diceTheme, 'auroraDice');
  assert.equal(updatedSettings.gravity, 1.2);
  assert.equal(updatedSettings.restitution, 0.35);
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
  const duplicateCompletion = await fetch(`${runtime.baseUrl}/dice-overlay/result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: request.id, token: request.token, values: [2, 4, 6] })
  });
  assert.equal(duplicateCompletion.status, 200);

  const response = await rolling;
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.roll.expression, '3d6+2');
  assert.equal(result.roll.reason, 'Stream challenge');
  assert.deepEqual(result.roll.dice.map((die) => die.value), [2, 4, 6]);
  assert.equal(result.roll.total, 14);
  assert.equal(result.latestRoll.id, result.roll.id);
  assert.equal(result.history.length, 1);

  const audioTest = fetch(`${runtime.baseUrl}/v1/dice-overlay/audio/test`, { method: 'POST', headers, body: '{}' });
  const audioRequest = await readSseEvent(reader, decoder, 'audio-test');
  const audioReport = await fetch(`${runtime.baseUrl}/dice-overlay/audio-status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: init.clientId, testId: audioRequest.id, state: 'ready', method: 'media' })
  });
  assert.equal(audioReport.status, 200);
  assert.equal((await audioTest).status, 200);

  const failingRoll = fetch(`${runtime.baseUrl}/v1/dice-overlay/roll`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ expression: '1d20' })
  });
  const failureRequest = await readSseEvent(reader, decoder, 'roll-request');
  const failureReport = await fetch(`${runtime.baseUrl}/dice-overlay/error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: failureRequest.id,
      token: failureRequest.token,
      message: 'OBS callback failed.'
    })
  });
  assert.equal(failureReport.status, 200);
  const failedResponse = await failingRoll;
  assert.equal(failedResponse.status, 400);
  assert.match((await failedResponse.json()).error, /OBS callback failed/);

  await reader.cancel();
});
