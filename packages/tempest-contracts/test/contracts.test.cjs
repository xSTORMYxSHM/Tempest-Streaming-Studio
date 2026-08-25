const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TEMPEST_PROTOCOL_VERSION,
  createBridgeMessage,
  validateApplicationManifest,
  validateAssetManifest,
  validateBridgeMessage,
  validateNormalizedTwitchEvent,
  validateWorkflowDefinition
} = require('../dist');

test('accepts a namespaced application manifest', () => {
  const result = validateApplicationManifest({
    schemaVersion: 1,
    id: 'com.tempestmainframe.quartic-pulse',
    name: 'Quartic Pulse',
    version: '0.40.1',
    apiVersion: '1.0',
    state: 'installed',
    capabilities: { provides: ['transport.clock'], consumes: ['scene.visual'] },
    assetTypes: { reads: ['tempest.visual'], writes: ['tempest.performance'] }
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.id, 'com.tempestmainframe.quartic-pulse');
});

test('rejects an unsafe application identifier', () => {
  const result = validateApplicationManifest({
    schemaVersion: 1,
    id: 'Quartic Pulse',
    name: 'Quartic Pulse',
    version: '0.40.1',
    apiVersion: '1.0',
    state: 'installed',
    capabilities: { provides: [], consumes: [] },
    assetTypes: { reads: [], writes: [] }
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /namespaced lowercase identifier/);
});

test('validates asset manifests and bridge envelopes', () => {
  const asset = validateAssetManifest({
    schemaVersion: 1,
    id: 'com.tempestmainframe.asset.data-horizon-demo',
    type: 'tempest.scene',
    name: 'Data Horizon Demo',
    version: '1.0.0',
    producer: 'com.tempestmainframe.data-horizon',
    uri: 'file:///C:/Tempest/data-horizon.tempest-scene',
    tags: ['visual', 'audio-reactive']
  });
  assert.equal(asset.ok, true);

  const message = createBridgeMessage({ kind: 'publish', source: 'test.client', topic: 'transport.state', payload: { playing: true } });
  assert.equal(message.protocolVersion, TEMPEST_PROTOCOL_VERSION);
  assert.equal(validateBridgeMessage(message).ok, true);
});

test('validates reversible viewer-interaction workflows', () => {
  const result = validateWorkflowDefinition({
    schemaVersion: 1,
    id: 'com.tempestmainframe.workflow.test-event',
    name: 'Test Event',
    enabled: true,
    trigger: { type: 'viewer.interaction', action: 'tempest.test-event' },
    cooldowns: { viewerMs: 60000, effectMs: 15000 },
    concurrencyGroup: 'major-event',
    maximumConcurrent: 1,
    actions: [{
      id: 'visual',
      name: 'Show visual',
      target: 'com.tempestmainframe.data-horizon',
      capability: 'scene.visualization.activate',
      releaseCapability: 'scene.visualization.clear',
      arguments: { visualization: 'test' },
      forwardInteractionPayload: true,
      whenPayload: { field: 'visualsEnabled', equals: true },
      lease: { durationMs: 15000, durationInput: 'durationMs', fadeOutMs: 800 }
    }]
  });
  assert.equal(result.ok, true, result.errors.join(' '));
  assert.equal(result.value.actions[0].lease.durationMs, 15000);
  assert.deepEqual(result.value.actions[0].whenPayload, { field: 'visualsEnabled', equals: true });
});

test('validates canonical Twitch interaction and reward events', () => {
  const base = {
    schemaVersion: 1,
    id: 'twitch-message-123',
    occurredAt: new Date().toISOString(),
    source: 'twitch',
    channel: { id: 'channel-1', login: 'storm' },
    viewer: { id: 'viewer-1', displayName: 'Viewer' }
  };
  const interaction = validateNormalizedTwitchEvent({
    ...base,
    topic: 'viewer.interaction.requested',
    payload: { action: 'tempest.blackhole' }
  });
  assert.equal(interaction.ok, true, interaction.errors.join(' '));

  const reward = validateNormalizedTwitchEvent({
    ...base,
    id: 'reward-redemption-123',
    topic: 'viewer.reward.redeemed',
    payload: { redemptionId: 'redemption-1', rewardId: 'reward-1', rewardTitle: 'Black Hole', rewardCost: 500, action: 'tempest.blackhole' }
  });
  assert.equal(reward.ok, true, reward.errors.join(' '));

  const soundAlert = validateNormalizedTwitchEvent({
    ...base,
    id: 'sound-alert-123',
    topic: 'viewer.interaction.requested',
    payload: { action: 'tempest.sound-alert.performance', cue: 'song-branch-01', durationMs: 58000, intensity: 0.8, dedupeId: 'sound-alert-123' }
  });
  assert.equal(soundAlert.ok, true, soundAlert.errors.join(' '));
});
