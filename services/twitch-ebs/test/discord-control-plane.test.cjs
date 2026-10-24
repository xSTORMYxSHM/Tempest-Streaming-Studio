const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { constantTimeHashEqual } = require('../dist/discord-control-plane');

test('matches a raw pairing token against its stored SHA-256 digest', () => {
  const token = 'pairing-token-example';
  const digest = createHash('sha256').update(token).digest('hex');

  assert.equal(constantTimeHashEqual(token, digest), true);
  assert.equal(constantTimeHashEqual('wrong-token', digest), false);
});
