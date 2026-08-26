const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { validateLocalExtensionSettings, localExtensionUrls } = require('../dist/local-extension.js');
const { validateTwitchPanelDesign } = require('../dist/panel-design.js');

test('validates one numeric channel and a base64 Extension secret', () => {
  const extensionSecret = randomBytes(32).toString('base64');
  assert.deepEqual(validateLocalExtensionSettings({ channelId: '123456789', extensionSecret }), { channelId: '123456789', extensionSecret });
  assert.throws(() => validateLocalExtensionSettings({ channelId: 'channel-name', extensionSecret }), /numeric ID/);
  assert.throws(() => validateLocalExtensionSettings({ channelId: '123456789', extensionSecret: 'not a secret!' }), /base64/);
});

test('keeps the local Extension on loopback HTTPS ports', () => {
  assert.equal(localExtensionUrls.panelUrl, 'https://localhost:8080/panel.html');
  assert.equal(localExtensionUrls.ebsUrl, 'https://localhost:8090');
});

test('validates channel-specific Twitch Panel appearance without executable code', () => {
  const design = validateTwitchPanelDesign({ brandName: 'Creator Studio', preset: 'neon', accent: '#a66bff', cornerRadius: 99, cardLayout: 'list', showSearch: false });
  assert.equal(design.brandName, 'Creator Studio');
  assert.equal(design.preset, 'neon');
  assert.equal(design.accent, '#A66BFF');
  assert.equal(design.cornerRadius, 24);
  assert.equal(design.cardLayout, 'list');
  assert.equal(design.showSearch, false);
  assert.equal(Object.hasOwn(design, 'javascript'), false);
});

test('allows Twitch Extension Supervisor to embed the local panel', async () => {
  const source = await readFile(path.join(__dirname, '..', 'dist', 'local-extension.js'), 'utf8');
  assert.match(source, /https:\/\/supervisor\.ext-twitch\.tv/);
  assert.match(source, /https:\/\/extension-files\.twitch\.tv/);
});
