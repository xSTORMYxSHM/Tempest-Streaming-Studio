const test = require('node:test');
const assert = require('node:assert/strict');
const { readResponseBuffer } = require('../dist/bounded-response');

test('reads response bodies within the configured byte limit', async () => {
  const response = new Response('tempest', { headers: { 'Content-Length': '7' } });
  assert.equal((await readResponseBuffer(response, 7)).toString('utf8'), 'tempest');
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
