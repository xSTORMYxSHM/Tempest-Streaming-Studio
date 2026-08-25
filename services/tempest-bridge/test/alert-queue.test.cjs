const test = require('node:test');
const assert = require('node:assert/strict');
const { TempestAlertQueue } = require('../dist/alert-queue');

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));
const waitUntil = async (predicate, message, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(10);
  }
  assert.fail(message);
};

test('plays Twitch and Interaction Alerts in one FIFO stage', async (context) => {
  const started = [];
  const queue = new TempestAlertQueue({ maximumWaiting: 4, transitionGapMs: 10 });
  context.after(() => queue.close());
  const request = (kind, alertId) => ({
    kind,
    alertId,
    name: alertId,
    source: 'test',
    durationMs: 250,
    execute() { started.push(alertId); return { alertId }; }
  });

  const first = await queue.enqueue(request('interaction', 'interaction.first'));
  const second = await queue.enqueue(request('twitch', 'twitch.second'));
  const third = await queue.enqueue(request('interaction', 'interaction.third'));
  assert.equal(first.queued, false);
  assert.equal(second.position, 1);
  assert.equal(third.position, 2);
  assert.deepEqual(started, ['interaction.first']);

  await waitUntil(() => started.length >= 2, 'Second queued alert did not start.');
  assert.deepEqual(started, ['interaction.first', 'twitch.second']);
  assert.equal(queue.status().active.alertId, 'twitch.second');
  await waitUntil(() => started.length >= 3, 'Third queued alert did not start.');
  assert.deepEqual(started, ['interaction.first', 'twitch.second', 'interaction.third']);
  await waitUntil(() => queue.status().state === 'idle', 'Alert Queue did not return to idle.');
  assert.equal(queue.status().state, 'idle');
});

test('bounds the backlog and can clear waiting alerts without interrupting the active one', async (context) => {
  const queue = new TempestAlertQueue({ maximumWaiting: 1, transitionGapMs: 10 });
  context.after(() => queue.close());
  const request = (alertId) => ({
    kind: 'twitch', alertId, name: alertId, source: 'test', durationMs: 250, execute: () => ({})
  });

  await queue.enqueue(request('twitch.active'));
  await queue.enqueue(request('twitch.waiting'));
  await assert.rejects(() => queue.enqueue(request('twitch.overflow')), /Alert Queue is full/);
  assert.equal(queue.clearWaiting(), 1);
  assert.equal(queue.status().active.alertId, 'twitch.active');
  assert.equal(queue.status().waitingCount, 0);
  assert.equal(queue.clearAll(), 1);
  assert.equal(queue.status().state, 'idle');
});
