const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TEMPEST_STUDIO_VERSION,
  TEMPEST_PROTOCOL_VERSION,
  createBridgeMessage,
  validateApplicationManifest,
  validateAssetManifest,
  validateBridgeMessage,
  validateNormalizedTwitchEvent,
  validateNormalizedKickChatEvent,
  validateDualFormatConfigureRequest,
  validateSimulcastConfigureRequest,
  validateSimulcastStartRequest,
  validateSimulcastStopRequest,
  validateWorkflowDefinition,
  validateInteractiveStageObjectInput,
  validateInteractiveStagePlacement,
  validateStageActorPackManifest
} = require('../dist');
const packageMetadata = require('../package.json');

test('keeps the shared Studio version aligned with package metadata', () => {
  assert.equal(TEMPEST_STUDIO_VERSION, packageMetadata.version);
});

test('validates bounded Interactive Stage objects and placements', () => {
  const object = validateInteractiveStageObjectInput({
    id: 'preview-object', kind: 'text', lifetimeMs: 5000,
    placement: { x: 0.25, y: 0.75, scale: 1.2, anchor: 'center', layer: 4 },
    properties: { label: 'Hello Stage', visible: true }
  }, new Date('2026-10-02T12:00:00.000Z'));
  assert.equal(object.ok, true);
  assert.equal(object.value.id, 'preview-object');
  assert.equal(object.value.expiresAt, '2026-10-02T12:00:05.000Z');
  assert.equal(validateInteractiveStagePlacement({ x: -0.1 }).ok, false);
  assert.equal(validateInteractiveStageObjectInput({ properties: { unsafe: { html: '<script>' } } }).ok, false);
  assert.equal(validateInteractiveStageObjectInput({ properties: { actorMotionClips: 'x'.repeat(1000) } }).ok, true);
  assert.equal(validateInteractiveStageObjectInput({ properties: { actorMotionClips: 'x'.repeat(6001) } }).ok, false);
});

test('validates code-free Stage Actor animation-strip manifests', () => {
  const pack = validateStageActorPackManifest({
    schemaVersion: 1,
    id: 'storm-knight',
    name: 'Storm Knight',
    version: '1.0.0',
    creator: 'Tempest Artist',
    defaultScale: 1,
    pivot: { x: 0.5, y: 1 },
    nameplate: { x: 0.5, y: 0.05 },
    collider: { x: 0.5, y: 0.6, width: 0.65, height: 0.8 },
    animations: {
      idle: { asset: 'idle.png', frameWidth: 128, frameHeight: 128, frames: 4, fps: 4, loop: true },
      attack: { asset: 'attack.png', frameWidth: 128, frameHeight: 128, frames: 6, fps: 12, loop: false, returnsToIdle: true }
    },
    appearance: {
      colorSlots: {
        primary: { label: 'Jacket', defaultOptionId: 'navy', options: [{ id: 'navy', name: 'Navy', color: '#1B2A59' }] },
        secondary: { label: 'Wisp', defaultOptionId: 'cyan', options: [{ id: 'cyan', name: 'Cyan', color: '#27E5FF' }] }
      },
      masks: {
        idle: { primary: 'idle-primary.png', secondary: 'idle-secondary.png' },
        attack: { primary: 'attack-primary.png', secondary: 'attack-secondary.png' }
      }
    }
  }, new Date('2026-10-02T12:00:00.000Z'));
  assert.equal(pack.ok, true, pack.errors.join(' '));
  assert.equal(pack.value.animations.attack.frames, 6);
  assert.equal(pack.value.appearance.colorSlots.primary.label, 'Jacket');
  assert.equal(pack.value.appearance.colorSlots.secondary.options[0].color, '#27E5FF');
  assert.equal(validateStageActorPackManifest({ ...pack.value, animations: { idle: { ...pack.value.animations.idle, asset: '../escape.png' } } }).ok, false);
  assert.equal(validateStageActorPackManifest({ ...pack.value, animations: { attack: pack.value.animations.attack } }).ok, false);
  assert.equal(validateStageActorPackManifest({ ...pack.value, appearance: { ...pack.value.appearance, colorSlots: { ...pack.value.appearance.colorSlots, primary: { ...pack.value.appearance.colorSlots.primary, defaultOptionId: 'missing' } } } }).ok, false);
});

test('validates the canonical row-based Stage Actor atlas format', () => {
  const pack = validateStageActorPackManifest({
    schemaVersion: 3, id: 'row-atlas-avatar', name: 'Row Atlas Avatar', version: '1.0.0', preferredRenderer: 'sprite', defaultScale: 1,
    pivot: { x: 0.5, y: 1 }, nameplate: { x: 0.5, y: 0 }, collider: { x: 0.5, y: 0.55, width: 0.7, height: 0.85 },
    atlas: { asset: 'avatar.png', frameWidth: 128, frameHeight: 128, columns: 10, rows: 6, layout: 'rows' },
    animations: {
      idle: { asset: 'avatar.png', frameWidth: 128, frameHeight: 128, row: 0, frames: 2, fps: 4, loop: true },
      walk: { asset: 'avatar.png', frameWidth: 128, frameHeight: 128, row: 1, frames: 7, fps: 9, loop: true },
      attack: { asset: 'avatar.png', frameWidth: 128, frameHeight: 128, row: 5, frames: 6, fps: 12, loop: false }
    }
  }, new Date('2026-10-03T12:00:00.000Z'));
  assert.equal(pack.ok, true, pack.errors.join(' '));
  assert.equal(pack.value.atlas.columns, 10);
  assert.equal(pack.value.animations.attack.row, 5);
  assert.equal(validateStageActorPackManifest({ ...pack.value, animations: { ...pack.value.animations, attack: { ...pack.value.animations.attack, row: 1 } } }).ok, false);
  assert.equal(validateStageActorPackManifest({ ...pack.value, animations: { ...pack.value.animations, attack: { ...pack.value.animations.attack, frames: 11 } } }).ok, false);
});

test('validates layered Stage Actor v2 rigs while retaining sprite fallbacks', () => {
  const source = {
    schemaVersion: 2,
    id: 'storm-wisp-rig',
    name: 'Storm Wisp Rig',
    version: '2.0.0',
    defaultScale: 0.75,
    pivot: { x: 0.5, y: 1 },
    nameplate: { x: 0.5, y: 0.05 },
    collider: { x: 0.5, y: 0.58, width: 0.62, height: 0.82 },
    animations: {
      idle: { asset: 'fallback-idle.webp', frameWidth: 256, frameHeight: 256, frames: 4, fps: 8, loop: true }
    },
    rig: {
      canvas: { width: 512, height: 512 },
      bones: [
        { id: 'root', x: 256, y: 480 },
        { id: 'torso', parent: 'root', x: 0, y: -128, length: 120 },
        { id: 'head', parent: 'torso', x: 0, y: -92, length: 72 }
      ],
      layers: [
        { id: 'body', bone: 'torso', asset: 'body.webp', order: 0, pivot: { x: 0.5, y: 0.8 }, x: 2, y: -4, scaleX: 0.8, scaleY: 0.8, flipX: true, tintSlot: 'primary', source: { x: 32, y: 16, width: 192, height: 224 }, deform: { axis: 'y', segments: 8, amount: 5, speed: 1.5, phase: 0.4 } },
        { id: 'face', bone: 'head', asset: 'face.png', order: 2, pivot: { x: 0.5, y: 0.5 }, tintSlot: 'secondary', states: ['idle', 'walk'] }
      ],
      attachments: [{ id: 'hat', bone: 'head', x: 0, y: -55, rotation: 0 }],
      clips: {
        idle: {
          durationMs: 1200, loop: true, returnsToIdle: false,
          tracks: [{ target: 'torso', keyframes: [{ timeMs: 0, y: -128 }, { timeMs: 600, y: -133, interpolation: 'ease-in-out' }, { timeMs: 1200, y: -128 }] }]
        },
        walk: {
          durationMs: 500, loop: true, returnsToIdle: false,
          tracks: [{ target: 'root', keyframes: [{ timeMs: 0, rotation: -2 }, { timeMs: 250, rotation: 2 }, { timeMs: 500, rotation: -2 }] }]
        }
      }
    }
  };
  const pack = validateStageActorPackManifest(source, new Date('2026-10-03T12:00:00.000Z'));
  assert.equal(pack.ok, true, pack.errors.join(' '));
  assert.equal(pack.value.schemaVersion, 2);
  assert.equal(pack.value.preferredRenderer, 'sprite');
  assert.equal(pack.value.rig.bones[2].parent, 'torso');
  assert.equal(pack.value.rig.layers[0].tintSlot, 'primary');
  assert.deepEqual(pack.value.rig.layers[0].source, { x: 32, y: 16, width: 192, height: 224 });
  assert.equal(pack.value.rig.layers[0].scaleX, 0.8);
  assert.equal(pack.value.rig.layers[0].flipX, true);
  assert.deepEqual(pack.value.rig.layers[0].deform, { axis: 'y', segments: 8, amount: 5, speed: 1.5, phase: 0.4, anchor: 'start' });
  assert.deepEqual(pack.value.rig.layers[1].states, ['idle', 'walk']);
  assert.equal(pack.value.rig.clips.walk.durationMs, 500);
  assert.equal(pack.value.animations.idle.asset, 'fallback-idle.webp');

  const templated = structuredClone(source);
  templated.preferredRenderer = 'rig';
  templated.rig.template = { id: 'humanoid-wisp-v1', version: '1.0.0', textureAsset: 'template.png', guideAsset: 'guide.png', width: 512, height: 1024, cellWidth: 512, cellHeight: 512, boundsPolicy: 'source-rect' };
  templated.rig.layers[0] = { ...templated.rig.layers[0], asset: 'template.png', templatePart: 'body', source: { x: 0, y: 0, width: 512, height: 512 } };
  templated.rig.layers[1] = { ...templated.rig.layers[1], asset: 'template.png', templatePart: 'face', source: { x: 0, y: 512, width: 512, height: 512 } };
  const templatePack = validateStageActorPackManifest(templated);
  assert.equal(templatePack.ok, true, templatePack.errors.join(' '));
  assert.equal(templatePack.value.rig.template.boundsPolicy, 'source-rect');
  assert.equal(templatePack.value.preferredRenderer, 'rig');
  assert.equal(templatePack.value.rig.layers[1].templatePart, 'face');
  const escapedTemplate = structuredClone(templated);
  escapedTemplate.rig.layers[1].source.x = 128;
  assert.equal(validateStageActorPackManifest(escapedTemplate).ok, false);

  const cyclic = structuredClone(source);
  cyclic.rig.bones[0].parent = 'head';
  assert.equal(validateStageActorPackManifest(cyclic).ok, false);
  const unsafeAsset = structuredClone(source);
  unsafeAsset.rig.layers[0].asset = '../body.webp';
  assert.equal(validateStageActorPackManifest(unsafeAsset).ok, false);
  const unordered = structuredClone(source);
  unordered.rig.clips.idle.tracks[0].keyframes[2].timeMs = 500;
  assert.equal(validateStageActorPackManifest(unordered).ok, false);
  const invalidDeform = structuredClone(source);
  invalidDeform.rig.layers[0].deform.segments = 1;
  assert.equal(validateStageActorPackManifest(invalidDeform).ok, false);
  const invalidStates = structuredClone(source);
  invalidStates.rig.layers[1].states = ['idle', 'idle'];
  assert.equal(validateStageActorPackManifest(invalidStates).ok, false);
  assert.equal(validateStageActorPackManifest({ ...source, schemaVersion: 1 }).ok, false);
});

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

test('validates normalized Kick chat events and Kick workflow triggers', () => {
  const event = validateNormalizedKickChatEvent({
    schemaVersion: 1,
    id: 'kick:message-123',
    topic: 'viewer.chat.message',
    occurredAt: new Date().toISOString(),
    source: 'kick',
    channel: { id: '445566', login: 'creator' },
    viewer: { id: '778899', login: 'viewer', roles: ['subscriber'] },
    payload: { messageId: 'message-123', text: '!studio' }
  });
  assert.equal(event.ok, true, event.errors.join(' '));
  const workflow = validateWorkflowDefinition({
    schemaVersion: 1,
    id: 'com.tempestmainframe.workflow.kick-chat',
    name: 'Kick Chat Trigger', enabled: true,
    trigger: { type: 'kick.chat', action: 'tempest.chat-command' },
    actions: [{ id: 'notify', name: 'Notify', target: 'com.tempestmainframe.tempest-broadcast', capability: 'broadcast.notify' }]
  });
  assert.equal(workflow.ok, true, workflow.errors.join(' '));
});

test('validates guarded Twitch Dual Format configuration requests', () => {
  const enabled = validateDualFormatConfigureRequest({ enabled: true, canvasPreset: '1080x1920', canvasName: 'Mobile Main' });
  assert.equal(enabled.ok, true, enabled.errors.join(' '));
  assert.deepEqual(enabled.value, { enabled: true, canvasPreset: '1080x1920', canvasName: 'Mobile Main' });
  const defaults = validateDualFormatConfigureRequest({ enabled: false });
  assert.deepEqual(defaults.value, { enabled: false, canvasPreset: '1080x1920', canvasName: 'Tempest Vertical' });
  assert.equal(validateDualFormatConfigureRequest({ enabled: true, canvasPreset: '1920x1080' }).ok, false);
  assert.equal(validateDualFormatConfigureRequest({ enabled: 'yes' }).ok, false);
});

test('validates production simulcast configuration and guarded output actions', () => {
  const configured = validateSimulcastConfigureRequest({
    enabled: true,
    kickServer: 'rtmps://ingest.example.test/app',
    kickStreamKey: 'live_stream_key_123',
    uploadCapacityKbps: 25000,
    recordingWithStream: true
  });
  assert.equal(configured.ok, true, configured.errors.join(' '));
  assert.equal(configured.value.kickServer, 'rtmps://ingest.example.test/app');
  assert.equal(configured.value.recordingWithStream, true);
  assert.equal(validateSimulcastConfigureRequest({ enabled: true, kickServer: 'https://example.test', kickStreamKey: 'short' }).ok, false);
  assert.equal(validateSimulcastConfigureRequest({ enabled: true, kickServer: 'rtmp://user:pass@example.test/app', kickStreamKey: 'valid_key_123' }).ok, false);
  assert.equal(validateSimulcastStartRequest({ recording: true, operatorChecklistAccepted: true }).ok, true);
  assert.equal(validateSimulcastStartRequest({ recording: 'yes' }).ok, false);
  assert.deepEqual(validateSimulcastStopRequest({ scope: 'kick', force: true }).value, { scope: 'kick', force: true });
  assert.equal(validateSimulcastStopRequest({ scope: 'twitch' }).ok, false);
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

  const chatWithEmote = validateNormalizedTwitchEvent({
    ...base,
    id: 'chat-message-emote-1',
    topic: 'viewer.chat.message',
    payload: {
      messageId: 'chat-message-emote-1',
      text: 'Kappa',
      fragments: [{ type: 'emote', text: 'Kappa', emote: { id: '25', format: ['static', 'animated'] } }]
    }
  });
  assert.equal(chatWithEmote.ok, true, chatWithEmote.errors.join(' '));

  const chatWithProviderText = validateNormalizedTwitchEvent({
    ...base,
    id: 'chat-message-provider-1',
    topic: 'viewer.chat.message',
    payload: { messageId: 'chat-message-provider-1', text: 'SevenDance', fragments: [{ type: 'text', text: 'SevenDance' }] }
  });
  assert.equal(chatWithProviderText.ok, true, chatWithProviderText.errors.join(' '));

  const goalProgress = validateNormalizedTwitchEvent({
    ...base,
    id: 'goal-progress-1',
    topic: 'channel.goal.updated',
    payload: { phase: 'progress', goalId: 'goal-1', description: 'Signal Goal', currentAmount: 72, targetAmount: 100 }
  });
  assert.equal(goalProgress.ok, true, goalProgress.errors.join(' '));

  const unsafeGif = validateNormalizedTwitchEvent({
    ...base,
    id: 'chat-message-gif-1',
    topic: 'viewer.chat.message',
    payload: { messageId: 'chat-message-gif-1', text: 'GIF', fragments: [{ type: 'gif', text: 'GIF', gif: { url: 'javascript:alert(1)' } }] }
  });
  assert.equal(unsafeGif.ok, false);
});
