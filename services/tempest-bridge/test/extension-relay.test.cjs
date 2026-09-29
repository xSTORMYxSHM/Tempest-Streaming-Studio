const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const { WebSocketServer } = require('ws');
const { TempestExtensionRelayClient, extensionCatalogKind } = require('../dist');

test('publishes the catalog route expected by the selected Extension edition', () => {
  assert.equal(extensionCatalogKind('free'), 'sound-alert');
  assert.equal(extensionCatalogKind('bits'), 'interaction');
  assert.equal(extensionCatalogKind(undefined), 'sound-alert');
});

test('connects outbound, validates channel events, and acknowledges EBS interactions', async (context) => {
  const token = randomBytes(32).toString('hex');
  const channelId = '123456';
  const server = createServer();
  const webSockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    assert.equal(request.headers['x-tempest-channel-id'], channelId);
    webSockets.handleUpgrade(request, socket, head, (webSocket) => webSockets.emit('connection', webSocket, request));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const event = {
    schemaVersion: 1,
    id: `123456:${randomUUID()}`,
    topic: 'viewer.interaction.requested',
    occurredAt: new Date().toISOString(),
    source: 'twitch',
    channel: { id: channelId },
    viewer: { id: 'Uviewer123', roles: ['viewer'] },
    payload: { action: 'sound-alert.hype-pulse', alertId: 'sound-alert.hype-pulse' }
  };
  let handled;
  let catalogSync;
  let resolveCatalogSync;
  const catalogResult = new Promise((resolve) => { resolveCatalogSync = resolve; });
  const result = new Promise((resolve, reject) => {
    webSockets.on('connection', (socket) => {
      socket.send(JSON.stringify({ protocolVersion: 1, type: 'interaction', requestId: randomUUID(), event }));
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'catalog.sync') {
          catalogSync = message.catalog;
          resolveCatalogSync();
        }
        if (message.type === 'result') resolve(message);
      });
      socket.on('error', reject);
    });
  });
  const relay = new TempestExtensionRelayClient({
    url: `ws://127.0.0.1:${port}/v1/studio`, token, channelId, extensionEdition: 'free',
    catalog: () => [{ id: 'tempest.storm-pulse', name: 'Storm Pulse', durationMs: 8000, accent: '#54F2EB', glyph: 'SP', kind: 'interaction' }],
    poll: () => ({ id: 'poll-1234567890123456', state: 'active', question: 'Choose one', options: [{ number: 1, label: 'One', votes: 2, percentage: 100 }, { number: 2, label: 'Two', votes: 0, percentage: 0 }], totalVotes: 2, startedAt: new Date().toISOString() }),
    counters: () => [{ id: 'counter-1234567890123456', command: 'death', label: 'Ship Restarts', value: 7 }],
    goal: () => ({ source: 'studio', kind: 'subscriptions', title: 'Road to 50', currentAmount: 31, targetAmount: 50, unit: 'subs', accent: '#A7FF5C' }),
    logger: { info() {}, warn() {}, error() {} },
    async handler(value) {
      handled = value;
      return { status: 202, body: { accepted: true } };
    }
  });
  context.after(async () => {
    await relay.close();
    await new Promise((resolve) => webSockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  });
  relay.start();
  const acknowledgement = await result;
  await catalogResult;
  assert.equal(acknowledgement.status, 202);
  assert.equal(acknowledgement.body.accepted, true);
  assert.deepEqual(handled, event);
  assert.equal(catalogSync.extensionEdition, 'free');
  assert.equal(catalogSync.items[0].id, 'tempest.storm-pulse');
  assert.equal(catalogSync.poll.question, 'Choose one');
  assert.deepEqual(catalogSync.counters, [{ id: 'counter-1234567890123456', command: 'death', label: 'Ship Restarts', value: 7 }]);
  assert.equal(catalogSync.goal.title, 'Road to 50');
  assert.equal(relay.status().state, 'connected');
});
