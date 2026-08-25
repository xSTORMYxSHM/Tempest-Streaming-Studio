const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');
const { WebSocketServer } = require('ws');
const { TempestExtensionRelayClient } = require('../dist');

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
    payload: { action: 'sound-alert.fishie', alertId: 'sound-alert.fishie' }
  };
  let handled;
  const result = new Promise((resolve, reject) => {
    webSockets.on('connection', (socket) => {
      socket.send(JSON.stringify({ protocolVersion: 1, type: 'interaction', requestId: randomUUID(), event }));
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'result') resolve(message);
      });
      socket.on('error', reject);
    });
  });
  const relay = new TempestExtensionRelayClient({
    url: `ws://127.0.0.1:${port}/v1/studio`, token, channelId,
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
  assert.equal(acknowledgement.status, 202);
  assert.equal(acknowledgement.body.accepted, true);
  assert.deepEqual(handled, event);
  assert.equal(relay.status().state, 'connected');
});
