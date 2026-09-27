const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startTempestBridge } = require('../dist');

test('serves a credential-free local dice canvas behind authenticated roll controls', async (context) => {
  const runtime = await startTempestBridge({
    port: 0,
    dataDirectory: await mkdtemp(path.join(os.tmpdir(), 'tempest-dice-routes-')),
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());

  const page = await fetch(`${runtime.baseUrl}/dice-overlay`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(page.headers.get('content-security-policy'), /media-src blob:/);
  assert.match(await page.text(), /Tempest Studio 3D Dice/);

  assert.equal((await fetch(`${runtime.baseUrl}/v1/dice-overlay`)).status, 401);
  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  const response = await fetch(`${runtime.baseUrl}/v1/dice-overlay/roll`, {
    method: 'POST', headers, body: JSON.stringify({ expression: '3d6+2', reason: 'Stream challenge', rollerName: 'Operator' })
  });
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.equal(result.roll.expression, '3d6+2');
  assert.equal(result.roll.reason, 'Stream challenge');
  assert.equal(result.roll.dice.length, 3);
  assert.equal(result.latestRoll.id, result.roll.id);
  assert.equal(result.history.length, 1);
});
