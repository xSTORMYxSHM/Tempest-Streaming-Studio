const test = require('node:test');
const assert = require('node:assert/strict');
const { boundedFetch } = require('../dist/bounded-fetch');

test('bounds desktop service calls and preserves caller cancellation', async () => {
  const hangingRequest = async (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason || new Error('aborted')), { once: true });
  });
  await assert.rejects(boundedFetch(hangingRequest, 100)('https://service.example'), /timed out after 1 seconds/);

  const caller = new AbortController();
  const request = boundedFetch(hangingRequest, 10_000)('https://service.example', { signal: caller.signal });
  caller.abort(new Error('caller stopped'));
  await assert.rejects(request, /caller stopped/);
});
