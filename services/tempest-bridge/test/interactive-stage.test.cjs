const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { startTempestBridge } = require('../dist');

async function start() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-interactive-stage-'));
  const runtime = await startTempestBridge({ port: 0, dataDirectory, logger: { info() {}, warn() {}, error() {} } });
  const headers = { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token };
  return { runtime, headers, dataDirectory };
}

test('Interactive Stage spawns, moves, reconnects, dismisses, and validates objects', async (context) => {
  const { runtime, headers, dataDirectory } = await start();
  context.after(() => runtime.close());

  const unauthorized = await fetch(`${runtime.baseUrl}/v1/interactive-stage`);
  assert.equal(unauthorized.status, 401);

  const page = await fetch(`${runtime.baseUrl}/interactive-stage?orientation=horizontal`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Tempest Interactive Stage/);

  const createdResponse = await fetch(`${runtime.baseUrl}/v1/interactive-stage/objects`, {
    method: 'POST', headers, body: JSON.stringify({
      id: 'test-object', kind: 'text', state: 'idle', lifetimeMs: 30_000,
      owner: { platform: 'studio', userId: 'operator' },
      placement: { x: 0.25, y: 0.75, scale: 1.2, anchor: 'center', layer: 4 },
      scenePlacements: { vertical: { x: 0.5, y: 0.85, scale: 0.8, anchor: 'bottom', layer: 6 } },
      properties: { label: 'Stage test', accent: '#54f2eb' }
    })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.object.id, 'test-object');
  assert.equal(created.revision, 1);

  const movedResponse = await fetch(`${runtime.baseUrl}/v1/interactive-stage/objects/test-object/move`, {
    method: 'POST', headers, body: JSON.stringify({ placement: { x: 0.8, y: 0.2 } })
  });
  assert.equal(movedResponse.status, 200);
  assert.equal((await movedResponse.json()).object.placement.x, 0.8);

  const updatedResponse = await fetch(`${runtime.baseUrl}/v1/interactive-stage/objects/test-object`, {
    method: 'POST', headers, body: JSON.stringify({
      state: 'emote', properties: { label: 'Updated Stage test' },
      scenePlacements: { vertical: { x: 0.65, y: 0.7, scale: 0.9, anchor: 'center', layer: 8 } }
    })
  });
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.object.state, 'emote');
  assert.equal(updated.object.properties.accent, '#54f2eb');
  assert.equal(updated.object.properties.label, 'Updated Stage test');
  assert.equal(updated.object.scenePlacements.vertical.x, 0.65);

  const layoutResponse = await fetch(`${runtime.baseUrl}/v1/interactive-stage/layout`, {
    method: 'POST', headers, body: JSON.stringify({
      worldMap: {
        enabled: true, wanderEnabled: true, jumpEnabled: true,
        floorY: 0.9, speed: 0.05, gravity: 1.3, jumpStrength: 0.6,
        platforms: [{ id: 'test-ledge', name: 'Test ledge', x: 0.2, y: 0.7, width: 0.3, height: 0.025, color: '#54f2eb', collision: 'one-way', enabled: true, orientations: ['horizontal'] }],
        interactables: [
          { id: 'test-switch', name: 'Test switch', kind: 'switch', glyph: 'USE', linkId: 'test-gate', x: 0.5, y: 0.8, width: 0.05, height: 0.08, color: '#b99cff', enabled: true, orientations: ['horizontal', 'vertical'] },
          { id: 'test-door', name: 'Test door', kind: 'door', glyph: 'GATE', linkId: 'test-gate', x: 0.7, y: 0.6, width: 0.04, height: 0.3, color: '#b99cff', enabled: true, orientations: ['horizontal', 'vertical'] },
          { id: 'test-block', name: 'Test block', kind: 'push-block', glyph: 'PUSH', x: 0.3, y: 0.8, width: 0.06, height: 0.08, color: '#44aaff', enabled: true, orientations: ['horizontal', 'vertical'] }
        ]
      }
    })
  });
  assert.equal(layoutResponse.status, 200);
  const layout = await layoutResponse.json();
  assert.equal(layout.worldMap.floorY, 0.9);
  assert.equal(layout.worldMap.platforms[0].id, 'test-ledge');
  assert.equal(layout.worldMap.platforms[0].collision, 'one-way');
  assert.equal(layout.worldMap.interactables[0].kind, 'switch');

  const toggled = await fetch(`${runtime.baseUrl}/interactive-stage/world-event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'test-switch', action: 'toggle' })
  });
  assert.equal(toggled.status, 202);
  assert.equal((await toggled.json()).worldState.objects['test-switch'].active, true);
  const movedBlock = await fetch(`${runtime.baseUrl}/interactive-stage/world-event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: 'test-block', action: 'move', x: 0.36, y: 0.8 })
  });
  assert.equal(movedBlock.status, 202);
  assert.equal((await movedBlock.json()).worldState.objects['test-block'].x, 0.36);
  const persistedStage = JSON.parse(await readFile(path.join(dataDirectory, 'interactive-stage.json'), 'utf8'));
  assert.equal(persistedStage.worldState.objects['test-switch'].active, true);
  assert.equal(persistedStage.worldState.objects['test-block'].x, 0.36);

  const replay = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json());
  assert.equal(replay.activeCount, 1);
  assert.equal(replay.objects[0].placement.y, 0.2);
  assert.equal(replay.revision, 6);
  assert.equal(replay.worldState.objects['test-switch'].active, true);
  assert.equal(replay.worldState.objects['test-block'].x, 0.36);

  const reconnectController = new AbortController();
  const eventStream = await fetch(`${runtime.baseUrl}/interactive-stage/events?orientation=vertical`, { signal: reconnectController.signal });
  assert.equal(eventStream.status, 200);
  const reader = eventStream.body.getReader();
  const firstEvent = new TextDecoder().decode((await reader.read()).value);
  assert.match(firstEvent, /event: init/);
  assert.match(firstEvent, /"id":"test-object"/);
  assert.match(firstEvent, /"x":0\.65/);
  assert.match(firstEvent, /"y":0\.7/);
  assert.match(firstEvent, /"floorY":0\.9/);
  assert.doesNotMatch(firstEvent, /test-ledge/);
  assert.match(firstEvent, /test-switch/);
  assert.match(firstEvent, /"worldState"/);
  await reader.cancel();
  reconnectController.abort();

  const duplicate = await fetch(`${runtime.baseUrl}/v1/interactive-stage/objects`, {
    method: 'POST', headers, body: JSON.stringify({ id: 'test-object', lifetimeMs: 1000 })
  });
  assert.equal(duplicate.status, 400);

  const invalid = await fetch(`${runtime.baseUrl}/v1/interactive-stage/objects`, {
    method: 'POST', headers, body: JSON.stringify({ id: 'outside', placement: { x: 2 } })
  });
  assert.equal(invalid.status, 400);

  const removed = await fetch(`${runtime.baseUrl}/v1/interactive-stage/objects/test-object`, { method: 'DELETE', headers });
  assert.equal(removed.status, 200);
  const empty = await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json());
  assert.equal(empty.activeCount, 0);
  assert.equal(empty.revision, 7);
});

test('Interactive Stage expires objects and Emergency Stop clears persistent objects', async (context) => {
  const { runtime, headers } = await start();
  context.after(() => runtime.close());

  const expiring = await fetch(`${runtime.baseUrl}/v1/interactive-stage/objects`, {
    method: 'POST', headers, body: JSON.stringify({ id: 'short-lived', lifetimeMs: 250, properties: { label: 'Short' } })
  });
  assert.equal(expiring.status, 201);
  await new Promise((resolve) => setTimeout(resolve, 325));
  assert.equal((await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json())).activeCount, 0);

  await fetch(`${runtime.baseUrl}/v1/interactive-stage/objects`, {
    method: 'POST', headers, body: JSON.stringify({ id: 'persistent', properties: { label: 'Persistent' } })
  });
  const stopped = await fetch(`${runtime.baseUrl}/v1/safety/stop`, { method: 'POST', headers, body: JSON.stringify({ reason: 'test' }) });
  assert.equal(stopped.status, 200);
  assert.equal((await stopped.json()).clearedStageObjects, 1);
  assert.equal((await fetch(`${runtime.baseUrl}/v1/interactive-stage`, { headers }).then((response) => response.json())).activeCount, 0);
});
