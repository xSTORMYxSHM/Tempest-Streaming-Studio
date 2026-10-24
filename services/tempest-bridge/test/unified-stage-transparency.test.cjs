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

  const unifiedDocument = await fetch(`${runtime.baseUrl}/unified-stage?orientation=horizontal`).then((response) => response.text());
  assert.match(unifiedDocument, /interactiveStage:\{path:'\/interactive-stage',query:\{orientation\},layer:20,host:'alternate'\}/,
    'the interactive avatar canvas must cross an origin boundary for OBS CEF transparent compositing');
  assert.match(unifiedDocument, /emoteWall:\{path:'\/emote-wall',layer:30,host:'alternate',guarded:true\}/,
    'the full-canvas emote renderer must be health guarded');
  assert.match(unifiedDocument, /iframe\[data-guarded="true"\]\{opacity:0;visibility:hidden\}/,
    'a guarded renderer must fail transparent before it reports ready');
  assert.match(unifiedDocument, /event\.data\.type!=='tempest\.module\.heartbeat'/,
    'Unified Stage must receive renderer heartbeats');
  assert.match(unifiedDocument, /if\(now-last>7500\)recover\(id\)/,
    'Unified Stage must automatically recover an unresponsive guarded renderer');

  const emoteWallDocument = await fetch(`${runtime.baseUrl}/emote-wall`).then((response) => response.text());
  assert.match(emoteWallDocument, /parent\.postMessage\(\{type:'tempest\.module\.heartbeat',module:'emoteWall'\},'\*'\)/,
    'the Emote Wall must report renderer health to Unified Stage');
  assert.match(emoteWallDocument, /setInterval\(heartbeat,1500\)/,
    'the Emote Wall heartbeat must continue after initial load');
});
