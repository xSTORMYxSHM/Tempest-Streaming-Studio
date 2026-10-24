const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const path = require('node:path');
const { bundledSoundAlerts, TempestSoundAlertCatalog } = require('../dist/sound-alerts');

test('preserves an existing creator catalog without injecting new public starter alerts', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-sound-alert-upgrade-'));
  const legacyAlert = {
    ...structuredClone(bundledSoundAlerts[0]),
    id: 'sound-alert.creator-routine',
    cue: 'sound-alert.creator-routine',
    name: 'Creator Routine',
    custom: false,
    warudoEnabled: true
  };
  await writeFile(path.join(dataDirectory, 'sound-alerts.json'), `${JSON.stringify({ schemaVersion: 1, alerts: [legacyAlert], updatedAt: new Date().toISOString() }, null, 2)}\n`);

  const catalog = new TempestSoundAlertCatalog(dataDirectory);
  await catalog.initialize();
  const alerts = catalog.list();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].id, 'sound-alert.creator-routine');
  assert.equal(alerts[0].name, 'Creator Routine');
  assert.equal(alerts[0].warudoEnabled, true);
  assert.equal(alerts.some((entry) => entry.id === 'sound-alert.hype-pulse'), false);
});

test('persists a reusable viewer-group assignment on an interaction', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-sound-alert-viewer-group-'));
  const catalog = new TempestSoundAlertCatalog(dataDirectory);
  await catalog.initialize();
  const alert = await catalog.update('sound-alert.hype-pulse', { accessMode: 'viewer-group', viewerGroupId: 'campaign-players' });
  assert.equal(alert.accessMode, 'viewer-group');
  assert.equal(alert.viewerGroupId, 'campaign-players');

  const restored = new TempestSoundAlertCatalog(dataDirectory);
  await restored.initialize();
  assert.equal(restored.find('sound-alert.hype-pulse').viewerGroupId, 'campaign-players');
  await assert.rejects(catalog.update('sound-alert.hype-pulse', { viewerGroupId: 'INVALID GROUP' }), /viewerGroupId/);
});

test('persists the Stormframe AudioLink choice and prepares its local audio command payload', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-sound-alert-stormframe-'));
  const audioPath = path.join(dataDirectory, 'reactive-alert.mp3');
  await writeFile(audioPath, Buffer.from([0x49, 0x44, 0x33]));
  const catalog = new TempestSoundAlertCatalog(dataDirectory);
  await catalog.initialize();
  const audioUri = pathToFileURL(audioPath).href;
  const alert = await catalog.update('sound-alert.hype-pulse', {
    audioUri,
    volume: 0.42,
    stormframeAudioLinkEnabled: true
  });
  assert.equal(alert.stormframeAudioLinkEnabled, true);

  const prepared = catalog.prepare(alert.id, { source: 'studio.operator', bypassCooldown: true });
  assert.equal(prepared.payload.stormframeAudioLinkEnabled, true);
  assert.equal(prepared.payload.stormframeAudioUri, audioUri);
  assert.equal(prepared.payload.stormframeAudioVolume, 0.42);

  const restored = new TempestSoundAlertCatalog(dataDirectory);
  await restored.initialize();
  assert.equal(restored.find(alert.id).stormframeAudioLinkEnabled, true);
});
