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

function bitsReceipt(secret, clientId, overrides = {}) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 300,
    topic: 'bits_transaction_receipt',
    data: {
      domainId: `twitch.ext.${clientId}`,
      product: { sku: 'tempest.storm-pulse.50', cost: { amount: 50, type: 'bits' }, displayName: 'Storm Pulse' },
      time: new Date().toISOString(),
      transactionId: `tx-${randomUUID()}`,
      userId: '778899',
      ...overrides
    }
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

function waitForSocketMessage(socket, predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for the expected EBS WebSocket message.'));
    }, timeoutMs);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
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

test('keeps the 1.7 EBS compatible with the exact Studio 1.5 relay and catalog envelopes', async (context) => {
  const mainframeSecret = randomBytes(32);
  const streamingSecret = randomBytes(32);
  const relayToken = randomBytes(32).toString('hex');
  const runtime = await startTwitchEbs({
    host: '127.0.0.1', port: 0,
    twitchExtensionSecrets: [mainframeSecret.toString('base64')],
    streamingExtension: { clientId: 'streamingclient123', secrets: [streamingSecret.toString('base64')] },
    relayToken, allowedChannelIds: ['123456'], logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());

  let studio = await connectStudio(runtime, relayToken);
  context.after(() => studio.close());
  const acceptLegacyInteraction = (socket) => socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'interaction') return;
    socket.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId: message.requestId, status: 202, body: { accepted: true, studioVersion: '1.5.0' } }));
  });
  acceptLegacyInteraction(studio);

  const freeAckPromise = waitForSocketMessage(studio, (message) => message.type === 'catalog.ack' && message.extensionEdition === 'free');
  studio.send(JSON.stringify({
    protocolVersion: 1,
    type: 'catalog.sync',
    catalog: {
      schemaVersion: 1,
      extensionEdition: 'free',
      items: [{ id: 'sound-alert.legacy-pulse', name: 'Legacy Pulse', durationMs: 8000, accent: '#54F2EB', glyph: 'LP', kind: 'sound-alert' }]
    }
  }));
  const freeAck = await freeAckPromise;
  assert.equal(freeAck.revision, undefined);
  assert.deepEqual(freeAck.companions, { schemaVersion: 1, mainframe: true, streaming: false });
  assert.equal(freeAck.itemCount, 1);

  const mainframeCatalog = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(mainframeSecret) } });
  assert.equal(mainframeCatalog.status, 200);
  assert.deepEqual((await mainframeCatalog.json()).items.map((item) => item.id), ['sound-alert.legacy-pulse']);
  assert.equal((await fetch(`${runtime.baseUrl}/v1/extension/streaming/catalog`, { headers: { 'X-Extension-JWT': jwt(streamingSecret) } })).status, 409);

  const streamingAckPromise = waitForSocketMessage(studio, (message) => message.type === 'catalog.ack' && message.extensionEdition === 'bits');
  const legacyStreamingCatalog = {
    schemaVersion: 1,
    extensionEdition: 'bits',
    items: [{ id: 'tempest.legacy-action', name: 'Legacy Streaming Action', durationMs: 5000, accent: '#A66BFF', glyph: 'LS', kind: 'interaction' }]
  };
  studio.send(JSON.stringify({ protocolVersion: 1, type: 'catalog.sync', catalog: legacyStreamingCatalog }));
  const streamingAck = await streamingAckPromise;
  assert.equal(streamingAck.revision, undefined);
  assert.deepEqual(streamingAck.companions, { schemaVersion: 1, mainframe: false, streaming: true });
  assert.equal((await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(mainframeSecret) } })).status, 409);
  const streamingCatalogResponse = await fetch(`${runtime.baseUrl}/v1/extension/streaming/catalog`, { headers: { 'X-Extension-JWT': jwt(streamingSecret) } });
  assert.equal(streamingCatalogResponse.status, 200);
  assert.deepEqual((await streamingCatalogResponse.json()).items.map((item) => item.id), ['tempest.legacy-action']);

  const trigger = (requestId) => fetch(`${runtime.baseUrl}/v1/extension/streaming/interactions/tempest.legacy-action/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(streamingSecret), 'X-Request-ID': requestId },
    body: JSON.stringify({ requestId })
  });
  const accepted = await trigger(randomUUID());
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).studioVersion, '1.5.0');

  studio.close();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await fetch(`${runtime.baseUrl}/health`).then((response) => response.json())).studioConnections === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal((await trigger(randomUUID())).status, 503);

  studio = await connectStudio(runtime, relayToken);
  acceptLegacyInteraction(studio);
  const reconnectAckPromise = waitForSocketMessage(studio, (message) => message.type === 'catalog.ack' && message.extensionEdition === 'bits');
  studio.send(JSON.stringify({ protocolVersion: 1, type: 'catalog.sync', catalog: legacyStreamingCatalog }));
  await reconnectAckPromise;
  assert.equal((await trigger(randomUUID())).status, 202);
});

test('serves a private Mainframe avatar closet and equips only an unlocked viewer cosmetic', async (context) => {
  const secret = randomBytes(32);
  const relayToken = randomBytes(32).toString('hex');
  const ebs = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [secret.toString('base64')], relayToken,
    allowedChannelIds: ['123456'], logger: { info() {}, warn() {}, error() {} }
  });
  const bridge = await startTempestBridge({
    port: 0,
    dataDirectory: await mkdtemp(path.join(os.tmpdir(), 'tempest-avatar-closet-e2e-')),
    extensionRelay: { url: ebs.websocketUrl, token: relayToken, channelId: '123456' },
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(async () => { await bridge.close(); await ebs.close(); });
  const bridgeHeaders = { 'Content-Type': 'application/json', 'X-Tempest-Token': bridge.token };
  const postBridge = (route, body) => fetch(`${bridge.baseUrl}${route}`, { method: 'POST', headers: bridgeHeaders, body: JSON.stringify(body) });
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if ((await fetch(`${ebs.baseUrl}/health`).then((response) => response.json())).studioConnections === 1) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal((await postBridge('/v1/interactive-world/avatar-redeems', { redeems: [
    { id: 'red-jacket', name: 'Red Jacket', rewardId: 'reward-red', effect: 'primary-color', value: '#FF4455', persistence: 'profile', enabled: true },
    { id: 'blue-jacket', name: 'Blue Jacket', rewardId: 'reward-blue', effect: 'primary-color', value: '#4488FF', persistence: 'profile', enabled: true },
    { id: 'green-jacket', name: 'Green Jacket', rewardId: 'reward-green', effect: 'primary-color', value: '#44CC88', persistence: 'profile', enabled: true }
  ] })).status, 200);
  const redeem = (id, rewardId, title) => postBridge('/v1/integrations/twitch/events', {
    schemaVersion: 1, id, topic: 'viewer.reward.redeemed', occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: '123456' },
    viewer: { id: '778899', displayName: 'Closet Viewer' }, payload: { redemptionId: id, rewardId, rewardTitle: title, rewardCost: 1000 }
  });
  assert.equal((await redeem('closet-redemption-red', 'reward-red', 'Red Jacket')).status, 202);
  assert.equal((await redeem('closet-redemption-blue', 'reward-blue', 'Blue Jacket')).status, 202);

  const viewerToken = jwt(secret, { user_id: '778899', opaque_user_id: 'Uviewer778899' });
  const closetResponse = await fetch(`${ebs.baseUrl}/v1/extension/avatar`, { headers: { 'X-Extension-JWT': viewerToken } });
  assert.equal(closetResponse.status, 200);
  const closet = await closetResponse.json();
  assert.equal(closet.items.length, 3);
  assert.equal(closet.items.filter((item) => item.owned).length, 2);
  assert.equal(closet.items.find((item) => item.id === 'green-jacket').owned, false);
  assert.equal(closet.items.find((item) => item.id === 'blue-jacket').equipped, true);

  const requestId = randomUUID();
  const equippedResponse = await fetch(`${ebs.baseUrl}/v1/extension/avatar/equip`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken, 'X-Request-ID': requestId }, body: JSON.stringify({ requestId, redeemId: 'red-jacket' })
  });
  assert.equal(equippedResponse.status, 202);
  const lockedRequestId = randomUUID();
  const lockedResponse = await fetch(`${ebs.baseUrl}/v1/extension/avatar/equip`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken, 'X-Request-ID': lockedRequestId }, body: JSON.stringify({ requestId: lockedRequestId, redeemId: 'green-jacket' })
  });
  assert.equal(lockedResponse.status, 400);
  const world = await fetch(`${bridge.baseUrl}/v1/interactive-world`, { headers: bridgeHeaders }).then((response) => response.json());
  assert.equal(world.viewers.find((viewer) => viewer.key === 'twitch:778899').cosmetics.primaryColor, '#FF4455');
});

test('pairs public Studio installations with Twitch identity and publishes a channel-scoped catalog', async (context) => {
  const secret = randomBytes(32);
  const streamingSecret = randomBytes(32);
  const runtime = await startTwitchEbs({
    host: '127.0.0.1',
    port: 0,
    twitchExtensionSecrets: [secret.toString('base64')],
    streamingExtension: { clientId: 'streamingclient123', secrets: [streamingSecret.toString('base64')] },
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
  const catalogAcknowledged = new Promise((resolve, reject) => {
    studio.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'catalog.ack' && message.revision === '1234567890abcdef12345678') resolve(message);
      } catch (error) { reject(error); }
    });
    studio.once('error', reject);
  });
  studio.send(JSON.stringify({
    protocolVersion: 1,
    type: 'catalog.sync',
    revision: '1234567890abcdef12345678',
    catalog: {
      schemaVersion: 1,
      companions: { schemaVersion: 1, mainframe: true, streaming: true },
      items: [
        { id: 'sound-alert.creator-dance', name: 'Creator Dance', durationMs: 12000, cooldownMs: 60000, accent: '#54F2EB', glyph: 'CD', kind: 'sound-alert', destinations: ['mainframe', 'streaming'] },
        { id: 'tempest.stream-only', name: 'Stream Target', durationMs: 8000, accent: '#A66BFF', glyph: 'ST', kind: 'interaction', destinations: ['streaming'] }
      ]
    }
  }));
  const catalogAck = await catalogAcknowledged;
  assert.equal(catalogAck.extensionEdition, 'free');
  assert.deepEqual(catalogAck.companions, { schemaVersion: 1, mainframe: true, streaming: true });
  assert.equal(catalogAck.itemCount, 2);

  const deadline = Date.now() + 2000;
  let catalog;
  while (Date.now() < deadline) {
    const response = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret) } });
    catalog = await response.json();
    if (catalog.items?.length) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(catalog.items[0].id, 'sound-alert.creator-dance');
  assert.deepEqual(catalog.items.map((item) => item.id), ['sound-alert.creator-dance']);
  assert.equal(catalog.studioConnected, true);
  const streamingCatalog = await fetch(`${runtime.baseUrl}/v1/extension/streaming/catalog`, { headers: { 'X-Extension-JWT': jwt(streamingSecret) } });
  assert.equal(streamingCatalog.status, 200);
  assert.deepEqual((await streamingCatalog.json()).items.map((item) => item.id), ['sound-alert.creator-dance', 'tempest.stream-only']);
  const streamingRequestId = randomUUID();
  const streamedAction = new Promise((resolve) => {
    studio.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== 'interaction' || message.requestId !== streamingRequestId) return;
      studio.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId: message.requestId, status: 202, body: { accepted: true } }));
      resolve(message);
    });
  });
  const streamedResponse = await fetch(`${runtime.baseUrl}/v1/extension/streaming/interactions/tempest.stream-only/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(streamingSecret) },
    body: JSON.stringify({ requestId: streamingRequestId })
  });
  assert.equal(streamedResponse.status, 202);
  assert.equal((await streamedAction).event.payload.action, 'tempest.stream-only');

  const designUpdate = await fetch(`${runtime.baseUrl}/v1/installations/current/panel-design`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${installation.relayToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ panelDesign: { preset: 'neon', title: 'Creator deck', accent: '#a66bff', showSearch: false } })
  });
  assert.equal(designUpdate.status, 200);
  const savedDesign = (await designUpdate.json()).panelDesign;
  assert.equal(savedDesign.title, 'Creator deck');
  assert.equal(savedDesign.accent, '#A66BFF');
  assert.equal(savedDesign.showSearch, false);

  studio.send(JSON.stringify({
    protocolVersion: 1,
    type: 'catalog.sync',
    catalog: {
      schemaVersion: 1,
      companions: { schemaVersion: 1, mainframe: true, streaming: true },
      items: [{ id: 'sound-alert.creator-dance', name: 'Updated Creator Dance', durationMs: 12000, cooldownMs: 60000, accent: '#54F2EB', glyph: 'CD', kind: 'sound-alert', destinations: ['mainframe', 'streaming'] }]
    }
  }));
  const designDeadline = Date.now() + 2000;
  while (Date.now() < designDeadline) {
    const response = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret) } });
    catalog = await response.json();
    if (catalog.items?.[0]?.name === 'Updated Creator Dance') break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(catalog.panelDesign.title, 'Creator deck');
  assert.equal(catalog.panelDesign.accent, '#A66BFF');
  assert.equal(catalog.panelDesign.showSearch, false);

  const unauthorizedDesign = await fetch(`${runtime.baseUrl}/v1/installations/current/panel-design`, {
    method: 'PUT', headers: { Authorization: 'Bearer invalid', 'Content-Type': 'application/json' }, body: JSON.stringify({ panelDesign: {} })
  });
  assert.equal(unauthorizedDesign.status, 401);

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

test('returns a machine-readable recovery code for an unsupported Twitch application', async (context) => {
  const runtime = await startTwitchEbs({
    port: 0,
    twitchExtensionSecrets: [randomBytes(32).toString('base64')],
    installationStore: new MemoryTwitchEbsInstallationStore(),
    allowedTwitchClientIds: ['officialclient123'],
    validateTwitchOAuthToken: async () => ({ clientId: 'legacyclient123', userId: '123456', login: 'creator', scopes: [], expiresIn: 3600 }),
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());

  const response = await fetch(`${runtime.baseUrl}/v1/installations/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Twitch-OAuth': 'legacy-token' },
    body: JSON.stringify({ product: 'Tempest Streaming Studio' })
  });
  assert.equal(response.status, 403);
  const failure = await response.json();
  assert.equal(failure.code, 'TWITCH_CLIENT_NOT_ALLOWED');
  assert.match(failure.error, /application this Extension service does not accept/);
});

test('exchanges Discord RPC authorization codes without exposing the client secret', async (context) => {
  let submitted;
  const runtime = await startTwitchEbs({
    port: 0,
    twitchExtensionSecrets: [randomBytes(32).toString('base64')],
    installationStore: new MemoryTwitchEbsInstallationStore(),
    logger: { info() {}, warn() {}, error() {} },
    discordOAuth: {
      clientId: '123456789012345678',
      clientSecret: 'server-only-secret',
      redirectUri: 'https://signal.example/discord/callback',
      exchange: async (body) => {
        submitted = body;
        return new Response(JSON.stringify({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600, scope: 'rpc identify rpc.voice.read', token_type: 'Bearer' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
  });
  context.after(() => runtime.close());
  const response = await fetch(`${runtime.baseUrl}/v1/discord/oauth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grantType: 'authorization_code', clientId: '123456789012345678', code: 'one-time-code' }) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.accessToken, 'access-token');
  assert.equal(result.refreshToken, 'refresh-token');
  assert.equal(JSON.stringify(result).includes('server-only-secret'), false);
  assert.equal(submitted.get('client_secret'), 'server-only-secret');
  assert.equal(submitted.get('code'), 'one-time-code');
  const refreshed = await fetch(`${runtime.baseUrl}/v1/discord/oauth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grantType: 'refresh_token', clientId: '123456789012345678', refreshToken: 'refresh-token' }) });
  assert.equal(refreshed.status, 200);
  assert.equal(submitted.get('grant_type'), 'refresh_token');
  assert.equal(submitted.get('refresh_token'), 'refresh-token');
  const wrongClient = await fetch(`${runtime.baseUrl}/v1/discord/oauth/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grantType: 'authorization_code', clientId: 'wrong', code: 'one-time-code' }) });
  assert.equal(wrongClient.status, 400);
});

test('verifies Twitch Bits receipts and relays only mapped published interactions', async (context) => {
  const freeSecret = randomBytes(32);
  const bitsSecret = randomBytes(32);
  const clientId = 'bitsext123';
  const relayToken = randomBytes(32).toString('hex');
  const store = new MemoryTwitchEbsInstallationStore();
  const runtime = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [freeSecret.toString('base64')], relayToken,
    allowedChannelIds: ['123456'], installationStore: store,
    bitsExtension: {
      clientId,
      secrets: [bitsSecret.toString('base64')],
      products: {
        'tempest.storm-pulse.50': { action: 'tempest.storm-pulse', bits: 50 },
        'tempest.not-paid-audio.100': { action: 'sound-alert.hype-pulse', bits: 100 }
      }
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  const installation = await store.findActiveByChannelId('123456');
  await store.updateCatalog(installation.id, {
    schemaVersion: 1,
    extensionEdition: 'bits',
    updatedAt: new Date().toISOString(),
    panelDesign: { schemaVersion: 1, preset: 'neon', brandName: 'TEMPEST STREAMING', eyebrow: 'PAID SIGNALS', title: 'Shape the stream', accent: '#A66BFF', background: '#05090E', surface: '#09131B', text: '#ECF9FF', muted: '#79919D', font: 'inter', cardLayout: 'list', density: 'compact', cornerRadius: 12, showLogo: true, showStatus: true, showSearch: false, showFilters: false, showPattern: true, uppercaseLabels: true },
    items: [
      { id: 'tempest.storm-pulse', name: 'Storm Pulse', kind: 'interaction', durationMs: 8000, viewerCooldownMs: 1000, globalCooldownMs: 1000, category: 'screen-effect', placementMode: 'fixed', access: { mode: 'specific-viewers', allowedViewerIds: ['778899'], blockedViewerIds: [], hideWhenLocked: false }, accent: '#54F2EB', glyph: 'SP' },
      { id: 'sound-alert.hype-pulse', name: 'Hype Pulse', kind: 'sound-alert', durationMs: 8000, accent: '#A66BFF', glyph: 'HP' }
    ]
  });
  const studio = await connectStudio(runtime, relayToken);
  context.after(() => studio.close());
  let relayed;
  studio.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'interaction') return;
    relayed = message;
    studio.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId: message.requestId, status: 202, body: { accepted: true } }));
  });
  const viewerToken = jwt(bitsSecret, { user_id: '778899' });
  const catalog = await fetch(`${runtime.baseUrl}/v1/extension/bits/catalog`, { headers: { 'X-Extension-JWT': viewerToken } });
  assert.equal(catalog.status, 200);
  const catalogBody = await catalog.json();
  assert.deepEqual(catalogBody.products.map((product) => product.sku), ['tempest.storm-pulse.50']);
  assert.equal(catalogBody.panelDesign.title, 'Shape the stream');
  assert.equal(catalogBody.panelDesign.cardLayout, 'list');
  const lockedToken = jwt(bitsSecret, { user_id: '111222' });
  const lockedCatalog = await fetch(`${runtime.baseUrl}/v1/extension/bits/catalog`, { headers: { 'X-Extension-JWT': lockedToken } }).then((result) => result.json());
  assert.equal(lockedCatalog.products[0].eligibility.allowed, false);
  assert.match(lockedCatalog.products[0].eligibility.reason, /selected viewers/i);
  const lockedReservation = await fetch(`${runtime.baseUrl}/v1/extension/bits/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': lockedToken }, body: JSON.stringify({ sku: 'tempest.storm-pulse.50' }) });
  assert.equal(lockedReservation.status, 403);
  const inactiveFreeEdition = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(freeSecret) } });
  assert.equal(inactiveFreeEdition.status, 409);
  assert.deepEqual((await inactiveFreeEdition.json()).activeCompanions, { schemaVersion: 1, mainframe: false, streaming: true });

  const reservationResponse = await fetch(`${runtime.baseUrl}/v1/extension/bits/reservations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ sku: 'tempest.storm-pulse.50' })
  });
  assert.equal(reservationResponse.status, 201);
  const reservation = await reservationResponse.json();
  const receipt = bitsReceipt(bitsSecret, clientId);
  const response = await fetch(`${runtime.baseUrl}/v1/extension/bits/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ transactionReceipt: receipt, reservationToken: reservation.reservationToken })
  });
  assert.equal(response.status, 202);
  assert.equal(relayed.event.viewer.id, '778899');
  assert.equal(relayed.event.payload.action, 'tempest.storm-pulse');
  assert.equal(relayed.event.payload.bits, 50);
  assert.equal(relayed.event.payload.paymentSource, 'twitch.bits-extension');

  const replay = await fetch(`${runtime.baseUrl}/v1/extension/bits/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ transactionReceipt: receipt })
  });
  assert.equal(replay.status, 202);

  const wrongAmount = bitsReceipt(bitsSecret, clientId, { product: { sku: 'tempest.storm-pulse.50', cost: { amount: 100, type: 'bits' } } });
  const rejectedAmount = await fetch(`${runtime.baseUrl}/v1/extension/bits/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ transactionReceipt: wrongAmount })
  });
  assert.equal(rejectedAmount.status, 403);

  const audioReceipt = bitsReceipt(bitsSecret, clientId, { product: { sku: 'tempest.not-paid-audio.100', cost: { amount: 100, type: 'bits' } } });
  const rejectedAudio = await fetch(`${runtime.baseUrl}/v1/extension/bits/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ transactionReceipt: audioReceipt })
  });
  assert.equal(rejectedAudio.status, 403);
});

test('persists a paid interaction while Studio is offline and redelivers it after restart', async () => {
  const freeSecret = randomBytes(32);
  const bitsSecret = randomBytes(32);
  const clientId = 'bitsext123';
  const relayToken = randomBytes(32).toString('hex');
  const store = new MemoryTwitchEbsInstallationStore();
  const options = () => ({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [freeSecret.toString('base64')], relayToken,
    allowedChannelIds: ['123456'], installationStore: store,
    bitsExtension: { clientId, secrets: [bitsSecret.toString('base64')], products: { 'tempest.storm-pulse.50': { action: 'tempest.storm-pulse', bits: 50 } } },
    logger: { info() {}, warn() {}, error() {} }
  });
  let runtime = await startTwitchEbs(options());
  const installation = await store.findActiveByChannelId('123456');
  await store.updateCatalog(installation.id, {
    schemaVersion: 1, extensionEdition: 'bits', updatedAt: new Date().toISOString(),
    items: [{ id: 'tempest.storm-pulse', name: 'Storm Pulse', kind: 'interaction', durationMs: 8000, viewerCooldownMs: 1000, globalCooldownMs: 1000, category: 'screen-effect', placementMode: 'fixed', access: { mode: 'everyone', allowedViewerIds: [], blockedViewerIds: [], hideWhenLocked: false }, accent: '#54F2EB', glyph: 'SP' }]
  });
  const studio = await connectStudio(runtime, relayToken);
  const viewerToken = jwt(bitsSecret, { user_id: '778899' });
  const reservationResponse = await fetch(`${runtime.baseUrl}/v1/extension/bits/reservations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ sku: 'tempest.storm-pulse.50' })
  });
  const reservation = await reservationResponse.json();
  await new Promise((resolve) => { studio.once('close', resolve); studio.close(); });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await fetch(`${runtime.baseUrl}/v1/extension/bits/catalog`, { headers: { 'X-Extension-JWT': viewerToken } }).then((response) => response.json());
    if (!status.studioConnected) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const receipt = bitsReceipt(bitsSecret, clientId);
  const queuedResponse = await fetch(`${runtime.baseUrl}/v1/extension/bits/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ transactionReceipt: receipt, reservationToken: reservation.reservationToken })
  });
  assert.equal(queuedResponse.status, 202);
  assert.equal((await queuedResponse.json()).queued, true);
  await runtime.close();

  runtime = await startTwitchEbs(options());
  try {
    let deliveryCount = 0;
    const delivered = new Promise((resolve, reject) => {
      const socket = new WebSocket(runtime.websocketUrl, { headers: { Authorization: `Bearer ${relayToken}`, 'X-Tempest-Channel-Id': '123456' } });
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type !== 'interaction') return;
        deliveryCount += 1;
        socket.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId: message.requestId, status: 202, body: { accepted: true } }));
        resolve({ socket, message });
      });
      socket.once('error', reject);
    });
    const { socket, message } = await delivered;
    assert.equal(message.event.payload.transactionId.startsWith('tx-'), true);
    const replay = await fetch(`${runtime.baseUrl}/v1/extension/bits/transactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ transactionReceipt: receipt })
    });
    assert.equal(replay.status, 202);
    assert.equal((await replay.json()).accepted, true);
    assert.equal(deliveryCount, 1);
    socket.close();
  } finally {
    await runtime.close();
  }
});

test('links a verified Kick broadcaster and relays signed chat webhooks to its paired Studio', async (context) => {
  const secret = randomBytes(32);
  const runtime = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [secret.toString('base64')],
    installationStore: new MemoryTwitchEbsInstallationStore(),
    validateTwitchOAuthToken: async () => ({ clientId: 'publicclient123', userId: '123456', login: 'creator', scopes: [], expiresIn: 3600 }),
    validateKickOAuthToken: async (token) => {
      assert.equal(token, 'kick-user-token');
      return { userId: '445566', username: 'kickcreator' };
    },
    verifyKickWebhook: (messageId, timestamp, rawBody, signature) => {
      assert.equal(messageId, '01KICKEVENT000000000000001');
      assert.equal(timestamp, '2026-09-12T12:00:00Z');
      assert.equal(signature, 'verified-test-signature');
      assert.match(rawBody.toString('utf8'), /kick-message-1/);
      return true;
    },
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  const pairing = await fetch(`${runtime.baseUrl}/v1/installations/pair`, { method: 'POST', headers: { 'X-Twitch-OAuth': 'twitch-user-token' } });
  const installation = await pairing.json();
  const linked = await fetch(`${runtime.baseUrl}/v1/installations/current/kick`, { method: 'PUT', headers: { Authorization: `Bearer ${installation.relayToken}`, 'X-Kick-OAuth': 'kick-user-token' } });
  assert.equal(linked.status, 200);
  assert.equal((await linked.json()).kick.username, 'kickcreator');

  const studio = await connectStudio(runtime, installation.relayToken);
  context.after(() => studio.close());
  const relayed = new Promise((resolve, reject) => {
    studio.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type !== 'kick.event') return;
      studio.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId: message.requestId, status: 202, body: { accepted: true, eventId: 'kick:kick-message-1' } }));
      resolve(message);
    });
    studio.on('error', reject);
  });
  const payload = {
    message_id: 'kick-message-1', content: '!studio', created_at: '2026-09-12T12:00:00Z',
    broadcaster: { user_id: 445566, username: 'kickcreator', channel_slug: 'kickcreator' },
    sender: { user_id: 778899, username: 'viewer', channel_slug: 'viewer', identity: { badges: [] } }
  };
  const response = await fetch(`${runtime.baseUrl}/v1/kick/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Kick-Event-Message-Id': '01KICKEVENT000000000000001',
      'Kick-Event-Message-Timestamp': '2026-09-12T12:00:00Z', 'Kick-Event-Signature': 'verified-test-signature',
      'Kick-Event-Type': 'chat.message.sent', 'Kick-Event-Version': '1'
    },
    body: JSON.stringify(payload)
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).eventId, 'kick:kick-message-1');
  assert.equal((await relayed).event.event.message_id, 'kick-message-1');
});
