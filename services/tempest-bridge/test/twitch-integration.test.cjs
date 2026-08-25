const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { TwitchIntegrationGateway, describeTwitchOAuthError } = require('../dist/twitch-integration');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function memoryCredentialStore(initial = null) {
  let tokens = initial;
  return {
    available: true,
    async load() { return tokens ? structuredClone(tokens) : null; },
    async save(value) { tokens = structuredClone(value); },
    async clear() { tokens = null; },
    current() { return tokens ? structuredClone(tokens) : null; }
  };
}

test('turns Twitch confidential-client failures into public-client recovery guidance', () => {
  const message = describeTwitchOAuthError('missing client secret', 'OAuth failed.');
  assert.match(message, /Client Type to Public/);
  assert.match(message, /disconnect and reconnect Twitch/);
  assert.doesNotMatch(message, /^missing client secret$/);
});

test('clears stale OAuth errors and credentials when the Twitch client ID changes', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-client-change-'));
  const credentials = memoryCredentialStore();
  const setup = new TwitchIntegrationGateway({ dataDirectory, credentialStore: credentials, fetchImplementation: async () => jsonResponse({}) });
  await setup.initialize();
  await setup.configure({ clientId: 'client123', scopes: ['user:read:chat'], rewardMappings: {} });
  await credentials.save({ accessToken: 'expired-access', refreshToken: 'refresh-1', expiresAt: new Date().toISOString(), scopes: ['user:read:chat'] });

  const responses = [jsonResponse({ message: 'invalid access token' }, 401), jsonResponse({ message: 'missing client secret' }, 400)];
  const gateway = new TwitchIntegrationGateway({ dataDirectory, credentialStore: credentials, fetchImplementation: async () => responses.shift() });
  await gateway.initialize();
  assert.equal(gateway.status().oauth.state, 'error');
  assert.match(gateway.status().lastError, /Client Type to Public/);

  const changed = await gateway.configure({ clientId: 'client456', scopes: ['user:read:chat'], rewardMappings: {} });
  assert.equal(changed.oauth.state, 'authorization-required');
  assert.equal(changed.lastError, undefined);
  assert.equal(credentials.current(), null);
});

test('completes Twitch device authorization and applies reward mappings', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-device-'));
  const credentials = memoryCredentialStore();
  const responses = [
    jsonResponse({ device_code: 'device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://www.twitch.tv/activate', expires_in: 1800, interval: 1 }),
    jsonResponse({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 14400, scope: ['user:read:chat'] }),
    jsonResponse({ client_id: 'client123', login: 'tempeststreamer', user_id: 'user-1', scopes: ['user:read:chat'], expires_in: 14399 })
  ];
  const gateway = new TwitchIntegrationGateway({ dataDirectory, credentialStore: credentials, fetchImplementation: async () => responses.shift() });
  await gateway.initialize();
  await gateway.configure({ clientId: 'client123', scopes: ['user:read:chat'], rewardMappings: { 'reward-1': 'tempest.blackhole' } });

  const device = await gateway.startDeviceAuthorization();
  assert.equal(device.userCode, 'ABCD-EFGH');
  assert.equal(gateway.status().oauth.state, 'authorization-pending');

  const completed = await gateway.pollDeviceAuthorization();
  assert.equal(completed.pending, false);
  assert.equal(completed.status.oauth.state, 'authorized');
  assert.equal(completed.status.oauth.account.login, 'tempeststreamer');
  assert.equal(credentials.current().refreshToken, 'refresh-1');

  const ingestion = gateway.ingest({
    schemaVersion: 1,
    id: 'redemption-1',
    topic: 'viewer.reward.redeemed',
    occurredAt: new Date().toISOString(),
    source: 'twitch',
    channel: { id: 'user-1', login: 'tempeststreamer' },
    viewer: { id: 'viewer-1', displayName: 'Viewer' },
    payload: { redemptionId: 'redemption-1', rewardId: 'reward-1', rewardTitle: 'Black Hole' }
  });
  assert.equal(ingestion.event.payload.action, 'tempest.blackhole');
});

test('reactively rotates Twitch refresh tokens after validation returns 401', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-refresh-'));
  const credentials = memoryCredentialStore({ accessToken: 'expired-access', refreshToken: 'refresh-1', expiresAt: new Date().toISOString(), scopes: ['user:read:chat'] });
  const setup = new TwitchIntegrationGateway({ dataDirectory, credentialStore: credentials, fetchImplementation: async () => jsonResponse({}) });
  await setup.initialize();
  await setup.configure({ clientId: 'client123', scopes: ['user:read:chat'], rewardMappings: {} });
  await credentials.save({ accessToken: 'expired-access', refreshToken: 'refresh-1', expiresAt: new Date().toISOString(), scopes: ['user:read:chat'] });

  const responses = [
    jsonResponse({ message: 'invalid access token' }, 401),
    jsonResponse({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 14400, scope: ['user:read:chat'] }),
    jsonResponse({ client_id: 'client123', login: 'tempeststreamer', user_id: 'user-1', scopes: ['user:read:chat'], expires_in: 14399 })
  ];
  const gateway = new TwitchIntegrationGateway({ dataDirectory, credentialStore: credentials, fetchImplementation: async () => responses.shift() });
  await gateway.initialize();
  assert.equal(gateway.status().oauth.state, 'authorized');
  assert.equal(credentials.current().accessToken, 'access-2');
  assert.equal(credentials.current().refreshToken, 'refresh-2');
});
