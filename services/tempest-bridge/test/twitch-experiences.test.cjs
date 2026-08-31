const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { TempestTwitchExperiences } = require('../dist/twitch-experiences');

test('tracks Hype Train, Raid Portal, and goal overlay state independently', async () => {
  const experiences = new TempestTwitchExperiences(await mkdtemp(path.join(os.tmpdir(), 'tempest-experiences-')));
  await experiences.initialize();
  const event = (id, topic, payload) => ({ schemaVersion: 1, id, topic, occurredAt: new Date().toISOString(), source: 'twitch', channel: { id: 'channel' }, payload });
  experiences.ingest(event('hype', 'channel.hype-train.updated', { phase: 'progress', level: 2, progress: 400, goal: 1000, total: 1400 }));
  experiences.ingest(event('goal', 'channel.goal.updated', { phase: 'progress', description: 'Signal Goal', currentAmount: 7, targetAmount: 10 }));
  experiences.ingest({ ...event('raid', 'viewer.raid.received', { fromBroadcasterId: 'raider', fromBroadcasterName: 'Raid Leader', viewers: 42 }), viewer: { id: 'raider', displayName: 'Raid Leader' } });
  let status = experiences.status('http://127.0.0.1/twitch-experiences');
  assert.deepEqual(status.active, { hypeTrain: true, raidPortal: true, goalOverlay: true });
  assert.equal(status.experienceState.raid.fromBroadcasterName, 'Raid Leader');
  await experiences.update({ raidPortalEnabled: false, hypeAccent: '#112233' });
  experiences.clear();
  experiences.preview('raid-portal');
  status = experiences.status('local');
  assert.equal(status.active.raidPortal, false, 'disabled experiences do not activate during previews');
  experiences.preview('hype-train');
  assert.equal(experiences.status('local').active.hypeTrain, true);
  experiences.close();
});
