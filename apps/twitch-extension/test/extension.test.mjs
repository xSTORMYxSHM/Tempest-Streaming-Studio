import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ships the exact Twitch local-test entry paths', async () => {
  const viewer = await readFile(path.join(appDirectory, 'dist', 'video_component.html'), 'utf8');
  const panel = await readFile(path.join(appDirectory, 'dist', 'panel.html'), 'utf8');
  const configuration = await readFile(path.join(appDirectory, 'dist', 'config.html'), 'utf8');
  assert.match(viewer, /twitch-ext\.min\.js/);
  assert.match(viewer, /viewer\.js/);
  assert.match(panel, /twitch-ext\.min\.js/);
  assert.match(panel, /viewer\.js/);
  assert.match(panel, /panel-body/);
  assert.match(panel, /id="panelBrandName"/);
  assert.match(configuration, /config\.js/);
  assert.match(configuration, /Local mock mode/);
  assert.match(configuration, /SAVE PANEL APPEARANCE/);
  assert.doesNotMatch(viewer + panel + configuration, /http-equiv="Content-Security-Policy"/i);
  assert.doesNotMatch(viewer + panel + configuration, /(?:client|shared)[_ -]?secret\s*[:=]/i);
});

test('includes all blueprint-compatible alert IDs and durations', async () => {
  const alerts = JSON.parse(await readFile(path.join(appDirectory, 'dist', 'alerts.json'), 'utf8'));
  assert.equal(alerts.length, 13);
  assert.equal(alerts.find((alert) => alert.id === 'sound-alert.fishie').durationMs, 8000);
  assert.equal(alerts.find((alert) => alert.id === 'sound-alert.crab-rave').durationMs, 58000);
  assert.equal(new Set(alerts.map((alert) => alert.id)).size, alerts.length);
});

test('ships allowlisted generic interactions separately from Sound Alerts', async () => {
  const interactions = JSON.parse(await readFile(path.join(appDirectory, 'dist', 'interactions.json'), 'utf8'));
  assert.deepEqual(interactions.map((entry) => entry.id), ['tempest.blackhole']);
  assert.equal(interactions[0].cooldownMs, 300000);
});

test('never embeds the Extension secret or the localhost Bridge endpoint', async () => {
  const viewerScript = await readFile(path.join(appDirectory, 'dist', 'viewer.js'), 'utf8');
  assert.doesNotMatch(viewerScript, /(?:client|shared)[_ -]?secret\s*[:=]/i);
  assert.doesNotMatch(viewerScript, /127\.0\.0\.1:4765|localhost:4765/);
  assert.match(viewerScript, /X-Extension-JWT/);
});

test('generates a public runtime configuration without secrets', async () => {
  const runtime = JSON.parse(await readFile(path.join(appDirectory, 'dist', 'runtime-config.json'), 'utf8'));
  assert.equal(runtime.schemaVersion, 1);
  assert.equal(typeof runtime.ebsBaseUrl, 'string');
  assert.equal(typeof runtime.mockMode, 'boolean');
  assert.equal(Object.keys(runtime).some((key) => /secret|token/i.test(key)), false);
});

test('allows Twitch Extension Supervisor to embed local-test assets', async () => {
  const server = await readFile(path.join(appDirectory, 'server.mjs'), 'utf8');
  assert.match(server, /https:\/\/supervisor\.ext-twitch\.tv/);
  assert.match(server, /https:\/\/extension-files\.twitch\.tv/);
});

test('ships the compact categorized signal deck for Twitch panels', async () => {
  const panel = await readFile(path.join(appDirectory, 'dist', 'panel.html'), 'utf8');
  const styles = await readFile(path.join(appDirectory, 'dist', 'styles.css'), 'utf8');
  const viewerScript = await readFile(path.join(appDirectory, 'dist', 'viewer.js'), 'utf8');
  assert.match(panel, /id="featuredGrid"/);
  assert.match(panel, /data-signal-filter="events"/);
  assert.match(panel, /data-signal-filter="performances"/);
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(viewerScript, /kind === 'interaction'/);
  assert.match(viewerScript, /kind === 'sound-alert'/);
  assert.match(viewerScript, /class="card-meta"/);
  assert.match(viewerScript, /applyPanelDesign/);
  assert.match(viewerScript, /configuration\.broadcaster/);
  assert.doesNotMatch(viewerScript, /class="alert-glyph"/);
});
