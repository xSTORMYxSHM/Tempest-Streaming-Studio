const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const { MemoryTwitchEbsInstallationStore, startTwitchEbs } = require('../dist');
const { startTempestBridge } = require('@tempest/bridge');

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function jwt(secret, overrides = {}) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    channel_id: '123456',
    exp: Math.floor(Date.now() / 1000) + 300,
    opaque_user_id: 'Uviewer123',
    role: 'viewer',
    ...overrides
  }));
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function connectStudio(runtime, relayToken, channelId = '123456') {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(runtime.websocketUrl, {
      headers: { Authorization: `Bearer ${relayToken}`, 'X-Tempest-Channel-Id': channelId }
    });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function postAlert(runtime, token, requestId = randomUUID(), alertId = 'sound-alert.hype-pulse') {
  return fetch(`${runtime.baseUrl}/v1/extension/alerts/${encodeURIComponent(alertId)}/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': token, 'X-Request-ID': requestId },
    body: JSON.stringify({ requestId, alertId })
  });
}

test('verifies Twitch JWTs and relays a normalized Sound Alert interaction to Studio', async (context) => {
  const secret = randomBytes(32);
  const relayToken = randomBytes(32).toString('hex');
  const runtime = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [secret.toString('base64')], relayToken,
    allowedChannelIds: ['123456'], logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  const studio = await connectStudio(runtime, relayToken);
  context.after(() => studio.close());

  let relayed;
  studio.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'interaction') return;
    relayed = message;
    studio.send(JSON.stringify({
      protocolVersion: 1,
      type: 'result',
      requestId: message.requestId,
      status: 202,
      body: { accepted: true, alert: { durationMs: 8000, viewerCooldownMs: 60000, globalCooldownMs: 8000 } }
    }));
  });

  const requestId = randomUUID();
  const response = await postAlert(runtime, jwt(secret), requestId);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).cooldownMs, 60000);
  assert.equal(relayed.event.channel.id, '123456');
  assert.equal(relayed.event.viewer.id, 'Uviewer123');
  assert.equal(relayed.event.payload.action, 'sound-alert.hype-pulse');
  assert.equal(relayed.event.payload.alertId, 'sound-alert.hype-pulse');

  const replay = await postAlert(runtime, jwt(secret), requestId);
  assert.equal(replay.status, 202);
  assert.equal((await replay.json()).cooldownMs, 60000);
});

test('rejects invalid signatures, unapproved channels, and anonymous viewers', async (context) => {
  const secret = randomBytes(32);
  const runtime = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [secret.toString('base64')], relayToken: randomBytes(32).toString('hex'),
    allowedChannelIds: ['123456'], logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());

  assert.equal((await postAlert(runtime, jwt(randomBytes(32)))).status, 401);
  assert.equal((await postAlert(runtime, jwt(secret, { channel_id: '999999' }))).status, 403);
  assert.equal((await postAlert(runtime, jwt(secret, { opaque_user_id: 'Aanonymous123' }))).status, 403);
});

test('reports Studio offline and protects generic interactions with an action allowlist', async (context) => {
  const secret = randomBytes(32);
  const relayToken = randomBytes(32).toString('hex');
  const runtime = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [secret.toString('base64')], relayToken,
    allowedChannelIds: ['123456'], allowedActions: ['tempest.blackhole'], logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  assert.equal((await postAlert(runtime, jwt(secret))).status, 503);

  const forbidden = await fetch(`${runtime.baseUrl}/v1/extension/interactions/tempest.not-allowed/trigger`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(secret) }, body: JSON.stringify({ requestId: randomUUID() })
  });
  assert.equal(forbidden.status, 403);
});

test('carries a Twitch-signed alert through the real Studio relay and Bridge gateway', async (context) => {
  const secret = randomBytes(32);
  const relayToken = randomBytes(32).toString('hex');
  const ebs = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [secret.toString('base64')], relayToken,
    allowedChannelIds: ['123456'], logger: { info() {}, warn() {}, error() {} }
  });
  const bridge = await startTempestBridge({
    port: 0,
    dataDirectory: await mkdtemp(path.join(os.tmpdir(), 'tempest-extension-e2e-')),
    extensionRelay: { url: ebs.websocketUrl, token: relayToken, channelId: '123456' },
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(async () => {
    await bridge.close();
    await ebs.close();
  });

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const health = await fetch(`${ebs.baseUrl}/health`).then((response) => response.json());
    if (health.studioConnections === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal((await fetch(`${ebs.baseUrl}/health`).then((response) => response.json())).studioConnections, 1);

  const response = await postAlert(ebs, jwt(secret), randomUUID(), 'sound-alert.hype-pulse');
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.equal(result.alert.id, 'sound-alert.hype-pulse');
  assert.equal(result.run.source, 'twitch.extension');
  assert.equal(result.cooldownMs, 60000);

  const twitchStatus = await fetch(`${bridge.baseUrl}/v1/integrations/twitch`, {
    headers: { 'X-Tempest-Token': bridge.token }
  }).then((bridgeResponse) => bridgeResponse.json());
  assert.equal(twitchStatus.acceptedEvents, 1);
  assert.equal(twitchStatus.connections.extensionRelay, 'connected');
});

test('pairs public Studio installations with Twitch identity and publishes a channel-scoped catalog', async (context) => {
  const secret = randomBytes(32);
  const runtime = await startTwitchEbs({
    host: '127.0.0.1',
    port: 0,
    twitchExtensionSecrets: [secret.toString('base64')],
    installationStore: new MemoryTwitchEbsInstallationStore(),
    allowedTwitchClientIds: ['publicclient123'],
    validateTwitchOAuthToken: async (token) => {
      assert.equal(token, 'broadcaster-oauth-token');
      return { clientId: 'publicclient123', userId: '123456', login: 'creator', scopes: [], expiresIn: 3600 };
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());

  const pairing = await fetch(`${runtime.baseUrl}/v1/installations/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Twitch-OAuth': 'broadcaster-oauth-token' },
    body: JSON.stringify({ product: 'Tempest Streaming Studio' })
  });
  assert.equal(pairing.status, 201);
  const installation = await pairing.json();
  assert.equal(installation.channel.login, 'creator');
  assert.ok(installation.relayToken.length >= 32);

  const studio = await connectStudio(runtime, installation.relayToken);
  context.after(() => studio.close());
  studio.send(JSON.stringify({
    protocolVersion: 1,
    type: 'catalog.sync',
    catalog: {
      schemaVersion: 1,
      items: [{ id: 'sound-alert.creator-dance', name: 'Creator Dance', durationMs: 12000, cooldownMs: 60000, accent: '#54F2EB', glyph: 'CD', kind: 'sound-alert' }]
    }
  }));

  const deadline = Date.now() + 2000;
  let catalog;
  while (Date.now() < deadline) {
    const response = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret) } });
    catalog = await response.json();
    if (catalog.items?.length) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(catalog.items[0].id, 'sound-alert.creator-dance');
  assert.equal(catalog.studioConnected, true);

  const unknownAlert = await postAlert(runtime, jwt(secret), randomUUID(), 'sound-alert.not-published');
  assert.equal(unknownAlert.status, 404);
  assert.equal((await postAlert(runtime, jwt(secret, { channel_id: '999999' }))).status, 403);

  const status = await fetch(`${runtime.baseUrl}/v1/installations/current`, { headers: { Authorization: `Bearer ${installation.relayToken}` } });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).channel.id, '123456');

  const revoked = await fetch(`${runtime.baseUrl}/v1/installations/current`, { method: 'DELETE', headers: { Authorization: `Bearer ${installation.relayToken}` } });
  assert.equal(revoked.status, 200);
  assert.equal((await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret) } })).status, 403);
});
