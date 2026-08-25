const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile, stat } = require('node:fs/promises');
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

test('Quartic Pulse example targets the current packaged executable', async (context) => {
  const manifestPath = path.join(workspaceRoot, 'examples', 'quartic-pulse.tempest.app.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(
    manifest.launch.executable.replaceAll('\\', '/'),
    '../../../Quartic Pulse/Development Build/release/win-unpacked/Quartic Pulse.exe'
  );
  const executable = path.resolve(path.dirname(manifestPath), manifest.launch.executable);
  try {
    assert.equal((await stat(executable)).isFile(), true);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    context.skip('Quartic Pulse is not installed beside this standalone Studio checkout.');
  }
});
