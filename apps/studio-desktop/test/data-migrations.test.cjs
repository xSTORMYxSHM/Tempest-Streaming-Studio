const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, readdir, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runStudioDataMigrations, CURRENT_STUDIO_DATA_VERSION } = require('../dist/data-migrations.js');

test('migrates legacy Twitch Alert data after creating a safe snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tempest-migration-'));
  const bridge = path.join(root, 'bridge');
  await mkdir(bridge, { recursive: true });
  await writeFile(path.join(bridge, 'twitch-visual-alerts.json'), JSON.stringify({ schemaVersion: 1, alerts: [{ id: 'twitch.follow', name: 'Follow', selectedVariantId: 'large', selectedVariantName: 'Large' }] }));
  const result = await runStudioDataMigrations({ userDataDirectory: root, productVersion: '0.20.0' });
  assert.equal(result.dataVersion, CURRENT_STUDIO_DATA_VERSION);
  assert.equal(result.migrated, true);
  assert.ok(result.snapshotDirectory);
  assert.deepEqual(JSON.parse(await readFile(path.join(bridge, 'twitch-visual-alerts.json'), 'utf8')).alerts[0], { id: 'twitch.follow', name: 'Follow', alertVariants: [] });
  assert.deepEqual(await readdir(result.snapshotDirectory), ['twitch-alerts.json']);
  const snapshot = JSON.parse(await readFile(path.join(result.snapshotDirectory, 'twitch-alerts.json'), 'utf8'));
  assert.equal(snapshot.alerts[0].selectedVariantId, 'large');
  const second = await runStudioDataMigrations({ userDataDirectory: root, productVersion: '0.20.0' });
  assert.equal(second.migrated, false);
});

test('refuses to downgrade data written by a newer Studio release', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tempest-migration-newer-'));
  await writeFile(path.join(root, 'studio-data-version.json'), JSON.stringify({ schemaVersion: 1, dataVersion: CURRENT_STUDIO_DATA_VERSION + 1, productVersion: '9.0.0', updatedAt: new Date().toISOString(), appliedMigrations: [] }));
  await assert.rejects(runStudioDataMigrations({ userDataDirectory: root, productVersion: '0.20.0' }), /newer release/);
});
