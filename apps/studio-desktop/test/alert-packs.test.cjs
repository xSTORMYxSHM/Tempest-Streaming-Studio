const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { buildTempestAlertPack, importTempestAlertPack } = require('../dist/alert-packs');

test('round-trips portable alert packs without source paths and verifies embedded media', async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-alert-pack-source-'));
  const destinationDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-alert-pack-import-'));
  const audioPath = path.join(sourceDirectory, 'alert-song.mp3');
  const visualPath = path.join(sourceDirectory, 'alert-visual.gif');
  await writeFile(audioPath, Buffer.from([0x49, 0x44, 0x33, 0x04, 0x11, 0x22]));
  await writeFile(visualPath, Buffer.from('GIF89a', 'ascii'));
  const pack = await buildTempestAlertPack({
    name: 'Mega Cheer Pack',
    kind: 'twitch',
    createdWithVersion: '0.20.0-test',
    alert: {
      schemaVersion: 1,
      id: 'twitch.cheer',
      topic: 'viewer.cheer.received',
      name: 'Cheer',
      enabled: true,
      durationMs: 6000,
      volume: 0.8,
      audioUri: pathToFileURL(audioPath).href,
      visualUri: pathToFileURL(visualPath).href,
      accent: '#54F2EB',
      design: { customCss: '.name { color: cyan; }' },
      updatedAt: 'private-machine-time',
      alertVariants: [{ schemaVersion: 1, id: 'mega', name: 'Mega Cheer', enabled: true, priority: 10, condition: { minimumBits: 1000 }, durationMs: 8000, volume: 1, visualUri: pathToFileURL(visualPath).href, accent: '#FF44AA', design: {} }]
    }
  });
  assert.equal(pack.type, 'tempest.alert-pack');
  assert.equal(pack.assets.length, 2);
  assert.equal(pack.media.visual, pack.media.variants.mega.visual);
  const serialized = JSON.stringify(pack);
  assert.doesNotMatch(serialized, /file:/i);
  assert.doesNotMatch(serialized, /tempest-alert-pack-source/i);
  assert.doesNotMatch(serialized, /private-machine-time/);
  const imported = await importTempestAlertPack(pack, destinationDirectory);
  assert.equal(imported.kind, 'twitch');
  assert.equal(imported.assetCount, 2);
  assert.equal(imported.containsCustomCode, true);
  assert.match(fileURLToPath(imported.alert.audioUri), new RegExp(destinationDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(imported.alert.visualUri, imported.alert.alertVariants[0].visualUri);
  const tampered = structuredClone(pack);
  tampered.assets[0].data = Buffer.from('tampered').toString('base64');
  await assert.rejects(() => importTempestAlertPack(tampered, destinationDirectory), /invalid size|integrity check/i);
});
