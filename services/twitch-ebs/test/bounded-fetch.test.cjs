const test = require('node:test');
const assert = require('node:assert/strict');
const { boundedFetch, readBoundedJsonResponse } = require('../dist/bounded-fetch');

test('bounds hosted-service upstream requests and preserves caller cancellation', async () => {
  const hangingRequest = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason || new Error('aborted')), { once: true });
  });
  await assert.rejects(boundedFetch(hangingRequest, 100)('https://provider.example'), /timed out after 1 seconds/);

  const caller = new AbortController();
  const request = boundedFetch(hangingRequest, 10_000)('https://provider.example', { signal: caller.signal });
  caller.abort(new Error('caller stopped'));
  await assert.rejects(request, /caller stopped/);
});

test('bounds and times out hosted provider response bodies', async () => {
  assert.deepEqual(await readBoundedJsonResponse(new Response('{"ok":true}'), 32), { ok: true });
  await assert.rejects(
    () => readBoundedJsonResponse(new Response('{"message":"too large"}'), 8),
    /size limit/
  );
  await assert.rejects(
    () => readBoundedJsonResponse(new Response(new ReadableStream({ start() {} })), 32, 100),
    /timed out/
  );
});
