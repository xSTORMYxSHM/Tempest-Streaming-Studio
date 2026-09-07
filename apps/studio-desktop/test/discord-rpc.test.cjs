const test = require('node:test');
const assert = require('node:assert/strict');
const { discordIpcPaths, encodeDiscordRpcFrame, readDiscordRpcFrames } = require('../dist/discord-rpc');

test('tries both Windows Discord named-pipe forms across all ten IPC slots', () => {
  const paths = discordIpcPaths('win32');
  assert.equal(paths.length, 20);
  assert.deepEqual(paths.slice(0, 4), [
    '\\\\.\\pipe\\discord-ipc-0',
    '\\\\?\\pipe\\discord-ipc-0',
    '\\\\.\\pipe\\discord-ipc-1',
    '\\\\?\\pipe\\discord-ipc-1'
  ]);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(paths.at(-1), '\\\\?\\pipe\\discord-ipc-9');
});

test('encodes and incrementally reads Discord RPC IPC frames', () => {
  const first = encodeDiscordRpcFrame(0, { v: 1, client_id: '123' });
  const second = encodeDiscordRpcFrame(1, { cmd: 'GET_SELECTED_VOICE_CHANNEL', nonce: 'n-1', args: {} });
  assert.equal(first.readUInt32LE(0), 0);
  assert.equal(first.readUInt32LE(4), first.length - 8);
  const partial = readDiscordRpcFrames(Buffer.concat([first, second.subarray(0, 10)]));
  assert.equal(partial.frames.length, 1);
  assert.deepEqual(partial.frames[0].payload, { v: 1, client_id: '123' });
  const complete = readDiscordRpcFrames(Buffer.concat([partial.remaining, second.subarray(10)]));
  assert.equal(complete.frames.length, 1);
  assert.equal(complete.frames[0].opcode, 1);
  assert.equal(complete.frames[0].payload.cmd, 'GET_SELECTED_VOICE_CHANNEL');
  assert.equal(complete.remaining.length, 0);
});

test('rejects oversized Discord RPC frames before allocation', () => {
  const invalid = Buffer.alloc(8);
  invalid.writeUInt32LE(1, 0);
  invalid.writeUInt32LE(17 * 1024 * 1024, 4);
  assert.throws(() => readDiscordRpcFrames(invalid), /oversized frame/);
});
