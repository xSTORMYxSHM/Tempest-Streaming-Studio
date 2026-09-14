const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { createSocket } = require('node:dgram');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const { startTempest2DAdapter, startWarudoAdapter } = require('../dist');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  for (const socket of server.clients) socket.terminate();
  return new Promise((resolve) => server.close(() => resolve()));
}

test('forwards Bridge performance commands to the Warudo blueprint socket', async (context) => {
  const bridgeServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const warudoServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await Promise.all([
    new Promise((resolve) => bridgeServer.once('listening', resolve)),
    new Promise((resolve) => warudoServer.once('listening', resolve))
  ]);
  const bridgePort = bridgeServer.address().port;
  const warudoPort = warudoServer.address().port;
  context.after(async () => { await Promise.all([close(bridgeServer), close(warudoServer)]); });

  let bridgeSocket;
  const hello = new Promise((resolve) => bridgeServer.once('connection', (socket) => {
    bridgeSocket = socket;
    socket.once('message', (raw) => resolve(JSON.parse(raw.toString())));
  }));
  const forwarded = new Promise((resolve) => warudoServer.once('connection', (socket) => {
    socket.once('message', (raw) => resolve(JSON.parse(raw.toString())));
  }));
  const runtime = startWarudoAdapter({
    bridgeUrl: `ws://127.0.0.1:${bridgePort}/v1/socket`,
    bridgeToken: 'a'.repeat(64),
    warudoUrl: `ws://127.0.0.1:${warudoPort}/`,
    reconnectMs: 50,
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  assert.equal((await hello).payload.applicationId, 'com.tempestmainframe.warudo');

  bridgeSocket.send(JSON.stringify({
    protocolVersion: '1.0',
    id: randomUUID(),
    kind: 'command',
    source: 'tempest.workflow',
    target: 'com.tempestmainframe.warudo',
    topic: 'avatar.performance.apply',
    timestamp: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: {
      runId: randomUUID(),
      actionId: 'warudo-performance',
      phase: 'activate',
      arguments: { cue: 'sound-alert.hype-pulse', durationMs: 8000, intensity: 0.75, dedupeId: 'hype-pulse-1' },
      lease: { durationMs: 8000 }
    }
  }));

  const message = await forwarded;
  assert.equal(message.action, 'tempestPerformance');
  assert.equal(message.data.phase, 'activate');
  assert.equal(message.data.cue, 'sound-alert.hype-pulse');
  assert.equal(message.data.durationMs, 8000);
  assert.equal(message.data.intensity, 0.75);
});

test('forwards Bridge interaction controls directly to Tempest 2D over loopback UDP', async (context) => {
  const bridgeServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => bridgeServer.once('listening', resolve));
  const bridgePort = bridgeServer.address().port;
  const receiver = createSocket('udp4');
  await new Promise((resolve, reject) => {
    receiver.once('error', reject);
    receiver.bind(0, '127.0.0.1', resolve);
  });
  const receiverPort = receiver.address().port;
  context.after(async () => {
    receiver.close();
    await close(bridgeServer);
  });

  let bridgeSocket;
  const hello = new Promise((resolve) => bridgeServer.once('connection', (socket) => {
    bridgeSocket = socket;
    socket.once('message', (raw) => resolve(JSON.parse(raw.toString())));
  }));
  const forwarded = new Promise((resolve) => receiver.once('message', (raw) => resolve(JSON.parse(raw.toString()))));
  const runtime = startTempest2DAdapter({
    bridgeUrl: `ws://127.0.0.1:${bridgePort}/v1/socket`,
    bridgeToken: 'b'.repeat(64),
    host: '127.0.0.1',
    port: receiverPort,
    reconnectMs: 50,
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  assert.equal((await hello).payload.applicationId, 'com.tempestmainframe.tempest2d');

  bridgeSocket.send(JSON.stringify({
    protocolVersion: '1.0',
    id: randomUUID(),
    kind: 'command',
    source: 'tempest.workflow',
    target: 'com.tempestmainframe.tempest2d',
    topic: 'avatar.performance.apply',
    timestamp: new Date().toISOString(),
    correlationId: randomUUID(),
    payload: {
      runId: 'run-2d',
      actionId: 'tempest2d-performance',
      phase: 'activate',
      arguments: { cue: 'sound-alert.hype-pulse', tempest2dAction: 'expression:Happy', durationMs: 8000, intensity: 0.75 },
      lease: { durationMs: 8000 }
    }
  }));

  const message = await forwarded;
  assert.equal(message.action, 'tempest2dInteraction');
  assert.equal(message.data.phase, 'activate');
  assert.equal(message.data.control, 'expression:Happy');
  assert.equal(message.data.durationMs, 8000);
  assert.equal(message.data.intensity, 0.75);
  assert.equal(message.data.runId, 'run-2d');
});

test('ships a diagnosable Warudo node with local flow tests and flexible cue filters', async () => {
  const source = await readFile(path.join(__dirname, '..', '..', '..', 'integrations', 'warudo', 'TempestPerformanceNode.cs'), 'utf8');
  assert.match(source, /public void TestActivate\(\)/);
  assert.match(source, /public void TestRelease\(\)/);
  assert.match(source, /public bool Matched\(\)/);
  assert.match(source, /public int MessagesReceived\(\)/);
  assert.match(source, /filter\.EndsWith\("\*"/);
  assert.match(source, /SetDataInput\(nameof\(Status\)/);
});
