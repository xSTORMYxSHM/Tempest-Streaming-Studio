const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac, randomBytes, randomUUID } = require('node:crypto');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const { MemoryTwitchEbsInstallationStore, SlidingWindowLimiter, maximumStudioWebSocketPayloadBytes, startTwitchEbs } = require('../dist');
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

test('bounds and expires dormant rate-limit identities', () => {
  const limiter = new SlidingWindowLimiter(3, 60_000);
  assert.equal(limiter.consume('viewer-a', 1, 1_000), 0);
  assert.equal(limiter.consume('viewer-b', 1, 1_001), 0);
  assert.equal(limiter.consume('viewer-c', 1, 1_002), 0);
  assert.equal(limiter.entryCount, 3);
  assert.equal(limiter.consume('viewer-d', 1, 1_003), 0);
  assert.equal(limiter.entryCount, 3);
  assert.ok(limiter.consume('viewer-d', 1, 1_003) > 0);
  assert.equal(limiter.consume('viewer-new', 1, 61_004), 0);
  assert.equal(limiter.entryCount, 1);
});

test('accepts a bounded access-controlled catalog larger than the legacy 64 KiB relay ceiling', async (context) => {
  const secret = randomBytes(32);
  const relayToken = randomBytes(32).toString('hex');
  const runtime = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [secret.toString('base64')], relayToken,
    allowedChannelIds: ['123456'], logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  const studio = await connectStudio(runtime, relayToken);
  context.after(() => studio.close());
  const viewerIds = Array.from({ length: 100 }, (_, index) => String(1_000_000 + index));
  const items = Array.from({ length: 100 }, (_, index) => ({
    id: `sound-alert.access-${index}`,
    name: `Access-controlled alert ${index}`,
    durationMs: 5_000,
    accent: '#54F2EB',
    glyph: 'AC',
    kind: 'sound-alert',
    access: { mode: 'specific-viewers', allowedViewerIds: viewerIds, blockedViewerIds: viewerIds.slice(50), hideWhenLocked: false }
  }));
  const payload = JSON.stringify({ protocolVersion: 1, type: 'catalog.sync', catalog: { schemaVersion: 1, items } });
  assert.ok(Buffer.byteLength(payload) > 64 * 1024);
  assert.ok(Buffer.byteLength(payload) < maximumStudioWebSocketPayloadBytes);
  studio.send(payload);

  const deadline = Date.now() + 2_000;
  let catalog;
  while (Date.now() < deadline) {
    catalog = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: viewerIds[0] }) } }).then((response) => response.json());
    if (catalog.items?.length === items.length) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(catalog.items.length, items.length);
  assert.equal(JSON.stringify(catalog).includes(viewerIds[1]), false, 'public catalogs still redact every access-list identity');
});

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

test('publishes a Tempest Streaming Extension poll and records one identity-linked viewer vote through Studio', async (context) => {
  const secret = randomBytes(32);
  const relayToken = randomBytes(32).toString('hex');
  const runtime = await startTwitchEbs({
    host: '127.0.0.1', port: 0, twitchExtensionSecrets: [secret.toString('base64')], relayToken,
    allowedChannelIds: ['123456'], logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  const studio = await connectStudio(runtime, relayToken);
  context.after(() => studio.close());
  const poll = {
    id: 'poll-1234567890123456', state: 'active', question: 'Choose the next game', totalVotes: 999,
    options: [{ number: 1, label: 'Game One', votes: 2, percentage: 1 }, { number: 2, label: 'Game Two', votes: 0, percentage: 99 }],
    startedAt: new Date().toISOString()
  };
  const checkedAt = new Date().toISOString();
  studio.send(JSON.stringify({ protocolVersion: 1, type: 'catalog.sync', catalog: { schemaVersion: 1, extensionEdition: 'free', items: [], poll, counters: [{ id: 'counter-1234567890123456', command: 'death', trigger: '$death', label: 'Ship Restarts', value: 7 }], commands: [{ trigger: '!commands', aliases: ['!help'], permission: 'everyone', allowSharedChat: true }], goal: { source: 'studio', kind: 'subscriptions', title: 'Road to 50', currentAmount: 31, targetAmount: 50, percentage: 999, unit: 'subs', accent: '#a7ff5c' }, nowPlaying: { stationName: 'Storm Horizon Radio', state: 'online', artist: 'Artist', title: 'Track', publicPlayerUrl: 'https://www.tempestmainframe.com/listen', checkedAt }, schedule: { title: 'Mainframe Monday', startTime: '2030-01-07T20:00:00Z' }, stream: { live: true, title: 'Building Tempest', category: 'Software and Game Development', startedAt: '2030-01-01T20:00:00Z', viewerCount: 42, checkedAt } } }));
  const catalogDeadline = Date.now() + 2000;
  let published;
  while (Date.now() < catalogDeadline) {
    published = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) } }).then((response) => response.json());
    if (published.poll?.id === poll.id) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(published.poll.totalVotes, 2);
  assert.deepEqual(published.counters, [{ id: 'counter-1234567890123456', command: 'death', trigger: '$death', label: 'Ship Restarts', value: 7 }]);
  assert.deepEqual(published.commands, [{ trigger: '!commands', aliases: ['!help'], permission: 'everyone', allowSharedChat: true }]);
  assert.deepEqual(published.goal, { source: 'studio', kind: 'subscriptions', title: 'Road to 50', currentAmount: 31, targetAmount: 50, percentage: 62, unit: 'subs', accent: '#A7FF5C' });
  assert.deepEqual(published.nowPlaying, { stationName: 'Storm Horizon Radio', state: 'online', artist: 'Artist', title: 'Track', publicPlayerUrl: 'https://www.tempestmainframe.com/listen', checkedAt });
  assert.deepEqual(published.schedule, { title: 'Mainframe Monday', startTime: '2030-01-07T20:00:00.000Z' });
  assert.deepEqual(published.stream, { live: true, title: 'Building Tempest', category: 'Software and Game Development', startedAt: '2030-01-01T20:00:00.000Z', viewerCount: 42, checkedAt });
  assert.deepEqual(published.poll.options.map((option) => option.percentage), [100, 0]);
  const catalogResponse = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) } });
  const catalogEtag = catalogResponse.headers.get('etag');
  assert.match(catalogEtag, /^"[A-Za-z0-9_-]{43}"$/);
  const unchangedCatalog = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '778899' }), 'If-None-Match': catalogEtag } });
  assert.equal(unchangedCatalog.status, 304);
  assert.equal(await unchangedCatalog.text(), '');

  let relayed;
  studio.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'interaction') return;
    relayed = message;
    studio.send(JSON.stringify({
      protocolVersion: 1, type: 'result', requestId: message.requestId, status: 202,
      body: { accepted: true, duplicate: false, code: 'accepted', optionNumber: 2, poll: { ...poll, totalVotes: 3, options: [{ number: 1, label: 'Game One', votes: 2, percentage: 66.7 }, { number: 2, label: 'Game Two', votes: 1, percentage: 33.3 }] } }
    }));
  });
  const requestId = randomUUID();
  const response = await fetch(`${runtime.baseUrl}/v1/extension/poll/vote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(secret, { user_id: '778899' }), 'X-Request-ID': requestId },
    body: JSON.stringify({ requestId, pollId: poll.id, optionNumber: 2 })
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).poll.totalVotes, 3);
  assert.equal(relayed.event.viewer.id, '778899');
  assert.equal(relayed.event.payload.action, 'tempest.poll.vote');
  assert.equal(relayed.event.payload.pollId, poll.id);
  assert.equal(relayed.event.payload.optionNumber, 2);

  const unlinked = await fetch(`${runtime.baseUrl}/v1/extension/poll/vote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(secret) },
    body: JSON.stringify({ requestId: randomUUID(), pollId: poll.id, optionNumber: 1 })
  });
  assert.equal(unlinked.status, 403);
  assert.equal((await unlinked.json()).code, 'identity_required');
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
    chatbotFetchImplementation: async (url) => {
      assert.equal(String(url), 'https://radio.example/api/nowplaying/station');
      return new Response(JSON.stringify({ is_online: true, station: { name: 'Example Radio' }, now_playing: { song: { artist: 'Aster Null', title: 'Error Stars', album: 'The Coordinates Are Laughing' } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
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

  const providerUpdate = await fetch(`${bridge.baseUrl}/v1/chatbot/configuration`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tempest-Token': bridge.token },
    body: JSON.stringify({ nowPlayingProvider: { provider: 'azuracast', stationName: 'Example Radio', apiUrl: 'https://radio.example/api/nowplaying/station', publicPlayerUrl: 'https://www.tempestmainframe.com/listen', streamUrl: 'https://radio.example/listen/station/radio.mp3' } })
  });
  assert.equal(providerUpdate.status, 200);
  const nowPlayingDeadline = Date.now() + 3000;
  let publicNowPlaying;
  while (Date.now() < nowPlayingDeadline) {
    const catalog = await fetch(`${ebs.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) } }).then((catalogResponse) => catalogResponse.json());
    publicNowPlaying = catalog.nowPlaying;
    if (publicNowPlaying?.title === 'Error Stars') break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(publicNowPlaying.stationName, 'Example Radio');
  assert.equal(publicNowPlaying.artist, 'Aster Null');
  assert.equal(publicNowPlaying.publicPlayerUrl, 'https://www.tempestmainframe.com/listen');
  assert.equal(JSON.stringify(publicNowPlaying).includes('radio.example'), false, 'private provider and direct stream URLs stay out of the public catalog');

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

  const diceCatalogDeadline = Date.now() + 3000;
  let diceCatalog;
  while (Date.now() < diceCatalogDeadline) {
    diceCatalog = await fetch(`${ebs.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) } }).then((catalogResponse) => catalogResponse.json());
    if (diceCatalog.items?.some((item) => item.id === 'tempest.dice.custom')) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(diceCatalog.items.some((item) => item.id === 'tempest.dice.custom' && item.kind === 'interaction'));
  const goalEvent = {
    schemaVersion: 1,
    id: `123456:${randomUUID()}`,
    topic: 'channel.goal.updated',
    occurredAt: new Date().toISOString(),
    source: 'twitch',
    channel: { id: '123456' },
    payload: { phase: 'progress', goalId: 'goal-e2e', type: 'subscription_count', description: 'Crew Goal', currentAmount: 18, targetAmount: 25, unit: 'subs' }
  };
  const goalIngest = await fetch(`${bridge.baseUrl}/v1/integrations/twitch/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tempest-Token': bridge.token }, body: JSON.stringify(goalEvent)
  });
  assert.equal(goalIngest.status, 202);
  const goalDeadline = Date.now() + 3000;
  let publishedGoal;
  while (Date.now() < goalDeadline) {
    const catalog = await fetch(`${ebs.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) } }).then((catalogResponse) => catalogResponse.json());
    publishedGoal = catalog.goal;
    if (publishedGoal?.title === 'Crew Goal') break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.deepEqual(publishedGoal, { source: 'twitch', kind: 'subscriptions', title: 'Crew Goal', currentAmount: 18, targetAmount: 25, percentage: 72, unit: 'subs', accent: '#A7FF5C' });
  const registeredDice = await fetch(`${bridge.baseUrl}/dice-overlay/poll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((diceResponse) => diceResponse.json());
  await fetch(`${bridge.baseUrl}/dice-overlay/client-status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: registeredDice.clientId, state: 'ready', theme: 'default', renderer: 'onscreen' })
  });
  const invalidDiceRequestId = randomUUID();
  const invalidDice = await fetch(`${ebs.baseUrl}/v1/extension/interactions/tempest.dice.custom/trigger`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(secret, { user_id: '778899' }), 'X-Request-ID': invalidDiceRequestId }, body: JSON.stringify({ requestId: invalidDiceRequestId, maximum: 101 })
  });
  assert.equal(invalidDice.status, 400);
  assert.equal((await invalidDice.json()).code, 'dice_maximum_invalid');
  const diceRequestId = randomUUID();
  const diceResponsePromise = fetch(`${ebs.baseUrl}/v1/extension/interactions/tempest.dice.custom/trigger`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(secret, { user_id: '778899' }), 'X-Request-ID': diceRequestId }, body: JSON.stringify({ requestId: diceRequestId, maximum: 37 })
  });
  const diceCommands = await fetch(`${bridge.baseUrl}/dice-overlay/poll`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: registeredDice.clientId, after: registeredDice.revision })
  }).then((diceResponse) => diceResponse.json());
  const diceRequest = diceCommands.events.find((entry) => entry.type === 'roll-request').payload;
  assert.equal(diceRequest.expression, '1d37');
  const diceResponse = await diceResponsePromise;
  assert.equal(diceResponse.status, 202);
  assert.equal((await diceResponse.json()).cooldownMs, 30000);
  await fetch(`${bridge.baseUrl}/dice-overlay/result`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: diceRequest.id, token: diceRequest.token, values: [42] })
  });

  const startedPoll = await fetch(`${bridge.baseUrl}/v1/chatbot/poll/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tempest-Token': bridge.token },
    body: JSON.stringify({ question: 'Which route?', options: ['North', 'South'] })
  }).then((pollResponse) => pollResponse.json());
  const pollId = startedPoll.poll.id;
  const pollDeadline = Date.now() + 7000;
  let publishedPoll;
  while (Date.now() < pollDeadline) {
    const catalog = await fetch(`${ebs.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) } }).then((catalogResponse) => catalogResponse.json());
    publishedPoll = catalog.poll;
    if (publishedPoll?.id === pollId) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(publishedPoll.id, pollId);
  const pollRequestId = randomUUID();
  const pollVote = await fetch(`${ebs.baseUrl}/v1/extension/poll/vote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(secret, { user_id: '778899' }), 'X-Request-ID': pollRequestId },
    body: JSON.stringify({ requestId: pollRequestId, pollId, optionNumber: 2 })
  });
  assert.equal(pollVote.status, 202);
  const pollResult = await pollVote.json();
  assert.equal(pollResult.accepted, true);
  assert.equal(pollResult.poll.totalVotes, 1);
  assert.deepEqual(pollResult.poll.options.map((option) => option.votes), [0, 1]);
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
  let placedInteraction;
  studio.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== 'interaction') return;
    placedInteraction = message.event;
    studio.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId: message.requestId, status: 202, body: { accepted: true } }));
  });
  studio.send(JSON.stringify({
    protocolVersion: 1,
    type: 'catalog.sync',
    catalog: {
      schemaVersion: 1,
      items: [
        { id: 'sound-alert.creator-dance', name: 'Creator Dance', durationMs: 12000, cooldownMs: 60000, accent: '#54F2EB', glyph: 'CD', kind: 'sound-alert', access: { mode: 'specific-viewers', allowedViewerIds: ['778899', '112233'], blockedViewerIds: ['666999'], hideWhenLocked: false } },
        { id: 'sound-alert.private-jump', name: 'Private Jump', durationMs: 8000, cooldownMs: 60000, accent: '#A66BFF', glyph: 'PJ', kind: 'sound-alert', access: { mode: 'specific-viewers', allowedViewerIds: ['778899'], blockedViewerIds: [], hideWhenLocked: true } },
        { id: 'tempest.place-spark', name: 'Place Spark', durationMs: 5000, cooldownMs: 15000, accent: '#54F2EB', glyph: 'PS', kind: 'interaction', category: 'sticker', placementMode: 'viewer' }
      ]
    }
  }));

  const deadline = Date.now() + 2000;
  let catalog;
  while (Date.now() < deadline) {
    const response = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) } });
    catalog = await response.json();
    if (catalog.items?.length) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(catalog.items[0].id, 'sound-alert.creator-dance');
  assert.deepEqual(catalog.items[0].eligibility, { allowed: true });
  assert.equal(catalog.items[0].access, undefined);
  assert.equal(JSON.stringify(catalog).includes('112233'), false, 'viewer catalogs never expose access-list identities');
  assert.equal(catalog.studioConnected, true);
  const lockedCatalog = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(secret, { user_id: '111222' }) } }).then((response) => response.json());
  assert.equal(lockedCatalog.items[0].eligibility.allowed, false);
  assert.equal(lockedCatalog.items[0].eligibility.reason, 'Locked to selected viewers');
  assert.equal(lockedCatalog.items.some((item) => item.id === 'sound-alert.private-jump'), false, 'hideWhenLocked items are omitted for ineligible viewers');
  const lockedAlert = await postAlert(runtime, jwt(secret, { user_id: '111222' }), randomUUID(), 'sound-alert.creator-dance');
  assert.equal(lockedAlert.status, 403);
  assert.equal((await lockedAlert.json()).code, 'interaction_locked');
  const missingPlacement = await fetch(`${runtime.baseUrl}/v1/extension/interactions/tempest.place-spark/trigger`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) }, body: JSON.stringify({ requestId: randomUUID() })
  });
  assert.equal(missingPlacement.status, 400);
  assert.equal((await missingPlacement.json()).code, 'placement_required');
  const placementRequestId = randomUUID();
  const placed = await fetch(`${runtime.baseUrl}/v1/extension/interactions/tempest.place-spark/trigger`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': jwt(secret, { user_id: '778899' }) }, body: JSON.stringify({ requestId: placementRequestId, placement: { x: 0.25, y: 0.75 } })
  });
  assert.equal(placed.status, 202);
  assert.deepEqual(placedInteraction.payload.placement, { x: 0.25, y: 0.75 });

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
      items: [{ id: 'sound-alert.creator-dance', name: 'Updated Creator Dance', durationMs: 12000, cooldownMs: 60000, accent: '#54F2EB', glyph: 'CD', kind: 'sound-alert' }]
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
    allowedChannelIds: ['123456'], installationStore: store, viewerRequestsPerMinute: 4,
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
  assert.deepEqual((await catalog.json()).products.map((product) => product.sku), ['tempest.storm-pulse.50']);
  const lockedToken = jwt(bitsSecret, { user_id: '111222' });
  const lockedCatalogResponse = await fetch(`${runtime.baseUrl}/v1/extension/bits/catalog`, { headers: { 'X-Extension-JWT': lockedToken } });
  const lockedCatalogEtag = lockedCatalogResponse.headers.get('etag');
  const lockedCatalog = await lockedCatalogResponse.json();
  assert.equal(lockedCatalog.products[0].eligibility.allowed, false);
  assert.match(lockedCatalog.products[0].eligibility.reason, /selected viewers/i);
  assert.equal(lockedCatalog.products[0].interaction.access, undefined);
  assert.equal(JSON.stringify(lockedCatalog).includes('778899'), false, 'Bits catalogs never expose access-list identities');
  const unchangedBitsCatalog = await fetch(`${runtime.baseUrl}/v1/extension/bits/catalog`, {
    headers: { 'X-Extension-JWT': lockedToken, 'If-None-Match': lockedCatalogEtag }
  });
  assert.equal(unchangedBitsCatalog.status, 304);
  assert.equal(await unchangedBitsCatalog.text(), '');
  const lockedReservation = await fetch(`${runtime.baseUrl}/v1/extension/bits/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': lockedToken }, body: JSON.stringify({ sku: 'tempest.storm-pulse.50' }) });
  assert.equal(lockedReservation.status, 403);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rejected = await fetch(`${runtime.baseUrl}/v1/extension/bits/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': lockedToken }, body: JSON.stringify({ sku: 'tempest.storm-pulse.50' }) });
    assert.equal(rejected.status, 403);
  }
  const limitedReservation = await fetch(`${runtime.baseUrl}/v1/extension/bits/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': lockedToken }, body: JSON.stringify({ sku: 'tempest.storm-pulse.50' }) });
  assert.equal(limitedReservation.status, 429);
  const inactiveFreeEdition = await fetch(`${runtime.baseUrl}/v1/extension/catalog`, { headers: { 'X-Extension-JWT': jwt(freeSecret) } });
  assert.equal(inactiveFreeEdition.status, 409);
  const inactivePrimaryBody = await inactiveFreeEdition.json();
  assert.equal(inactivePrimaryBody.activeEdition, 'bits');
  assert.match(inactivePrimaryBody.error, /Tempest Streaming Extension/);
  assert.doesNotMatch(inactivePrimaryBody.error, /Tempest Mainframe \(Free\)/);

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
  const limitedTransaction = await fetch(`${runtime.baseUrl}/v1/extension/bits/transactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Extension-JWT': viewerToken }, body: JSON.stringify({ transactionReceipt: wrongAmount })
  });
  assert.equal(limitedTransaction.status, 429);
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

  const malformed = await fetch(`${runtime.baseUrl}/v1/kick/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not-json'
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error, 'Request body must be a JSON object.');

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
