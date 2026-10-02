import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('ships the exact Twitch local-test entry paths', async () => {
  const viewer = await readFile(path.join(appDirectory, 'dist', 'video_component.html'), 'utf8');
  const fullscreen = await readFile(path.join(appDirectory, 'dist', 'video_overlay.html'), 'utf8');
  const fullscreenCompatibility = await readFile(path.join(appDirectory, 'dist', 'video_fullscreen.html'), 'utf8');
  const mobile = await readFile(path.join(appDirectory, 'dist', 'mobile.html'), 'utf8');
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
  assert.equal(fullscreen, viewer);
  assert.equal(fullscreenCompatibility, viewer);
  assert.equal(mobile, viewer);
  assert.doesNotMatch(viewer + panel + configuration, /http-equiv="Content-Security-Policy"/i);
  assert.doesNotMatch(viewer + panel + configuration, /(?:client|shared)[_ -]?secret\s*[:=]/i);
});

test('includes the public-safe starter alert IDs and durations', async () => {
  const alerts = JSON.parse(await readFile(path.join(appDirectory, 'dist', 'alerts.json'), 'utf8'));
  assert.equal(alerts.length, 6);
  assert.equal(alerts.find((alert) => alert.id === 'sound-alert.hype-pulse').durationMs, 8000);
  assert.equal(alerts.find((alert) => alert.id === 'sound-alert.chaos-mode').durationMs, 20000);
  assert.equal(new Set(alerts.map((alert) => alert.id)).size, alerts.length);
});

test('ships allowlisted generic interactions separately from Sound Alerts', async () => {
  const interactions = JSON.parse(await readFile(path.join(appDirectory, 'dist', 'interactions.json'), 'utf8'));
  assert.deepEqual(interactions, []);
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
  assert.equal(runtime.ebsBaseUrl, 'https://signal.tempestmainframe.com');
  assert.equal(runtime.mockMode, false);
  assert.equal(Object.keys(runtime).some((key) => /secret|token/i.test(key)), false);
});

test('allows Twitch Extension Supervisor to embed local-test assets', async () => {
  const server = await readFile(path.join(appDirectory, 'server.mjs'), 'utf8');
  assert.match(server, /https:\/\/supervisor\.ext-twitch\.tv/);
  assert.match(server, /https:\/\/extension-files\.twitch\.tv/);
});

test('ships the compact categorized signal deck for Twitch panels', async () => {
  const viewer = await readFile(path.join(appDirectory, 'dist', 'video_component.html'), 'utf8');
  const panel = await readFile(path.join(appDirectory, 'dist', 'panel.html'), 'utf8');
  const styles = await readFile(path.join(appDirectory, 'dist', 'styles.css'), 'utf8');
  const viewerScript = await readFile(path.join(appDirectory, 'dist', 'viewer.js'), 'utf8');
  assert.match(panel, /id="featuredGrid"/);
  assert.match(panel, /id="pollRegion"/);
  assert.match(viewer, /id="pollRegion"/);
  assert.match(panel, /id="diceRegion"/);
  assert.match(viewer, /id="diceGrid"/);
  assert.match(panel, /id="diceCustomMaximum"/);
  assert.match(panel, /id="counterRegion"/);
  assert.match(viewer, /id="counterGrid"/);
  assert.match(panel, /id="commandRegion"/);
  assert.match(viewer, /id="commandGrid"/);
  assert.match(panel, /id="goalRegion"/);
  assert.match(viewer, /id="goalBar"/);
  assert.match(panel, /id="nowPlayingRegion"/);
  assert.match(viewer, /id="nowPlayingListen"/);
  assert.match(panel, /id="scheduleRegion"/);
  assert.match(viewer, /id="scheduleTime"/);
  assert.match(panel, /id="streamRegion"/);
  assert.match(viewer, /id="streamMeta"/);
  assert.match(panel, /data-signal-filter="events"/);
  assert.match(panel, /data-signal-filter="performances"/);
  assert.match(styles, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(viewerScript, /kind === 'interaction'/);
  assert.match(viewerScript, /kind === 'sound-alert'/);
  assert.match(viewerScript, /placementAlertId/);
  assert.match(viewerScript, /PLACE INTERACTION/);
  assert.match(viewerScript, /trigger\(alertId, \{ placement \}\)/);
  assert.match(styles, /\.placement-layer/);
  assert.match(viewerScript, /class="card-meta"/);
  assert.match(viewerScript, /applyPanelDesign/);
  assert.match(viewerScript, /body\.panelDesign/);
  assert.match(viewerScript, /hostedPanelDesign/);
  assert.match(viewerScript, /10000/);
  assert.match(viewerScript, /configuration\.broadcaster/);
  assert.match(viewerScript, /requestIdShare/);
  assert.match(viewerScript, /renderStream/);
  assert.match(viewerScript, /identity_required/);
  assert.match(viewerScript, /\/v1\/extension\/poll\/vote/);
  assert.match(viewerScript, /tempest-extension-poll-vote/);
  assert.match(viewerScript, /state\.poll\.state === 'active' && incomingPoll\.state === 'active'/);
  assert.match(viewerScript, /tempest\.dice\./);
  assert.match(viewerScript, /tempest\.dice\.custom/);
  assert.match(styles, /\.dice-grid/);
  assert.match(styles, /\.counter-grid/);
  assert.match(styles, /\.command-grid/);
  assert.match(viewerScript, /body\.commands/);
  assert.match(styles, /\.goal-card/);
  assert.match(viewerScript, /body\.goal/);
  assert.match(styles, /\.now-playing-card/);
  assert.match(viewerScript, /body\.nowPlaying/);
  assert.match(viewerScript, /actions\.openUrl/);
  assert.match(styles, /\.schedule-card/);
  assert.match(viewerScript, /body\.schedule/);
  assert.match(viewerScript, /If-None-Match/);
  assert.match(viewerScript, /response\.status === 304/);
  assert.match(viewerScript, /catalogRefreshPromise/);
  assert.match(viewerScript, /fetchWithTimeout/);
  assert.match(viewerScript, /controller\.abort\(\)/);
  assert.match(viewerScript, /if \(document\.hidden\) return/);
  assert.match(viewerScript, /cooldowns\.delete/);
  assert.match(viewerScript, /state\.auth\?\.token !== authToken/);
  assert.match(viewerScript, /eligibility\?\.allowed/);
  assert.match(viewerScript, /identityRequired/);
  assert.match(viewerScript, /SHARE TWITCH IDENTITY/);
  assert.match(viewerScript, /requestViewerIdentity/);
  assert.match(viewerScript, /LOCKED/);
  assert.doesNotMatch(viewerScript, /class="alert-glyph"/);
});
