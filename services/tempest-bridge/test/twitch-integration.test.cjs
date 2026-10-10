const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { OFFICIAL_TWITCH_CLIENT_ID, TwitchIntegrationGateway, defaultTwitchScopes, describeTwitchOAuthError, normalizeTwitchEventSubNotification, normalizeTwitchPrediction } = require('../dist/twitch-integration');

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
  assert.match(message, /Advanced custom Twitch application/);
  assert.match(message, /Client Type Public/);
  assert.match(message, /disconnect and reconnect Twitch/);
  assert.doesNotMatch(message, /^missing client secret$/);
});

test('uses the official public Twitch application on a clean installation', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-official-client-'));
  const gateway = new TwitchIntegrationGateway({ dataDirectory, credentialStore: memoryCredentialStore(), fetchImplementation: async () => jsonResponse({}) });
  await gateway.initialize();

  assert.equal(gateway.status().configured, true);
  assert.equal(gateway.status().clientId, OFFICIAL_TWITCH_CLIENT_ID);
  assert.equal(gateway.status().clientIdMode, 'official');
  assert.equal(gateway.status().oauth.state, 'authorization-required');

  const configured = await gateway.configure({ scopes: ['user:read:chat'], rewardMappings: {} });
  assert.equal(configured.clientId, OFFICIAL_TWITCH_CLIENT_ID);
  assert.equal(configured.clientIdMode, 'official');
});

test('migrates an empty 1.0.0 Twitch configuration to the official application', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-official-migration-'));
  const configurationPath = path.join(dataDirectory, 'twitch-integration.json');
  await writeFile(configurationPath, JSON.stringify({ schemaVersion: 1, clientId: '', scopes: ['user:read:chat'], rewardMappings: {}, updatedAt: new Date().toISOString() }));
  const gateway = new TwitchIntegrationGateway({ dataDirectory, credentialStore: memoryCredentialStore(), fetchImplementation: async () => jsonResponse({}) });
  await gateway.initialize();

  assert.equal(gateway.status().clientId, OFFICIAL_TWITCH_CLIENT_ID);
  assert.equal(gateway.status().clientIdMode, 'official');
  assert.equal(JSON.parse(await readFile(configurationPath, 'utf8')).clientId, OFFICIAL_TWITCH_CLIENT_ID);
});

test('normalizes raid, Hype Train, goal, and Channel Point EventSub notifications', () => {
  const raid = normalizeTwitchEventSubNotification('channel.raid', { to_broadcaster_user_id: 'channel-1', from_broadcaster_user_id: 'raider-1', from_broadcaster_user_name: 'Raid Leader', viewers: 42 }, 'raid-message', '2026-08-28T00:00:00Z');
  assert.equal(raid.topic, 'viewer.raid.received');
  assert.equal(raid.payload.viewers, 42);
  const hype = normalizeTwitchEventSubNotification('channel.hype_train.progress', { broadcaster_user_id: 'channel-1', id: 'train-1', level: 3, total: 4200, progress: 720, goal: 1000, top_contributions: [{ user_id: 'viewer', user_name: 'Viewer', type: 'bits', total: 500 }] }, 'hype-message', '2026-08-28T00:00:01Z');
  assert.equal(hype.topic, 'channel.hype-train.updated');
  assert.equal(hype.payload.phase, 'progress');
  assert.equal(hype.payload.topContributions[0].userName, 'Viewer');
  const goal = normalizeTwitchEventSubNotification('channel.goal.progress', { broadcaster_user_id: 'channel-1', id: 'goal-1', type: 'subscription', description: 'Signal Goal', current_amount: 72, target_amount: 100 }, 'goal-message', '2026-08-28T00:00:02Z');
  assert.equal(goal.topic, 'channel.goal.updated');
  assert.equal(goal.payload.currentAmount, 72);
  const redemption = normalizeTwitchEventSubNotification('channel.channel_points_custom_reward_redemption.add', { broadcaster_user_id: 'channel-1', id: 'redemption-1', user_id: 'viewer-1', user_name: 'Nova', user_input: 'please', reward: { id: 'reward-purple', title: 'Purple Wisp', cost: 2500 } }, 'redemption-message', '2026-08-28T00:00:03Z');
  assert.equal(redemption.topic, 'viewer.reward.redeemed');
  assert.equal(redemption.viewer.id, 'viewer-1');
  assert.equal(redemption.payload.rewardId, 'reward-purple');
  assert.equal(redemption.payload.rewardTitle, 'Purple Wisp');
  assert.equal(redemption.payload.rewardCost, 2500);
});

test('normalizes Twitch Prediction totals and lifecycle fields', () => {
  const prediction = normalizeTwitchPrediction({
    id: 'prediction-1', title: 'Will the crew survive?', status: 'locked', prediction_window: 120,
    outcomes: [{ id: 'yes', title: 'Yes', users: 8, channel_points: 4200 }, { id: 'no', title: 'No', users: 3, channel_points: 900 }],
    created_at: '2026-10-10T01:00:00Z', locked_at: '2026-10-10T01:02:00Z'
  });
  assert.equal(prediction.status, 'LOCKED');
  assert.equal(prediction.outcomes[0].channelPoints, 4200);
  assert.equal(prediction.predictionWindow, 120);
  assert.equal(prediction.lockedAt, '2026-10-10T01:02:00Z');
});

test('creates, locks, and resolves official Twitch Channel Point Predictions', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-predictions-'));
  const scopes = [...defaultTwitchScopes];
  const credentials = memoryCredentialStore({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes });
  const requests = [];
  const prediction = (status, winningOutcomeId) => ({
    id: 'prediction-1', broadcaster_id: 'user-1', title: 'Will the crew survive?', status, prediction_window: 120,
    outcomes: [{ id: 'yes', title: 'Yes', users: 8, channel_points: 4200 }, { id: 'no', title: 'No', users: 3, channel_points: 900 }],
    winning_outcome_id: winningOutcomeId
  });
  const responses = [
    jsonResponse({ client_id: OFFICIAL_TWITCH_CLIENT_ID, login: 'tempeststreamer', user_id: 'user-1', scopes, expires_in: 3600 }),
    jsonResponse({ data: [prediction('ACTIVE')] }, 200),
    jsonResponse({ data: [prediction('LOCKED')] }, 200),
    jsonResponse({ data: [prediction('RESOLVED', 'yes')] }, 200)
  ];
  const gateway = new TwitchIntegrationGateway({ dataDirectory, credentialStore: credentials, fetchImplementation: async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return responses.shift();
  } });
  await gateway.initialize();
  const created = await gateway.createPrediction({ title: 'Will the crew survive?', outcomes: ['Yes', 'No'], predictionWindow: 120 });
  assert.equal(created.predictions.current.status, 'ACTIVE');
  assert.equal(JSON.parse(requests[1].init.body).prediction_window, 120);
  const locked = await gateway.endPrediction({ status: 'LOCKED' });
  assert.equal(locked.predictions.current.status, 'LOCKED');
  const resolved = await gateway.endPrediction({ status: 'RESOLVED', winningOutcomeId: 'yes' });
  assert.equal(resolved.predictions.current.winningOutcomeId, 'yes');
  assert.equal(JSON.parse(requests[3].init.body).winning_outcome_id, 'yes');
  assert.equal(requests[1].init.headers.Authorization, 'Bearer access-1');
});

test('creates a titled live Twitch clip without exposing its edit URL', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-clips-'));
  const scopes = [...defaultTwitchScopes];
  const credentials = memoryCredentialStore({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes });
  const requests = [];
  const responses = [
    jsonResponse({ client_id: OFFICIAL_TWITCH_CLIENT_ID, login: 'tempeststreamer', user_id: 'user-1', scopes, expires_in: 3600 }),
    jsonResponse({ data: [{ id: 'GreatClip', edit_url: 'https://clips.twitch.tv/GreatClip/edit' }] }, 202)
  ];
  const gateway = new TwitchIntegrationGateway({ dataDirectory, credentialStore: credentials, fetchImplementation: async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return responses.shift();
  } });
  await gateway.initialize();
  const clip = await gateway.createClip({ title: 'That boss fight', duration: 30 });
  assert.equal(clip.url, 'https://clips.twitch.tv/GreatClip');
  assert.equal(clip.editUrl, 'https://clips.twitch.tv/GreatClip/edit');
  assert.match(requests[1].url, /broadcaster_id=user-1/);
  assert.match(requests[1].url, /title=That\+boss\+fight/);
  assert.match(requests[1].url, /duration=30/);
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
  assert.match(gateway.status().lastError, /Client Type Public/);

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
