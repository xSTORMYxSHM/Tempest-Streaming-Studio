const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { KickIntegrationGateway } = require('../dist');

test('authorizes Kick with PKCE, subscribes to signed chat delivery, and posts platform-local replies', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-kick-'));
  context.after(() => rm(dataDirectory, { recursive: true, force: true }));
  let stored = null;
  const requests = [];
  const events = [];
  const gateway = new KickIntegrationGateway({
    dataDirectory,
    defaultRedirectUri: 'http://localhost:4765/v1/integrations/kick/oauth/callback',
    credentialStore: {
      available: true,
      async load() { return stored; },
      async save(value) { stored = structuredClone(value); },
      async clear() { stored = null; }
    },
    fetchImplementation: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url) === 'https://id.kick.com/oauth/token') return new Response(JSON.stringify({ access_token: 'kick-access', refresh_token: 'kick-refresh', expires_in: 3600, scope: 'user:read chat:write events:subscribe' }), { status: 200 });
      if (String(url) === 'https://api.kick.com/public/v1/users') return new Response(JSON.stringify({ data: [{ user_id: 445566, name: 'TempestCaster' }] }), { status: 200 });
      if (String(url).startsWith('https://api.kick.com/public/v1/events/subscriptions?')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (String(url) === 'https://api.kick.com/public/v1/events/subscriptions') return new Response(JSON.stringify({ data: [{ name: 'chat.message.sent', version: 1, subscription_id: '01KICKSUBSCRIPTION00000001' }] }), { status: 200 });
      if (String(url) === 'https://api.kick.com/public/v1/chat') return new Response(JSON.stringify({ data: { is_sent: true, message_id: '8c966837-bc9e-4f1f-aaf2-daf797912b97' } }), { status: 200 });
      if (String(url).startsWith('https://id.kick.com/oauth/revoke')) return new Response('', { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    },
    async onChatEvent(event) { events.push(event); }
  });
  await gateway.initialize();
  await gateway.configure({ clientId: 'kickclient123', clientSecret: 'kick-client-secret-value', redirectUri: 'http://localhost:4765/v1/integrations/kick/oauth/callback' });
  const authorization = await gateway.startAuthorization();
  const authorizeUrl = new URL(authorization.authorizationUri);
  assert.equal(authorizeUrl.hostname, 'id.kick.com');
  assert.equal(authorizeUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authorizeUrl.searchParams.get('scope'), /events:subscribe/);
  const status = await gateway.completeAuthorization({ code: 'authorization-code', state: authorizeUrl.searchParams.get('state') });
  assert.equal(status.oauth.state, 'authorized');
  assert.equal(status.oauth.account.username, 'TempestCaster');
  assert.equal(status.events.state, 'connected');

  await gateway.ingestWebhook({
    message_id: 'kick-message-1', created_at: '2026-09-12T12:00:00Z', content: '!studio',
    broadcaster: { user_id: 445566, username: 'TempestCaster', channel_slug: 'tempestcaster' },
    sender: { user_id: 778899, username: 'KickViewer', channel_slug: 'kickviewer', identity: { badges: [{ type: 'subscriber' }] } }
  }, '01KICKEVENT000000000000001', '2026-09-12T12:00:00Z');
  assert.equal(events.length, 1);
  assert.equal(events[0].source, 'kick');
  assert.deepEqual(events[0].viewer.roles, ['subscriber']);

  const sent = await gateway.postMessage({ message: 'Reply on Kick.' });
  assert.equal(sent.sent, true);
  const chatRequest = requests.find((entry) => entry.url.endsWith('/public/v1/chat'));
  assert.deepEqual(JSON.parse(chatRequest.options.body), { type: 'user', broadcaster_user_id: 445566, content: 'Reply on Kick.' });
  assert.equal((await gateway.disconnect()).oauth.state, 'authorization-required');
  assert.equal(stored, null);
});
