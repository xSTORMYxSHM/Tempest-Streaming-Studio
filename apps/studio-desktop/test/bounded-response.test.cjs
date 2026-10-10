const test = require('node:test');
const assert = require('node:assert/strict');
const { readResponseBuffer, readResponseJson } = require('../dist/bounded-response');

test('reads response bodies within the configured byte limit', async () => {
  const response = new Response('tempest', { headers: { 'Content-Length': '7' } });
  assert.equal((await readResponseBuffer(response, 7)).toString('utf8'), 'tempest');
});

test('bounds and times out service JSON bodies', async () => {
  assert.deepEqual(await readResponseJson(new Response('{"ok":true}'), 32), { ok: true });
  await assert.rejects(() => readResponseJson(new Response('{"message":"too large"}'), 8), /permitted size/);
  await assert.rejects(
    () => readResponseJson(new Response(new ReadableStream({ start() {} })), 32, 100),
    /timed out/
  );
});

test('rejects declared and streamed bodies that exceed the configured byte limit', async () => {
  await assert.rejects(() => readResponseBuffer(new Response('small', { headers: { 'Content-Length': '100' } }), 10), /permitted size/);
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(8));
      controller.close();
    }
  });
  await assert.rejects(() => readResponseBuffer(new Response(body), 10), /permitted size/);
});
