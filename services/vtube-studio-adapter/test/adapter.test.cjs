const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { WebSocketServer } = require('ws');
const { startVTubeStudioAdapter } = require('../dist');

function close(server) {
  for (const socket of server.clients) socket.terminate();
  return new Promise((resolve) => server.close(() => resolve()));
}

async function eventually(check, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Condition was not met before timeout.');
}

test('authenticates and triggers an assigned VTube Studio hotkey', async (context) => {
  const bridgeServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const vtsServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await Promise.all([
    new Promise((resolve) => bridgeServer.once('listening', resolve)),
    new Promise((resolve) => vtsServer.once('listening', resolve))
  ]);
  context.after(async () => { await Promise.all([close(bridgeServer), close(vtsServer)]); });
  const bridgePort = bridgeServer.address().port;
  const vtsPort = vtsServer.address().port;
  let bridgeSocket;
  const hello = new Promise((resolve) => bridgeServer.once('connection', (socket) => {
    bridgeSocket = socket;
    socket.once('message', (raw) => resolve(JSON.parse(raw.toString())));
  }));
  let triggered;
  const hotkeyTriggered = new Promise((resolve) => { triggered = resolve; });
  vtsServer.on('connection', (socket) => socket.on('message', (raw) => {
    const request = JSON.parse(raw.toString());
    const respond = (messageType, data) => socket.send(JSON.stringify({
      apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0', requestID: request.requestID, messageType, data
    }));
    if (request.messageType === 'AuthenticationRequest') respond('AuthenticationResponse', { authenticated: true, reason: 'Token valid.' });
    if (request.messageType === 'HotkeysInCurrentModelRequest') respond('HotkeysInCurrentModelResponse', {
      modelLoaded: true,
      modelName: 'Tempest Live2D',
      availableHotkeys: [{ name: 'Dance Break', type: 'TriggerAnimation', description: 'Dance', file: 'dance.motion3.json', hotkeyID: 'hotkey-dance' }]
    });
    if (request.messageType === 'HotkeyTriggerRequest') {
      triggered(request);
      respond('HotkeyTriggerResponse', { hotkeyID: request.data.hotkeyID });
    }
  }));
  const tokenStore = { async load() { return 'saved-vts-token'; }, async save() {}, async clear() {} };
  const runtime = startVTubeStudioAdapter({
    bridgeUrl: `ws://127.0.0.1:${bridgePort}/v1/socket`,
    bridgeToken: 'a'.repeat(64),
    vtubeStudioUrl: `ws://127.0.0.1:${vtsPort}`,
    tokenStore,
    reconnectMs: 50,
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  assert.equal((await hello).payload.applicationId, 'com.tempestmainframe.vtube-studio');
  await eventually(() => runtime.status().authorization === 'authorized');
  assert.equal(runtime.status().modelName, 'Tempest Live2D');
  assert.equal(runtime.hotkeys()[0].hotkeyID, 'hotkey-dance');

  bridgeSocket.send(JSON.stringify({
    protocolVersion: '1.0', id: randomUUID(), kind: 'command', source: 'tempest.workflow',
    target: 'com.tempestmainframe.vtube-studio', topic: 'avatar.performance.apply',
    timestamp: new Date().toISOString(), correlationId: randomUUID(),
    payload: { phase: 'activate', arguments: { vtubeStudioHotkey: 'hotkey-dance' } }
  }));
  assert.equal((await hotkeyTriggered).data.hotkeyID, 'hotkey-dance');
});

test('requests one-time authorization only when the user asks', async (context) => {
  const bridgeServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  const vtsServer = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await Promise.all([
    new Promise((resolve) => bridgeServer.once('listening', resolve)),
    new Promise((resolve) => vtsServer.once('listening', resolve))
  ]);
  context.after(async () => { await Promise.all([close(bridgeServer), close(vtsServer)]); });
  let savedToken = '';
  let tokenRequests = 0;
  vtsServer.on('connection', (socket) => socket.on('message', (raw) => {
    const request = JSON.parse(raw.toString());
    const respond = (messageType, data) => socket.send(JSON.stringify({ apiName: 'VTubeStudioPublicAPI', apiVersion: '1.0', requestID: request.requestID, messageType, data }));
    if (request.messageType === 'AuthenticationTokenRequest') { tokenRequests += 1; respond('AuthenticationTokenResponse', { authenticationToken: 'new-vts-token' }); }
    if (request.messageType === 'AuthenticationRequest') respond('AuthenticationResponse', { authenticated: true });
    if (request.messageType === 'HotkeysInCurrentModelRequest') respond('HotkeysInCurrentModelResponse', { modelLoaded: false, availableHotkeys: [] });
  }));
  const runtime = startVTubeStudioAdapter({
    bridgeUrl: `ws://127.0.0.1:${bridgeServer.address().port}/v1/socket`, bridgeToken: 'b'.repeat(64),
    vtubeStudioUrl: `ws://127.0.0.1:${vtsServer.address().port}`, reconnectMs: 50,
    tokenStore: { async load() { return null; }, async save(token) { savedToken = token; }, async clear() { savedToken = ''; } },
    logger: { info() {}, warn() {}, error() {} }
  });
  context.after(() => runtime.close());
  await eventually(() => runtime.status().vtubeStudio === 'connected');
  assert.equal(tokenRequests, 0);
  await runtime.authorize();
  assert.equal(tokenRequests, 1);
  assert.equal(savedToken, 'new-vts-token');
  assert.equal(runtime.status().authorization, 'authorized');
});
