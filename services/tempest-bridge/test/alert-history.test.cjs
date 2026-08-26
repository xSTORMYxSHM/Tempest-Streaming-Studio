const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TempestAlertHistory } = require('../dist/alert-history');
const { TempestAlertQueue } = require('../dist/alert-queue');

test('persists completed and cancelled alert playback records', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-alert-history-test-'));
  const history = new TempestAlertHistory(dataDirectory);
  await history.initialize();
  const queue = new TempestAlertQueue({
    transitionGapMs: 0,
    onStarted: (item) => history.started(item),
    onCompleted: (item) => history.completed(item),
    onError: (item, error) => history.failed(item, error),
    onCleared: (items) => history.cancelled(items)
  });
  await queue.enqueue({ kind: 'twitch', alertId: 'twitch.cheer', name: 'Mega Cheer', source: 'twitch.eventsub', durationMs: 250, diagnostics: { viewerName: 'Tester', variantId: 'mega', audioAssigned: true, visualAssigned: true, audioRoute: 'browser-source', browserClients: 1 }, execute: () => ({ ok: true }) });
  await queue.enqueue({ kind: 'interaction', alertId: 'sound-alert.dance', name: 'Dance', source: 'twitch.extension', durationMs: 1000, diagnostics: { viewerName: 'Queued Viewer', audioAssigned: true, audioRoute: 'studio-local' }, execute: () => ({ ok: true }) });
  assert.equal(queue.clearWaiting(), 1);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await history.flush();
  const reloaded = new TempestAlertHistory(dataDirectory);
  await reloaded.initialize();
  const records = reloaded.list();
  assert.equal(records.length, 2);
  assert.equal(records.find((record) => record.alertId === 'twitch.cheer').state, 'completed');
  assert.equal(records.find((record) => record.alertId === 'twitch.cheer').variantId, 'mega');
  assert.equal(records.find((record) => record.alertId === 'sound-alert.dance').state, 'cancelled');
  assert.equal(reloaded.summary().last24Hours, 1);
  queue.close();
});
