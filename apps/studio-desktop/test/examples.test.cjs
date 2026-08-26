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
    'warudo.tempest.app.json'
  ]) {
    const manifestPath = path.join(workspaceRoot, 'examples', name);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const validation = validateApplicationManifest(manifest);
    assert.equal(validation.ok, true, `${name}: ${validation.errors.join(' ')}`);
  }
});

test('Quartic Pulse example uses a portable relative executable reference', async () => {
  const manifestPath = path.join(workspaceRoot, 'examples', 'quartic-pulse.tempest.app.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(path.isAbsolute(manifest.launch.executable), false);
  assert.equal(path.extname(manifest.launch.executable).toLowerCase(), '.exe');
  assert.doesNotMatch(manifest.launch.executable, /^[a-z]:/i);
});
