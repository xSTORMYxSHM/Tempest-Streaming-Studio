const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { startTempestBridge } = require('../dist');

async function start(dataDirectory) {
  const directory = dataDirectory || await mkdtemp(path.join(os.tmpdir(), 'tempest-interactive-world-'));
  const runtime = await startTempestBridge({ port: 0, dataDirectory: directory, logger: { info() {}, warn() {}, error() {} } });
  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  const request = (route, body, method = 'POST') => fetch(`${runtime.baseUrl}${route}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { runtime, headers, request, dataDirectory: directory };
}

test('Interactive World drives crowd avatars, pet, battles, gaze, safety, and persistence through Stage', async (context) => {
  const first = await start();
  let runtime = first.runtime;
  context.after(async () => { await runtime.close().catch(() => {}); });

  assert.equal((await fetch(`${runtime.baseUrl}/v1/interactive-world`)).status, 401);

  assert.equal((await first.request('/v1/interactive-stage/layout', { worldMap: { enabled: false } })).status, 200);
  let floorStage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: first.headers }).then((response) => response.json());
  assert.equal(floorStage.worldMap.enabled, false);

  for (const viewer of [
    { platform: 'twitch', userId: 'viewer-1', displayName: 'Nova', accent: '#54F2EB' },
    { platform: 'kick', userId: 'viewer-2', displayName: 'Rook', accent: '#FF667A' }
  ]) assert.equal((await first.request('/v1/interactive-world/viewers', viewer)).status, 201);

  floorStage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: first.headers }).then((response) => response.json());
  assert.equal(floorStage.worldMap.enabled, false);
  assert.equal((await first.request('/v1/interactive-stage/layout', { worldMap: { enabled: false } })).status, 200);
  floorStage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: first.headers }).then((response) => response.json());
  assert.equal(floorStage.worldMap.enabled, false);

  let world = await fetch(`${runtime.baseUrl}/v1/interactive-world`, { headers: first.headers }).then((response) => response.json());
  assert.equal(world.activeViewers, 2);
  assert.deepEqual(world.viewers.map((viewer) => viewer.key), ['twitch:viewer-1', 'kick:viewer-2']);

  const controlled = await first.request('/v1/interactive-world/viewers/twitch%3Aviewer-1/control', { action: 'right' });
  assert.equal(controlled.status, 202);
  assert.equal((await controlled.json()).control.sequence, 1);
  let controlledStage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: first.headers }).then((response) => response.json());
  const controlledAvatar = controlledStage.objects.find((object) => object.owner?.userId === 'viewer-1');
  assert.equal(controlledAvatar.properties.worldControlAction, 'right');
  assert.equal(controlledAvatar.properties.worldControlSequence, 1);

  assert.equal((await first.request('/v1/interactive-world/pet/settings', { enabled: true, name: 'Nimbus' })).status, 200);
  assert.equal((await first.request('/v1/interactive-world/pet/actions', { action: 'play', actor: 'Nova' })).status, 202);
  world = await fetch(`${runtime.baseUrl}/v1/interactive-world`, { headers: first.headers }).then((response) => response.json());
  assert.equal(world.pet.enabled, true);
  assert.equal(world.pet.state, 'play');
  assert.ok(world.pet.affinity > 0);

  const battleResponse = await first.request('/v1/interactive-world/battle/start', { mode: 'duel' });
  assert.equal(battleResponse.status, 201);
  const battle = (await battleResponse.json()).battle;
  assert.equal(battle.participants.length, 2);
  for (let index = 0; index < 5; index += 1) {
    const response = await first.request('/v1/interactive-world/battle/action', { action: 'attack', attackerKey: battle.participants[0].viewerKey, targetKey: battle.participants[1].viewerKey, amount: 20, bypassCooldown: true });
    assert.equal(response.status, 202);
  }
  world = await fetch(`${runtime.baseUrl}/v1/interactive-world`, { headers: first.headers }).then((response) => response.json());
  assert.equal(world.battle.state, 'complete');
  assert.equal(world.battle.winner, 'Nova');

  assert.equal((await first.request('/v1/interactive-world/gaze/settings', { enabled: true, adapter: 'simulator', effect: 'target' })).status, 200);
  assert.equal((await first.request('/v1/interactive-world/gaze/sample', { x: 0.7, y: 0.3, confidence: 1 })).status, 202);
  const stage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: first.headers }).then((response) => response.json());
  assert.ok(stage.objects.some((object) => object.kind === 'avatar'));
  assert.ok(stage.objects.some((object) => object.kind === 'pet'));
  assert.ok(stage.objects.some((object) => object.id === 'sensor:gaze'));

  const twitchAction = (id, action, viewer, payload = {}) => first.request('/v1/integrations/twitch/events', {
    schemaVersion: 1,
    id,
    topic: 'viewer.interaction.requested',
    occurredAt: new Date().toISOString(),
    source: 'twitch',
    channel: { id: '546679431', login: 'tempest' },
    viewer,
    payload: { action, ...payload }
  });
  const joined = await twitchAction('world-extension-join', 'tempest.avatar.join', { id: 'viewer-3', displayName: 'Echo' });
  assert.equal(joined.status, 202);
  assert.equal((await joined.json()).world.viewers.some((viewer) => viewer.key === 'twitch:viewer-3'), true);
  const moved = await twitchAction('world-extension-left', 'tempest.avatar.left', { id: 'viewer-3', displayName: 'Echo' });
  assert.equal(moved.status, 202);
  assert.equal((await moved.json()).world.viewers.some((viewer) => viewer.key === 'twitch:viewer-3'), true);
  const petAction = await twitchAction('world-extension-pet', 'tempest.pet.play', { id: 'viewer-3', displayName: 'Echo' });
  assert.equal(petAction.status, 202);
  assert.equal((await petAction.json()).world.pet.state, 'play');
  const viewerAttack = await twitchAction('world-extension-attack', 'tempest.viewer-attack', { id: 'viewer-3', displayName: 'Echo' }, { placement: { x: 0.25, y: 0.75 }, intensity: 0.8 });
  assert.equal(viewerAttack.status, 202);
  const attackedStage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: first.headers }).then((response) => response.json());
  assert.ok(attackedStage.objects.some((object) => object.id.startsWith('effect:viewer-attack:') && object.owner?.userId === 'viewer-3'));

  const policy = await first.request('/v1/interactive-world/safety', { maximumCrowd: 2, reducedMotion: true, allowJumpscares: false });
  assert.equal(policy.status, 200);
  const rejected = await first.request('/v1/interactive-world/viewers', { platform: 'studio', userId: 'viewer-3', displayName: 'Third' });
  assert.equal(rejected.status, 400);

  const stopped = await first.request('/v1/safety/stop', { reason: 'test' });
  assert.equal(stopped.status, 200);
  assert.equal((await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: first.headers }).then((response) => response.json())).activeCount, 0);
  await runtime.close();

  const second = await start(first.dataDirectory);
  runtime = second.runtime;
  world = await fetch(`${runtime.baseUrl}/v1/interactive-world`, { headers: second.headers }).then((response) => response.json());
  assert.equal(world.activeViewers, 2);
  assert.equal(world.pet.name, 'Nimbus');
  assert.equal(world.gaze.connected, false);
  let restoredStage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: second.headers }).then((response) => response.json());
  assert.equal(restoredStage.activeCount, 0);
  assert.equal(restoredStage.worldMap.enabled, false);
  await second.request('/v1/safety/arm', {});
  restoredStage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers: second.headers }).then((response) => response.json());
  assert.ok(restoredStage.objects.some((object) => object.kind === 'avatar'));
  assert.ok(restoredStage.objects.some((object) => object.kind === 'pet'));
  assert.equal(restoredStage.worldMap.enabled, false);
});

test('Interactive roadmap systems cover automatic presence, cosmetics, protected zones, recipes, invitations, and adapter diagnostics', async (context) => {
  const fixture = await start();
  context.after(async () => fixture.runtime.close());

  await fixture.request('/v1/interactive-world/presence/settings', { avatarScale: 1.5, minimumMessages: 1, inactiveAfterMs: 30_000, removeFromStageAfterMs: 60_000 });
  const chat = (id, userId, displayName, text, occurredAt = new Date().toISOString()) => fixture.request('/v1/integrations/twitch/events', {
    schemaVersion: 1, id, topic: 'viewer.chat.message', occurredAt, source: 'twitch', channel: { id: 'channel-1' }, viewer: { id: userId, displayName }, payload: { messageId: id, text }
  });
  assert.equal((await chat('presence-1', 'auto-1', 'Automatic', 'hello')).status, 202);
  let world = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-world`, { headers: fixture.headers }).then((response) => response.json());
  assert.equal(world.viewers.some((viewer) => viewer.key === 'twitch:auto-1'), true);
  assert.equal(world.presence.avatarScale, 1.5);
  let sizedStage = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-stage`, { headers: fixture.headers }).then((response) => response.json());
  assert.equal(sizedStage.objects.find((object) => object.owner?.userId === 'auto-1').placement.scale, 1.08);
  assert.equal((await chat('movement-1', 'auto-1', 'Automatic', '!right')).status, 202);
  let movementStage = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-stage`, { headers: fixture.headers }).then((response) => response.json());
  assert.equal(movementStage.objects.find((object) => object.owner?.userId === 'auto-1').properties.worldControlAction, 'right');

  const cosmetics = await fixture.request('/v1/interactive-world/viewers/twitch%3Aauto-1/cosmetics', { title: 'Storm Caller', accessories: ['Crown', 'Cape'], primaryColor: '#112233', secondaryColor: '#B99CFF', layers: [{ id: 'spark', glyph: '✦', color: '#B99CFF', position: 'head' }] });
  assert.equal(cosmetics.status, 200);
  world = await cosmetics.json();
  assert.equal(world.viewer.cosmetics.layers[0].glyph, '✦');
  assert.equal(world.viewer.cosmetics.title, 'Storm Caller');

  const configuredRedeems = await fixture.request('/v1/interactive-world/avatar-redeems', { redeems: [
    { id: 'purple-wisp', name: 'Purple Wisp', rewardTitle: 'Purple Wisp', effect: 'primary-color', value: '#AA55FF', enabled: true },
    { id: 'storm-crown', name: 'Storm Crown', rewardId: 'reward-crown', effect: 'accessory', value: 'Storm Crown', enabled: true },
    { id: 'wisp-champion', name: 'Wisp Champion', rewardId: 'reward-title', effect: 'title', value: 'Wisp Champion', persistence: 'profile', enabled: true }
  ] });
  assert.equal(configuredRedeems.status, 200);
  const rewarded = await fixture.request('/v1/integrations/twitch/events', {
    schemaVersion: 1, id: 'avatar-redemption-1', topic: 'viewer.reward.redeemed', occurredAt: new Date().toISOString(), source: 'twitch',
    channel: { id: 'channel-1' }, viewer: { id: 'auto-1', displayName: 'Automatic' },
    payload: { redemptionId: 'avatar-redemption-1', rewardId: 'reward-purple', rewardTitle: 'Purple Wisp', rewardCost: 2500 }
  });
  assert.equal(rewarded.status, 202);
  assert.equal((await rewarded.json()).avatarRedemption.effect, 'primary-color');
  let rewardStage = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-stage`, { headers: fixture.headers }).then((response) => response.json());
  assert.equal(rewardStage.objects.find((object) => object.owner?.userId === 'auto-1').properties.accent, '#AA55FF');
  world = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-world`, { headers: fixture.headers }).then((response) => response.json());
  assert.equal(world.avatarRewardSession.activeViewerCount, 1);
  assert.equal(world.viewers.find((viewer) => viewer.key === 'twitch:auto-1').cosmetics.primaryColor, '#112233');
  const resetRewards = await fixture.request('/v1/interactive-world/avatar-redeems/reset-session', {});
  assert.equal(resetRewards.status, 200);
  rewardStage = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-stage`, { headers: fixture.headers }).then((response) => response.json());
  assert.equal(rewardStage.objects.find((object) => object.owner?.userId === 'auto-1').properties.accent, '#112233');
  const permanentReward = await fixture.request('/v1/integrations/twitch/events', {
    schemaVersion: 1, id: 'avatar-redemption-2', topic: 'viewer.reward.redeemed', occurredAt: new Date().toISOString(), source: 'twitch',
    channel: { id: 'channel-1' }, viewer: { id: 'auto-1', displayName: 'Automatic' },
    payload: { redemptionId: 'avatar-redemption-2', rewardId: 'reward-title', rewardTitle: 'Wisp Champion', rewardCost: 5000 }
  });
  assert.equal(permanentReward.status, 202);
  assert.equal((await permanentReward.json()).avatarRedemption.persistence, 'profile');
  await fixture.request('/v1/interactive-world/avatar-redeems/reset-session', {});
  world = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-world`, { headers: fixture.headers }).then((response) => response.json());
  assert.equal(world.viewers.find((viewer) => viewer.key === 'twitch:auto-1').cosmetics.title, 'Wisp Champion');
  const durableWorld = JSON.parse(await readFile(path.join(fixture.dataDirectory, 'interactive-world.json'), 'utf8'));
  assert.equal(durableWorld.viewers.find((viewer) => viewer.key === 'twitch:auto-1').cosmetics.title, 'Wisp Champion');
  assert.deepEqual(durableWorld.viewers.find((viewer) => viewer.key === 'twitch:auto-1').unlockedAvatarRedeemIds, ['wisp-champion']);

  assert.equal((await fixture.request('/v1/interactive-stage/layout', { collisionAvoidance: true, protectedZones: [{ id: 'camera', name: 'Face cam', x: 0.4, y: 0.4, width: 0.2, height: 0.2, enabled: true, orientations: ['horizontal', 'vertical'] }] })).status, 200);
  const placed = await fixture.request('/v1/interactive-stage/objects', { id: 'protected-test', kind: 'text', placement: { x: 0.5, y: 0.5, scale: 1, anchor: 'center', layer: 1 }, properties: { label: 'Safe', glyph: 'SAFE' } });
  assert.equal(placed.status, 201);
  const placedObject = (await placed.json()).object;
  assert.notDeepEqual([placedObject.placement.x, placedObject.placement.y], [0.5, 0.5]);

  const recipe = await fixture.request('/v1/interaction-composer/recipes', { id: 'hello-stage', name: 'Hello Stage', enabled: true, trigger: { type: 'chat-command', value: '!hello' }, cooldownMs: 0, actions: [{ id: 'message', type: 'stage-message', delayMs: 0, settings: { message: 'Hello from chat', glyph: 'HI' } }] });
  assert.equal(recipe.status, 200);
  assert.equal((await chat('recipe-1', 'auto-1', 'Automatic', '!hello')).status, 202);
  let stage = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-stage`, { headers: fixture.headers }).then((response) => response.json());
  assert.ok(stage.objects.some((object) => object.properties?.label === 'Hello from chat'));

  await fixture.request('/v1/interactive-world/viewers', { platform: 'twitch', userId: 'auto-2', displayName: 'Opponent' });
  const invited = await fixture.request('/v1/interactive-world/battle/start', { mode: 'duel', viewerKeys: ['twitch:auto-1', 'twitch:auto-2'], inviteOnly: true });
  assert.equal(invited.status, 201);
  assert.equal((await invited.json()).battle.state, 'waiting');
  assert.equal((await fixture.request('/v1/interactive-world/battle/accept', { viewerKey: 'twitch:auto-1' })).status, 202);
  const accepted = await fixture.request('/v1/interactive-world/battle/accept', { viewerKey: 'twitch:auto-2' });
  assert.equal((await accepted.json()).battle.state, 'active');

  const oldAt = new Date(Date.now() - 120_000).toISOString();
  assert.equal((await chat('presence-old', 'old-viewer', 'Sleeper', 'old', oldAt)).status, 202);
  await fixture.request('/v1/interactive-world/presence/sweep', {});
  world = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-world`, { headers: fixture.headers }).then((response) => response.json());
  const sleeper = world.viewers.find((viewer) => viewer.key === 'twitch:old-viewer');
  assert.equal(sleeper.onStage, false);
  assert.equal(sleeper.presence, 'inactive');
  assert.ok(world.savedViewerProfiles > world.activeViewers);

  const adapter = await fetch(`${fixture.runtime.baseUrl}/v1/interactive-world/gaze/adapter`, { headers: fixture.headers }).then((response) => response.json());
  assert.equal(adapter.state, 'unconfigured');
  assert.match(adapter.message, /TEMPEST_TOBII_ADAPTER_PATH/);
});
