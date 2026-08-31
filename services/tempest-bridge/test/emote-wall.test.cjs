const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TempestEmoteWall } = require('../dist/emote-wall');

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}

test('loads opt-in third-party catalogs, resolves exact names, and proxies provider media', async () => {
  const calls = [];
  const providerFetch = async (input) => {
    const url = String(input); calls.push(url);
    if (url === 'https://7tv.io/v3/emote-sets/global') return json({ emotes: [{ name: 'SevenDance', data: { host: { url: '//cdn.7tv.app/emote/seven', files: [{ name: '3x.webp', frame_count: 1 }] } } }] });
    if (url === 'https://7tv.io/v3/users/twitch/546679431') return json({}, 404);
    if (url === 'https://api.betterttv.net/3/cached/emotes/global') return json([{ id: 'bttv123', code: 'BTTVWave', imageType: 'gif' }]);
    if (url === 'https://api.betterttv.net/3/cached/users/twitch/546679431') return json({ channelEmotes: [], sharedEmotes: [] });
    if (url === 'https://api.frankerfacez.com/v1/set/global') return json({ sets: { 3: { emoticons: [{ id: 1, name: 'FFZParty', urls: { 2: '//cdn.frankerfacez.com/emote/1/2' } }] } } });
    if (url === 'https://api.frankerfacez.com/v1/room/id/546679431') return json({ sets: {} });
    if (url === 'https://cdn.7tv.app/emote/seven/3x.webp') return new Response(Buffer.from([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/webp' } });
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const wall = new TempestEmoteWall(await mkdtemp(path.join(os.tmpdir(), 'tempest-emote-wall-')), providerFetch);
  await wall.initialize();
  assert.equal(wall.status('local').providerCatalogCount, 0);
  await wall.update({ enableSevenTv: true, enableBttv: true, enableFfz: true, providerOrder: 'seventv,bttv,ffz' });
  assert.equal(calls.length, 0, 'providers stay idle until a public Twitch channel ID is known');
  await wall.setChannel('546679431');
  const status = wall.status('local');
  assert.equal(status.providerCatalogCount, 3);
  assert.deepEqual(status.providers.map((provider) => provider.state), ['ready', 'ready', 'ready']);

  const event = {
    schemaVersion: 1, id: 'third-party-chat', topic: 'viewer.chat.message', occurredAt: new Date().toISOString(), source: 'twitch',
    channel: { id: '546679431' }, viewer: { id: 'viewer', displayName: 'Viewer' },
    payload: { messageId: 'message', text: 'SevenDance SevenDance! BTTVWave FFZParty', fragments: [{ type: 'text', text: 'SevenDance SevenDance! BTTVWave FFZParty' }] }
  };
  const items = wall.push(event);
  assert.deepEqual(items.map((item) => item.name), ['SevenDance', 'BTTVWave', 'FFZParty']);
  assert.deepEqual(items.map((item) => item.provider), ['seventv', 'bttv', 'ffz']);

  let mediaType = ''; let bytes;
  const response = { destroyed: false, statusCode: 0, setHeader(name, value) { if (String(name).toLowerCase() === 'content-type') mediaType = value; }, end(value) { bytes = value; } };
  const mediaId = items[0].url.split('/').pop();
  assert.equal(await wall.serveMedia(mediaId, response), true);
  assert.equal(mediaType, 'image/webp');
  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.equal(calls.filter((url) => url.includes('cdn.7tv.app')).length, 1);
  await wall.serveMedia(mediaId, response);
  assert.equal(calls.filter((url) => url.includes('cdn.7tv.app')).length, 1, 'media is served from the bounded local cache after first load');
  wall.close();
});

test('recognizes a community 1-2-3-2-1 emote pyramid and exposes one celebration', async () => {
  const wall = new TempestEmoteWall(await mkdtemp(path.join(os.tmpdir(), 'tempest-emote-pyramid-')));
  await wall.initialize();
  const counts = [1, 2, 3, 2, 1];
  counts.forEach((count, index) => {
    const name = 'Kappa';
    wall.push({
      schemaVersion: 1,
      id: `pyramid-${index}`,
      topic: 'viewer.chat.message',
      occurredAt: new Date().toISOString(),
      source: 'twitch',
      channel: { id: '546679431' },
      viewer: { id: `viewer-${index}`, displayName: `Builder ${index + 1}` },
      payload: {
        messageId: `message-${index}`,
        text: Array(count).fill(name).join(' '),
        fragments: Array.from({ length: count }, () => ({ type: 'emote', text: name, emote: { id: '25', format: ['static'] } }))
      }
    });
  });
  const status = wall.status('local');
  assert.equal(status.pyramid.completed, 1);
  assert.equal(status.pyramid.building, false);
  assert.ok(status.pyramid.lastCompletedAt);
  assert.equal((wall.page().match(/new EventSource/g) || []).length, 1, 'one Browser Source creates one SSE connection');
  assert.match(wall.page(), /EMOTE PYRAMID/);
  wall.close();
});
