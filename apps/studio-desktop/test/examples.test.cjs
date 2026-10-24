const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { validateApplicationManifest } = require('@tempest/contracts');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');

test('bundled Tempest application manifests satisfy API 1.0', async () => {
  for (const name of [
    'quartic-pulse.tempest.app.json',
    'data-horizon.tempest.app.json',
    'tempest-broadcast.tempest.app.json',
    'stormframe.tempest.app.json',
    'warudo.tempest.app.json'
  ]) {
    const manifestPath = path.join(workspaceRoot, 'examples', name);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const validation = validateApplicationManifest(manifest);
    assert.equal(validation.ok, true, `${name}: ${validation.errors.join(' ')}`);
  }
});

test('Stormframe example exposes its Studio control and AudioLink capabilities', async () => {
  const manifestPath = path.join(workspaceRoot, 'examples', 'stormframe.tempest.app.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.id, 'com.tempestmainframe.stormframe');
  assert.equal(manifest.apiVersion, '1.0');
  assert.ok(manifest.capabilities.provides.includes('avatar.audio.play'));
  assert.ok(manifest.capabilities.provides.includes('avatar.status'));
  assert.equal(path.isAbsolute(manifest.launch.executable), false);
  assert.equal(path.extname(manifest.launch.executable).toLowerCase(), '.exe');
});

test('Quartic Pulse example uses a portable relative executable reference', async () => {
  const manifestPath = path.join(workspaceRoot, 'examples', 'quartic-pulse.tempest.app.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(path.isAbsolute(manifest.launch.executable), false);
  assert.equal(path.extname(manifest.launch.executable).toLowerCase(), '.exe');
  assert.doesNotMatch(manifest.launch.executable, /^[a-z]:/i);
});
