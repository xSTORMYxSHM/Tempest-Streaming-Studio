const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TempestSoundAlertCatalog } = require('../dist/sound-alerts');
const { TwitchIntegrationGateway } = require('../dist/twitch-integration');
const { TempestWorkflowEngine } = require('../dist/workflow-engine');

test('prunes expired Twitch, alert, and workflow runtime state on a throttled schedule', async () => {
  const now = Date.now();

  const gateway = new TwitchIntegrationGateway({ dataDirectory: await mkdtemp(path.join(os.tmpdir(), 'tempest-twitch-runtime-')) });
  gateway.seenEvents.set('expired-event', now - 11 * 60_000);
  gateway.seenEvents.set('recent-event', now);
  gateway.pruneSeenEvents();
  assert.deepEqual([...gateway.seenEvents.keys()], ['recent-event']);
  const gatewayPrunedAt = gateway.lastSeenEventsPrunedAt;
  gateway.pruneSeenEvents();
  assert.equal(gateway.lastSeenEventsPrunedAt, gatewayPrunedAt);

  const catalog = new TempestSoundAlertCatalog(await mkdtemp(path.join(os.tmpdir(), 'tempest-alert-runtime-')));
  await catalog.initialize();
  catalog.eventIds.set('expired-event', now - 11 * 60_000);
  catalog.eventIds.set('recent-event', now);
  catalog.lastViewerTrigger.set('expired-viewer', now - 86_400_001);
  catalog.lastViewerTrigger.set('recent-viewer', now);
  catalog.pruneRuntimeState(now);
  assert.deepEqual([...catalog.eventIds.keys()], ['recent-event']);
  assert.deepEqual([...catalog.lastViewerTrigger.keys()], ['recent-viewer']);

  const engine = new TempestWorkflowEngine(async () => ({ delivery: 'simulated' }));
  engine.lastViewerTrigger.set('expired-viewer', now - 86_400_001);
  engine.lastViewerTrigger.set('recent-viewer', now);
  engine.pruneCooldownState(now);
  assert.deepEqual([...engine.lastViewerTrigger.keys()], ['recent-viewer']);
});
