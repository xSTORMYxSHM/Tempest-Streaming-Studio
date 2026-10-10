const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { startTempestBridge } = require('../dist');

test('serves managed Stage Actor packs and resolves viewer animation states', async (context) => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-stage-actors-'));
  const packDirectory = path.join(dataDirectory, 'stage-actors', 'storm-knight');
  await mkdir(packDirectory, { recursive: true });
  const manifest = {
    schemaVersion: 1, id: 'storm-knight', name: 'Storm Knight', version: '1.0.0', creator: 'Tempest Artist',
    defaultScale: 1.1, pivot: { x: 0.5, y: 1 }, nameplate: { x: 0.5, y: 0 },
    collider: { x: 0.5, y: 0.55, width: 0.7, height: 0.85 },
    animations: {
      idle: { asset: 'idle.png', frameWidth: 64, frameHeight: 64, frames: 4, fps: 8, loop: true, returnsToIdle: false },
      celebrate: { asset: 'celebrate.png', frameWidth: 64, frameHeight: 64, frames: 6, fps: 12, loop: false, returnsToIdle: true }
    },
    appearance: {
      colorSlots: {
        primary: { label: 'Jacket', defaultOptionId: 'navy', options: [{ id: 'navy', name: 'Navy', color: '#1B2A59' }, { id: 'violet', name: 'Violet', color: '#7250D8' }, { id: 'ember', name: 'Ember', color: '#CF6B2D' }] },
        secondary: { label: 'Wisp', defaultOptionId: 'cyan', options: [{ id: 'cyan', name: 'Cyan', color: '#27E5FF' }, { id: 'magenta', name: 'Magenta', color: '#F04DFF' }, { id: 'gold', name: 'Gold', color: '#FFD45E' }] }
      },
      masks: {
        idle: { primary: 'idle-jacket.png', secondary: 'idle-wisp.png' },
        celebrate: { primary: 'celebrate-jacket.png', secondary: 'celebrate-wisp.png' }
      }
    },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  await writeFile(path.join(packDirectory, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(packDirectory, 'idle.png'), Buffer.alloc(64, 1));
  await writeFile(path.join(packDirectory, 'celebrate.png'), Buffer.alloc(64, 2));
  await writeFile(path.join(packDirectory, 'idle-jacket.png'), Buffer.alloc(64, 3));
  await writeFile(path.join(packDirectory, 'idle-wisp.png'), Buffer.alloc(64, 4));
  await writeFile(path.join(packDirectory, 'celebrate-jacket.png'), Buffer.alloc(64, 5));
  await writeFile(path.join(packDirectory, 'celebrate-wisp.png'), Buffer.alloc(64, 6));
  const runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  context.after(() => runtime.close());
  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  const request = (route, body) => fetch(`${runtime.baseUrl}${route}`, { method: 'POST', headers, body: JSON.stringify(body || {}) });

  const catalog = await fetch(`${runtime.baseUrl}/v1/stage-actors`, { headers }).then((response) => response.json());
  assert.equal(catalog.packs.length, 1);
  assert.equal(catalog.packs[0].id, 'storm-knight');
  assert.match(catalog.packs[0].previewUrl, /\/interactive-stage\/actors\/storm-knight\/idle\.png\?v=1\.0\.0$/);

  const joined = await request('/v1/interactive-world/viewers', { platform: 'twitch', userId: 'actor-test', displayName: 'Nova', actorPackId: 'storm-knight' });
  assert.equal(joined.status, 201);
  const firstViewer = (await joined.json()).viewer;
  assert.ok(['#1B2A59', '#7250D8', '#CF6B2D'].includes(firstViewer.cosmetics.primaryColor));
  assert.ok(['#27E5FF', '#F04DFF', '#FFD45E'].includes(firstViewer.cosmetics.secondaryColor));
  const rejoined = await request('/v1/interactive-world/viewers', { platform: 'twitch', userId: 'actor-test', displayName: 'Nova', actorPackId: 'storm-knight' });
  assert.equal(rejoined.status, 201);
  assert.deepEqual((await rejoined.json()).viewer.cosmetics, firstViewer.cosmetics);
  let stage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json());
  let actor = stage.objects.find((object) => object.id === 'avatar:twitch:actor-test');
  assert.equal(actor.assetId, 'storm-knight');
  assert.equal(actor.properties.actorState, 'idle');
  assert.equal(actor.properties.actorFrames, 4);
  assert.equal(actor.properties.actorAtlasColumns, 4);
  assert.equal(actor.properties.actorAtlasRows, 1);
  assert.match(actor.properties.actorAsset, /\/interactive-stage\/actors\/storm-knight\/idle\.png\?v=1\.0\.0$/);
  assert.match(actor.properties.actorPrimaryMask, /idle-jacket\.png\?v=1\.0\.0$/);
  assert.match(actor.properties.actorSecondaryMask, /idle-wisp\.png\?v=1\.0\.0$/);
  assert.equal(actor.properties.actorPrimaryColor, firstViewer.cosmetics.primaryColor);
  assert.equal(actor.properties.actorSecondaryColor, firstViewer.cosmetics.secondaryColor);
  assert.equal(actor.properties.actorColliderX, 0.5);
  assert.equal(actor.properties.actorColliderY, 0.55);
  assert.equal(actor.properties.actorColliderWidth, 0.7);
  assert.equal(actor.properties.actorColliderHeight, 0.85);
  const motionClips = JSON.parse(actor.properties.actorMotionClips);
  assert.equal(motionClips.idle.frames, 4);
  assert.equal(motionClips.walk.state, 'idle');
  assert.equal(motionClips.jump.state, 'idle');
  assert.equal(motionClips.celebrate.state, 'celebrate');
  assert.equal(motionClips.emote.state, 'celebrate');
  assert.match(motionClips.walk.asset, /\/interactive-stage\/actors\/storm-knight\/idle\.png\?v=1\.0\.0$/);

  const stagePage = await fetch(`${runtime.baseUrl}/interactive-stage?orientation=horizontal`).then((response) => response.text());
  assert.match(stagePage, /function applyActorMotion/);
  assert.match(stagePage, /actorAtlasRows/);
  assert.match(stagePage, /--actor-frame-y/);
  assert.match(stagePage, /animationOverride=action==='emote'\?'emote':'attack'/);
  assert.match(stagePage, /applyActorMotion\(body\.object,body\.node,animationState\)/);
  assert.match(stagePage, /function drawRig/);
  assert.match(stagePage, /canvas\.className='actor-rig'/);
  assert.match(stagePage, /tempest_session/);

  const media = await fetch(`${runtime.baseUrl}${actor.properties.actorAsset}`);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('cache-control'), 'no-store');
  assert.equal(media.headers.get('content-type'), 'image/png');
  assert.equal((await media.arrayBuffer()).byteLength, 64);

  assert.equal((await request('/v1/interactive-world/viewers/twitch%3Aactor-test/state', { state: 'celebrate' })).status, 200);
  stage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json());
  actor = stage.objects.find((object) => object.id === 'avatar:twitch:actor-test');
  assert.equal(actor.properties.actorState, 'celebrate');
  assert.equal(actor.properties.actorLoop, false);
  assert.match(actor.properties.actorAsset, /celebrate\.png\?v=1\.0\.0$/);

  assert.equal((await request('/v1/interactive-world/viewers/twitch%3Aactor-test/actor', { actorPackId: '' })).status, 200);
  stage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json());
  actor = stage.objects.find((object) => object.id === 'avatar:twitch:actor-test');
  assert.equal(actor.properties.actorAsset, undefined);

  assert.equal((await request('/v1/interactive-world/viewers', { platform: 'studio', userId: 'actor-remove', displayName: 'Echo', actorPackId: 'storm-knight' })).status, 201);
  manifest.version = '1.1.0';
  manifest.animations.idle.asset = 'idle-v2.png';
  await writeFile(path.join(packDirectory, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(packDirectory, 'idle-v2.png'), Buffer.alloc(64, 7));
  const reloaded = await request('/v1/stage-actors/reload');
  assert.equal(reloaded.status, 200);
  assert.equal((await reloaded.json()).refreshedViewers, 1);
  stage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json());
  actor = stage.objects.find((object) => object.id === 'avatar:studio:actor-remove');
  assert.match(actor.properties.actorAsset, /idle-v2\.png\?v=1\.1\.0$/);
  const removed = await fetch(`${runtime.baseUrl}/v1/stage-actors/storm-knight`, { method: 'DELETE', headers }).then((response) => response.json());
  assert.equal(removed.removed, true);
  assert.equal(removed.affectedViewers, 1);
  assert.equal(removed.packs.length, 0);
  stage = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json());
  actor = stage.objects.find((object) => object.id === 'avatar:studio:actor-remove');
  assert.equal(actor.assetId, undefined);
  assert.equal(actor.properties.actorAsset, undefined);
});
