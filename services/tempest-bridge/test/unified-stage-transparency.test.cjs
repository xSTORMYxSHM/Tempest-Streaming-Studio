const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { startTempestBridge } = require('../dist');

test('keeps Unified Stage documents transparent when Chromium composites them as iframes', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-unified-stage-transparency-'));
  const runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  context.after(() => runtime.close());
  const paths = [
    '/unified-stage?orientation=horizontal',
    '/interactive-stage?orientation=horizontal',
    '/visual-alerts/twitch?orientation=horizontal',
    '/visual-alerts/interactions?orientation=horizontal&audio=0',
    '/twitch-experiences',
    '/chat-overlay',
    '/emote-wall',
    '/dice-overlay',
    '/discord-voice',
    '/poll-overlay'
  ];
  for (const route of paths) {
    const response = await fetch(`${runtime.baseUrl}${route}`);
    assert.equal(response.status, 200, route);
    const document = await response.text();
    assert.match(document, /background\s*:\s*transparent/i, `${route} must explicitly retain a transparent canvas`);
    assert.doesNotMatch(document, /color-scheme\s*:\s*dark/i, `${route} must not force Chromium's iframe canvas opaque`);
  }
});
