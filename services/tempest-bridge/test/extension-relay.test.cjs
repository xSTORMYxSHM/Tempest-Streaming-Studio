const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const { WebSocketServer } = require('ws');
const { TempestExtensionRelayClient, extensionCatalogKind } = require('../dist');

test('keeps legacy catalog kinds available during the companion migration', () => {
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
          socket.send(JSON.stringify({ protocolVersion: 1, type: 'catalog.ack', revision: message.revision, companions: message.catalog.companions, extensionEdition: message.catalog.extensionEdition, itemCount: message.catalog.items.length }));
          resolveCatalogSync();
        }
        if (message.type === 'result') resolve(message);
      });
      socket.on('error', reject);
    });
  });
  const relay = new TempestExtensionRelayClient({
    url: `ws://127.0.0.1:${port}/v1/studio`, token, channelId, companions: { schemaVersion: 1, mainframe: true, streaming: true }, extensionEdition: 'free',
    catalog: () => [{ id: 'tempest.storm-pulse', name: 'Storm Pulse', durationMs: 8000, accent: '#54F2EB', glyph: 'SP', kind: 'interaction', destinations: ['mainframe', 'streaming'] }],
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
  for (let attempt = 0; attempt < 20 && relay.status().catalogSync?.state !== 'synced'; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(acknowledgement.status, 202);
  assert.equal(acknowledgement.body.accepted, true);
  assert.deepEqual(handled, event);
  assert.equal(catalogSync.extensionEdition, 'free');
  assert.deepEqual(catalogSync.companions, { schemaVersion: 1, mainframe: true, streaming: true });
  assert.deepEqual(catalogSync.items[0].destinations, ['mainframe', 'streaming']);
  assert.equal(catalogSync.items[0].id, 'tempest.storm-pulse');
  assert.equal(relay.status().state, 'connected');
  assert.equal(relay.status().catalogSync.state, 'synced');
  assert.equal(relay.status().catalogSync.edition, 'free');
  assert.deepEqual(relay.status().catalogSync.companions, { schemaVersion: 1, mainframe: true, streaming: true });
  assert.equal(relay.status().catalogSync.itemCount, 1);
  assert.match(relay.status().catalogSync.revision, /^[a-f0-9]{24}$/);
});
