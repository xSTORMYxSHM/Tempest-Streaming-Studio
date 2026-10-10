const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdir, mkdtemp, readFile, stat, writeFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { buildStageActorAtlasPack, buildStageActorPack, buildStageActorTemplatePack, buildPortableStageActorPack, importPortableStageActorPack, importStreamingAvatarsLibrary, inspectStageActorStrip, installBundledStageActorPacks, pngDimensions, updateStageActorPack } = require('../dist/stage-actor-packs');

function fakePng(width, height) {
  const bytes = Buffer.alloc(40);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('builds a managed Stage Actor pack from validated horizontal PNG strips', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-stage-actor-'));
  const idle = path.join(directory, 'source-idle.png');
  const attack = path.join(directory, 'source-attack.png');
  await writeFile(idle, fakePng(512, 128));
  await writeFile(attack, fakePng(768, 128));
  assert.deepEqual(pngDimensions(await readFile(idle)), { width: 512, height: 128 });
  assert.equal((await inspectStageActorStrip(idle)).width, 512);
  const result = await buildStageActorPack({
    name: 'Storm Knight', creator: 'Tempest Artist', frameWidth: 128, frameHeight: 128,
    animations: [
      { state: 'idle', sourcePath: idle, frames: 4, fps: 4, loop: true },
      { state: 'attack', sourcePath: attack, frames: 6, fps: 12, loop: false }
    ]
  }, directory);
  assert.match(result.manifest.id, /^storm-knight-/);
  assert.equal(result.manifest.animations.attack.frames, 6);
  assert.equal(JSON.parse(await readFile(path.join(result.directory, 'manifest.json'), 'utf8')).creator, 'Tempest Artist');
  const edited = await updateStageActorPack({ packId: result.manifest.id, name: 'Storm Knight Deluxe', version: '1.1.0', defaultScale: 1.25 }, directory);
  assert.equal(edited.name, 'Storm Knight Deluxe');
  assert.equal(edited.defaultScale, 1.25);
  assert.equal(edited.animations.attack.frames, 6);
  await assert.rejects(() => buildStageActorPack({ name: 'Broken', frameWidth: 128, frameHeight: 128, animations: [{ state: 'idle', sourcePath: idle, frames: 3, fps: 4 }] }, directory), /needs exactly 384×128/);
});

test('builds and round-trips the canonical single-PNG row atlas', async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-stage-atlas-'));
  const destinationDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-stage-atlas-import-'));
  const source = path.join(sourceDirectory, 'source-avatar.png');
  await writeFile(source, fakePng(1280, 768));
  const built = await buildStageActorAtlasPack({
    name: 'Universal Avatar', sourcePath: source, frameWidth: 128, frameHeight: 128,
    animations: [
      { state: 'idle', row: 0, frames: 2, fps: 4, loop: true },
      { state: 'walk', row: 1, frames: 7, fps: 9, loop: true },
      { state: 'jump', row: 4, frames: 2, fps: 8 },
      { state: 'attack', row: 5, frames: 6, fps: 12 }
    ]
  }, sourceDirectory);
  assert.equal(built.manifest.schemaVersion, 3);
  assert.deepEqual(built.manifest.atlas, { asset: 'avatar.png', frameWidth: 128, frameHeight: 128, columns: 10, rows: 6, layout: 'rows' });
  assert.equal(built.manifest.animations.attack.row, 5);
  const portable = await buildPortableStageActorPack({ packId: built.manifest.id, createdWithVersion: '1.5.1-dev' }, sourceDirectory);
  assert.equal(portable.assets.length, 1);
  const imported = await importPortableStageActorPack(portable, destinationDirectory);
  assert.equal(imported.manifest.atlas.rows, 6);
  assert.deepEqual(pngDimensions(await readFile(path.join(imported.directory, 'avatar.png'))), { width: 1280, height: 768 });
  await assert.rejects(() => buildStageActorAtlasPack({ name: 'Broken Atlas', sourcePath: source, frameWidth: 128, frameHeight: 128, animations: [{ state: 'idle', row: 0, frames: 11, fps: 4 }] }, sourceDirectory), /inside the 10-column atlas/);
});

test('imports Streaming Avatars libraries with variable cell sizes and row layouts', async () => {
  const sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'tempest-streaming-avatars-'));
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), 'tempest-streaming-avatars-import-'));
  const avatarsDirectory = path.join(sourceRoot, 'avatars');
  await mkdir(avatarsDirectory, { recursive: true });
  const animation = (frames, framesPerSecond = 8, customName = '') => ({ customName, isCustomAnimation: Boolean(customName), framesPerSecond, frameData: Array.from({ length: frames }, () => ({})) });
  const empty = () => animation(0);
  const records = {
    'Two Row': { name: 'Two Row', width: 100, height: 100, animationData: { idle: animation(10, 5), walk: animation(10, 9), sit: empty(), stand: empty(), jump: empty(), dance: empty(), hug: empty(), attack: empty(), fart: empty(), move: empty() } },
    'Five Row': { name: 'Five Row', width: 64, height: 64, animationData: { idle: animation(2), walk: animation(6), sit: animation(3), stand: animation(3), jump: animation(4), dance: empty(), hug: empty(), attack: empty(), fart: empty(), move: empty() } },
    'Six Row': { name: 'Six Row', width: 128, height: 128, animationData: { idle: animation(2), walk: animation(7), sit: animation(3), stand: animation(3), jump: empty(), custom1: animation(6, 12, 'attack'), dance: empty(), hug: empty(), attack: empty(), fart: empty(), move: empty() } },
    'Seven Row': { name: 'Seven Row', width: 25, height: 25, animationData: { idle: animation(2), walk: animation(7), sit: animation(3), stand: animation(3), jump: empty(), custom1: animation(6, 12, 'attack'), custom2: animation(5, 10, '30k'), dance: empty(), hug: empty(), attack: empty(), fart: empty(), move: empty() } }
  };
  await writeFile(path.join(avatarsDirectory, 'Two Row.png'), fakePng(1000, 200));
  await writeFile(path.join(avatarsDirectory, 'Five Row.png'), fakePng(512, 320));
  await writeFile(path.join(avatarsDirectory, 'Six Row.png'), fakePng(1024, 768));
  await writeFile(path.join(avatarsDirectory, 'Seven Row.png'), fakePng(200, 175));
  await writeFile(path.join(sourceRoot, 'streamavatars_json.txt'), `\uFEFF${JSON.stringify({ avatarData: records })}`);
  const result = await importStreamingAvatarsLibrary(sourceRoot, destinationRoot);
  assert.equal(result.discovered, 4);
  assert.equal(result.imported.length, 4);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.imported.map((entry) => entry.manifest.atlas.rows), [2, 5, 6, 7]);
  assert.equal(result.imported[0].manifest.atlas.frameWidth, 100);
  assert.equal(result.imported[0].manifest.animations.walk.frames, 10);
  assert.equal(result.imported[2].manifest.animations.attack.row, 5);
  assert.equal(result.imported[3].manifest.animations['custom-30k'].row, 6);
  assert.equal((await stat(path.join(result.imported[3].directory, 'avatar.png'))).isFile(), true);
});

test('round-trips portable Stage Actor packs with verified embedded strips and a fresh local ID', async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-stage-actor-export-'));
  const destinationDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-stage-actor-import-'));
  const idle = path.join(sourceDirectory, 'private-source-idle.png');
  await writeFile(idle, fakePng(256, 64));
  const built = await buildStageActorPack({ name: 'Portable Sprite', frameWidth: 64, frameHeight: 64, animations: [{ state: 'idle', sourcePath: idle, frames: 4, fps: 8 }] }, sourceDirectory);
  const portable = await buildPortableStageActorPack({ packId: built.manifest.id, createdWithVersion: '1.5.1-dev' }, sourceDirectory);
  assert.equal(portable.type, 'tempest.stage-actor-pack');
  assert.equal(portable.assets.length, 1);
  assert.doesNotMatch(JSON.stringify(portable), /private-source|tempest-stage-actor-export/i);
  const imported = await importPortableStageActorPack(portable, destinationDirectory);
  assert.notEqual(imported.manifest.id, built.manifest.id);
  assert.equal(imported.manifest.name, 'Portable Sprite');
  assert.deepEqual(pngDimensions(await readFile(path.join(imported.directory, 'idle.png'))), { width: 256, height: 64 });
  const tampered = structuredClone(portable);
  const bytes = Buffer.from(tampered.assets[0].data, 'base64');
  bytes[bytes.length - 1] ^= 0xff;
  tampered.assets[0].data = bytes.toString('base64');
  await assert.rejects(() => importPortableStageActorPack(tampered, destinationDirectory), /integrity check/i);
});

test('builds a bounded 2D template pack from one exact-size texture', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-stage-template-'));
  const templateDirectory = path.join(directory, 'template');
  await mkdir(templateDirectory, { recursive: true });
  const timestamp = '2026-10-03T00:00:00.000Z';
  const manifest = {
    schemaVersion: 2, id: 'wisp-template', name: 'Wisp Template', version: '1.0.0', defaultScale: 1,
    pivot: { x: 0.5, y: 1 }, nameplate: { x: 0.5, y: 0 }, collider: { x: 0.5, y: 0.55, width: 0.7, height: 0.85 },
    animations: { idle: { asset: 'idle.png', frameWidth: 64, frameHeight: 64, frames: 1, fps: 4, loop: true, returnsToIdle: false } },
    rig: {
      canvas: { width: 512, height: 512 },
      template: { id: 'humanoid-wisp-v1', version: '1.0.0', textureAsset: 'texture.png', guideAsset: 'guide.png', width: 2048, height: 2560, cellWidth: 512, cellHeight: 512, boundsPolicy: 'source-rect' },
      bones: [{ id: 'root', x: 256, y: 480, rotation: 0, scaleX: 1, scaleY: 1, length: 0 }],
      layers: [{ id: 'body', bone: 'root', asset: 'texture.png', templatePart: 'body', order: 0, pivot: { x: 0.5, y: 0.5 }, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, source: { x: 0, y: 0, width: 512, height: 512 } }],
      attachments: [],
      clips: { idle: { durationMs: 1000, loop: true, returnsToIdle: false, tracks: [{ target: 'root', keyframes: [{ timeMs: 0, interpolation: 'linear' }] }] } }
    },
    createdAt: timestamp, updatedAt: timestamp
  };
  await writeFile(path.join(templateDirectory, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(templateDirectory, 'texture.png'), fakePng(2048, 2560));
  await writeFile(path.join(templateDirectory, 'guide.png'), fakePng(2048, 2560));
  await writeFile(path.join(templateDirectory, 'idle.png'), fakePng(64, 64));
  const paintedTexture = path.join(directory, 'painted.png');
  await writeFile(paintedTexture, fakePng(2048, 2560));
  const built = await buildStageActorTemplatePack({ name: 'Custom Wisp', templateId: 'humanoid-wisp-v1', texturePath: paintedTexture, templateDirectory }, directory);
  assert.match(built.manifest.id, /^custom-wisp-/);
  assert.equal(built.manifest.rig.template.id, 'humanoid-wisp-v1');
  assert.equal(built.manifest.rig.layers[0].templatePart, 'body');
  assert.deepEqual(pngDimensions(await readFile(path.join(built.directory, 'texture.png'))), { width: 2048, height: 2560 });
  const wrongTexture = path.join(directory, 'wrong.png');
  await writeFile(wrongTexture, fakePng(1024, 1024));
  await assert.rejects(() => buildStageActorTemplatePack({ name: 'Wrong Wisp', templateId: 'humanoid-wisp-v1', texturePath: wrongTexture, templateDirectory }, directory), /requires exactly 2048×2560/);
});

test('installs each bundled Stage Actor revision once and preserves unrelated managed files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-stage-actor-bundle-'));
  const sourceRoot = path.join(directory, 'bundled');
  const sourcePack = path.join(sourceRoot, 'storm-wisp');
  const bridgeDirectory = path.join(directory, 'bridge');
  await mkdir(sourcePack, { recursive: true });
  await writeFile(path.join(sourcePack, 'idle.png'), fakePng(128, 128));
  const timestamp = '2026-10-03T00:00:00.000Z';
  await writeFile(path.join(sourcePack, 'manifest.json'), JSON.stringify({
    schemaVersion: 1, id: 'storm-wisp', name: 'Storm Wisp', version: '1.0.0', defaultScale: 1,
    pivot: { x: 0.5, y: 1 }, nameplate: { x: 0.5, y: 0 }, collider: { x: 0.5, y: 0.55, width: 0.7, height: 0.85 },
    animations: { idle: { asset: 'idle.png', frameWidth: 128, frameHeight: 128, frames: 1, fps: 4, loop: true, returnsToIdle: false } },
    createdAt: timestamp, updatedAt: timestamp
  }));
  const first = await installBundledStageActorPacks(sourceRoot, bridgeDirectory);
  assert.deepEqual(first, { installed: ['storm-wisp'], skipped: false });
  assert.equal((await stat(path.join(bridgeDirectory, 'stage-actors', 'storm-wisp', 'idle.png'))).isFile(), true);
  await writeFile(path.join(bridgeDirectory, 'stage-actors', 'storm-wisp', 'managed.txt'), 'keep');
  const second = await installBundledStageActorPacks(sourceRoot, bridgeDirectory);
  assert.deepEqual(second, { installed: [], skipped: true });
  assert.equal(await readFile(path.join(bridgeDirectory, 'stage-actors', 'storm-wisp', 'managed.txt'), 'utf8'), 'keep');
  const upgradedPng = fakePng(256, 128);
  await writeFile(path.join(sourcePack, 'idle.png'), upgradedPng);
  const upgraded = await installBundledStageActorPacks(sourceRoot, bridgeDirectory, '2');
  assert.deepEqual(upgraded, { installed: ['storm-wisp'], skipped: false });
  assert.deepEqual(await readFile(path.join(bridgeDirectory, 'stage-actors', 'storm-wisp', 'idle.png')), upgradedPng);
  assert.equal(await readFile(path.join(bridgeDirectory, 'stage-actors', 'storm-wisp', 'managed.txt'), 'utf8'), 'keep');
});
