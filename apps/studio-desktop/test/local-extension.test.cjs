const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { validateLocalExtensionSettings, localExtensionUrls } = require('../dist/local-extension.js');
const { validateTwitchPanelDesign } = require('../dist/panel-design.js');
const { OFFICIAL_HOSTED_EBS_URL, hostedExtensionRelayOptions, validateHostedEbsUrl, validateHostedExtensionCredentials } = require('../dist/hosted-extension.js');

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

test('validates a public hosted EBS and derives a credential-free WSS relay URL', () => {
  const credentials = validateHostedExtensionCredentials({
    schemaVersion: 1,
    ebsBaseUrl: 'https://tempest.example.com',
    installationId: '9cc1df18-d88a-4e32-aed3-cc192e751d4e',
    channelId: '123456',
    channelLogin: 'creator',
    relayToken: randomBytes(32).toString('base64url'),
    pairedAt: new Date().toISOString()
  });
  assert.equal(validateHostedEbsUrl('https://tempest.example.com/'), 'https://tempest.example.com');
  assert.equal(hostedExtensionRelayOptions(credentials).url, 'wss://tempest.example.com/v1/studio');
  assert.equal(hostedExtensionRelayOptions(credentials).channelId, '123456');
  assert.throws(() => validateHostedEbsUrl('http://tempest.example.com'), /HTTPS/);
  assert.throws(() => validateHostedEbsUrl('https://user:pass@tempest.example.com'), /credentials/);
});

test('ships the official Tempest Signal endpoint as the hosted default', () => {
  assert.equal(OFFICIAL_HOSTED_EBS_URL, 'https://signal.tempestmainframe.com');
  assert.equal(validateHostedEbsUrl(OFFICIAL_HOSTED_EBS_URL), OFFICIAL_HOSTED_EBS_URL);
});
