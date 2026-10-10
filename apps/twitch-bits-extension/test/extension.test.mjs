import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(appDirectory, 'dist', name), 'utf8');
const readSource = (name) => readFile(path.join(appDirectory, 'src', name), 'utf8');

test('ships every Twitch Extension surface and configuration view', async () => {
  const files = await Promise.all(['video_overlay.html', 'video_component.html', 'panel.html', 'mobile.html', 'config.html'].map(read));
  assert.match(files[0], /data-surface="overlay"/);
  assert.match(files[1], /data-surface="component"/);
  assert.match(files[2], /data-surface="panel"/);
  assert.match(files[3], /data-surface="mobile"/);
  for (const html of files) {
    assert.match(html, /twitch-ext\.min\.js/);
    assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"/i);
  }
});

test('uses the free Streaming companion catalog and action route without purchase APIs', async () => {
  const script = await read('viewer.js');
  assert.match(script, /\/v1\/extension\/streaming\/catalog/);
  assert.match(script, /\/v1\/extension\/streaming\/interactions/);
  assert.match(script, /FREE ACTION/);
  assert.match(script, /placement/);
  assert.match(script, /avatarControlPad/);
  assert.match(script, /tempest\.avatar\.left/);
  assert.match(script, /If-None-Match/);
  assert.match(script, /response\.status === 304/);
  assert.match(script, /catalogRefreshPromise/);
  assert.match(script, /fetchWithTimeout/);
  assert.match(script, /controller\.abort\(\)/);
  assert.match(script, /!document\.hidden && state\.auth/);
  assert.match(script, /state\.auth\?\.token !== authToken/);
  assert.doesNotMatch(script, /bits\.|transactionReceipt|reservationToken|useBits|getProducts/);
  assert.doesNotMatch(script, /(?:client|shared)[_ -]?secret\s*[:=]/i);
});

test('ships the Interactive World fallback catalog with stable free action IDs', async () => {
  const catalog = JSON.parse(await readSource('mock-catalog.json'));
  const byId = new Map(catalog.map((item) => [item.id, item]));
  for (const id of ['tempest.avatar.join', 'tempest.avatar.left', 'tempest.avatar.right', 'tempest.avatar.jump', 'tempest.avatar.drop', 'tempest.avatar.interact', 'tempest.avatar.emote', 'tempest.avatar.unstuck', 'tempest.pet.feed', 'tempest.pet.play', 'tempest.pet.pet', 'tempest.viewer-attack', 'tempest.battle.attack']) {
    assert.ok(byId.has(id), `${id} should be present`);
    assert.equal(byId.get(id).kind, 'interaction');
  }
  assert.deepEqual(byId.get('tempest.avatar.join').destinations, ['mainframe', 'streaming']);
  assert.equal(byId.get('tempest.viewer-attack').placementMode, 'viewer');
  assert.deepEqual(byId.get('tempest.viewer-attack').destinations, ['streaming']);
});

test('applies Studio-managed design to every companion surface', async () => {
  const script = await read('viewer.js');
  const styles = await read('styles.css');
  assert.match(script, /normalizePanelDesign/);
  assert.match(script, /body\.panelDesign/);
  assert.match(script, /--panel-radius/);
  assert.match(script, /panel-layout-list/);
  assert.match(script, /panel-density-compact/);
  assert.match(styles, /body\.panel-layout-list/);
  assert.match(styles, /body\[data-preset="neon"\]/);
});

test('uses the live legal page and contains no paid-action language', async () => {
  const html = (await Promise.all(['video_overlay.html', 'video_component.html', 'panel.html', 'mobile.html', 'config.html'].map(read))).join('\n');
  assert.match(html, /https:\/\/tempestmainframe\.com\/legal#privacy/);
  assert.match(html, /https:\/\/tempestmainframe\.com\/legal#terms/);
  assert.doesNotMatch(html, /\b(?:bits|buy|purchase|donate|cheer|spend|cost)\b/i);
});

test('generates a public runtime configuration without credentials', async () => {
  const runtime = JSON.parse(await read('runtime-config.json'));
  assert.equal(runtime.schemaVersion, 1);
  assert.equal(runtime.ebsBaseUrl, 'https://signal.tempestmainframe.com');
  assert.equal(runtime.mockMode, false);
  assert.equal(Object.keys(runtime).some((key) => /secret|token/i.test(key)), false);
});
