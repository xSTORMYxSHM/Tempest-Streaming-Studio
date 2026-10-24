const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');
const { commandNeedsManageGuild, parseSignalMessage, readDiscordCompanionConfig, tempestCommandJson, TempestSignalClient } = require('../dist');

const guildId = '12345678901234567';
const channelId = '22345678901234567';

test('publishes one private-server slash command with the required feature groups', () => {
  assert.equal(tempestCommandJson.name, 'tempest');
  assert.equal(tempestCommandJson.dm_permission, false);
  const options = tempestCommandJson.options || [];
  assert.deepEqual(options.map((entry) => entry.name), ['setup', 'status', 'privacy', 'session', 'radio', 'unlink']);
  assert.deepEqual(options.find((entry) => entry.name === 'session').options.map((entry) => entry.name), ['start', 'stop']);
  assert.deepEqual(options.find((entry) => entry.name === 'radio').options.map((entry) => entry.name), ['play', 'stop', 'status', 'volume']);
});

test('reserves server configuration commands for Manage Server members', () => {
  assert.equal(commandNeedsManageGuild('setup'), true);
  assert.equal(commandNeedsManageGuild('unlink'), true);
  assert.equal(commandNeedsManageGuild('status'), false);
  assert.equal(commandNeedsManageGuild('privacy'), false);
  assert.equal(commandNeedsManageGuild('session.start'), false);
  assert.equal(commandNeedsManageGuild('radio.play'), true);
  assert.equal(commandNeedsManageGuild('radio.stop'), true);
  assert.equal(commandNeedsManageGuild('radio.status'), false);
});

test('validates production configuration and defaults to receiving only speaking packet metadata', () => {
  const config = readDiscordCompanionConfig({
    TEMPEST_DISCORD_BOT_TOKEN: 'secret-token',
    TEMPEST_DISCORD_APPLICATION_ID: guildId,
    TEMPEST_SIGNAL_DISCORD_WORKER_URL: 'wss://signal.tempestmainframe.com/v1/discord/bot-worker',
    TEMPEST_SIGNAL_DISCORD_WORKER_TOKEN: 'a'.repeat(32),
    PORT: '9000'
  });
  assert.equal(config.selfDeaf, false);
  assert.equal(config.port, 9000);
  assert.equal(config.radioVolume, 45);
  assert.equal(config.radioUrl, undefined);
  assert.throws(() => readDiscordCompanionConfig({
    TEMPEST_DISCORD_BOT_TOKEN: 'secret-token',
    TEMPEST_DISCORD_APPLICATION_ID: guildId,
    TEMPEST_SIGNAL_DISCORD_WORKER_URL: 'http://signal.example.com',
    TEMPEST_SIGNAL_DISCORD_WORKER_TOKEN: 'a'.repeat(32)
  }), /wss/);
});

test('accepts bounded tenant-scoped session messages and rejects malformed IDs', () => {
  assert.deepEqual(parseSignalMessage({
    type: 'session.start', guildId, channelId, bindingId: 'binding_12345678', sessionId: 'session_12345678', hiddenUserIds: [guildId, guildId, 'bad']
  }), {
    type: 'session.start', guildId, channelId, bindingId: 'binding_12345678', sessionId: 'session_12345678', hiddenUserIds: [guildId]
  });
  assert.throws(() => parseSignalMessage({
    type: 'session.start', guildId: 'other-tenant', channelId, bindingId: 'binding_12345678', sessionId: 'session_12345678'
  }), /invalid/);
});

test('accepts privacy and command responses but rejects unbounded response text', () => {
  assert.deepEqual(parseSignalMessage({ type: 'privacy.changed', guildId, userId: channelId, hidden: true }), { type: 'privacy.changed', guildId, userId: channelId, hidden: true });
  assert.deepEqual(parseSignalMessage({ type: 'command.response', requestId: 'request_12345678', ok: true, message: 'Connected.' }), { type: 'command.response', requestId: 'request_12345678', ok: true, message: 'Connected.' });
  assert.throws(() => parseSignalMessage({ type: 'command.response', requestId: 'request_12345678', ok: true, message: 'x'.repeat(1_801) }), /invalid/);
});

test('authenticates to Signal and correlates concurrent-safe command responses', { timeout: 10_000 }, async () => {
  const bounded = (promise, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 2_000))
  ]);
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  let authorization = '';
  const hello = new Promise((resolve) => server.once('connection', (socket, request) => {
    authorization = String(request.headers.authorization || '');
    socket.once('message', (raw) => {
      resolve(JSON.parse(raw.toString()));
      socket.send(JSON.stringify({ type: 'worker.ready', heartbeatIntervalMs: 5000 }));
      socket.on('message', (commandRaw) => {
        const command = JSON.parse(commandRaw.toString());
        if (command.type === 'command.request') socket.send(JSON.stringify({ type: 'command.response', requestId: command.requestId, ok: true, message: 'Studio connected.' }));
      });
    });
  }));
  const client = new TempestSignalClient({
    url: `ws://127.0.0.1:${port}`,
    token: 'b'.repeat(32),
    applicationId: guildId,
    reconnectMs: 1000,
    guildIds: () => [guildId],
    sessionCount: () => 0,
    logger: { info() {}, warn() {}, error() {} }
  });
  try {
    const ready = new Promise((resolve) => client.once('ready', resolve));
    client.start();
    const helloMessage = await bounded(hello, 'worker hello');
    await bounded(ready, 'worker ready');
    assert.equal(authorization, `Bearer ${'b'.repeat(32)}`);
    assert.equal(helloMessage.type, 'worker.hello');
    assert.deepEqual(helloMessage.guildIds, [guildId]);
    const response = await bounded(client.request({ command: 'status', guildId, channelId, userId: channelId, roleIds: [], manageGuild: false, options: {} }), 'command response');
    assert.equal(response.message, 'Studio connected.');
  } finally {
    await client.close();
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});
