const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chromeCompatibleUserAgent,
  isTwitchWebUrl,
  normalizeTwitchLogin,
  streamTogetherUrl
} = require('../dist/stream-together.js');

test('builds the Twitch Stream Together backstage URL from the broadcaster login', () => {
  assert.equal(normalizeTwitchLogin('  XStormYx_SHM  '), 'xstormyx_shm');
  assert.equal(streamTogetherUrl('xstormyx_shm'), 'https://www.twitch.tv/popout/xstormyx_shm/guest-star');
  assert.throws(() => streamTogetherUrl('invalid/name'), /Connect the broadcaster Twitch account/);
});

test('limits the call window to secure Twitch navigation', () => {
  assert.equal(isTwitchWebUrl('https://www.twitch.tv/popout/example/guest-star'), true);
  assert.equal(isTwitchWebUrl('https://id.twitch.tv/oauth2/authorize'), true);
  assert.equal(isTwitchWebUrl('http://www.twitch.tv/popout/example/guest-star'), false);
  assert.equal(isTwitchWebUrl('https://twitch.tv.example.com/'), false);
});

test('presents Studio Chromium as a Chrome-compatible Windows browser', () => {
  const userAgent = chromeCompatibleUserAgent('142.0.7444.0');
  assert.match(userAgent, /Chrome\/142\.0\.0\.0/);
  assert.doesNotMatch(userAgent, /Electron|Edg\//);
  assert.throws(() => chromeCompatibleUserAgent('unknown'), /Chromium version/);
});
