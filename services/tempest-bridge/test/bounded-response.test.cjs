const test = require('node:test');
const assert = require('node:assert/strict');
const { readBoundedJsonResponse, readBoundedResponseBody } = require('../dist/bounded-response');

test('bounds provider bodies while they are streamed', async () => {
  const accepted = new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Length': '3' } });
  assert.deepEqual([...await readBoundedResponseBody(accepted, 3)], [1, 2, 3]);
  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8));
      controller.enqueue(new Uint8Array(8));
      controller.close();
    }
  });
  await assert.rejects(() => readBoundedResponseBody(new Response(oversized), 10), /size limit/);
});

test('bounds and times out streamed JSON responses', async () => {
  assert.deepEqual(
    await readBoundedJsonResponse(new Response(JSON.stringify({ ok: true })), 32),
    { ok: true }
  );
  await assert.rejects(
    () => readBoundedJsonResponse(new Response(JSON.stringify({ message: 'too large' })), 8),
    /size limit/
  );
  const stalled = new ReadableStream({ start() {} });
  await assert.rejects(
    () => readBoundedJsonResponse(new Response(stalled), 32, 100),
    /timed out/
  );
});
