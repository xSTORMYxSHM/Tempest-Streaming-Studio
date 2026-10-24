const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { TempestExtensionFeaturePlacements } = require('../dist/extension-features');

const definitions = [
  { id: 'tempest.dice.roll', name: 'Roll a d20', group: 'Stream Games', description: 'Roll on stream.', defaultDestinations: [] },
  { id: 'tempest.pet.play', name: 'Play With Pet', group: 'Screen Pet', description: 'Play with the pet.', defaultDestinations: [] }
];

test('persists independent panel and overlay feature placement with safe defaults', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-extension-features-'));
  let placements = new TempestExtensionFeaturePlacements(dataDirectory);
  await placements.initialize();

  assert.deepEqual(placements.destinations('tempest.dice.roll', []), []);
  assert.deepEqual(placements.list(definitions).map((feature) => [feature.id, feature.destinations, feature.customized]), [
    ['tempest.dice.roll', [], false],
    ['tempest.pet.play', [], false]
  ]);

  const panelOnly = await placements.update('tempest.dice.roll', { destinations: ['mainframe'] }, definitions);
  assert.deepEqual(panelOnly.destinations, ['mainframe']);
  assert.equal(panelOnly.customized, true);
  const overlayOnly = await placements.update('tempest.pet.play', { destinations: ['streaming'] }, definitions);
  assert.deepEqual(overlayOnly.destinations, ['streaming']);

  placements = new TempestExtensionFeaturePlacements(dataDirectory);
  await placements.initialize();
  assert.deepEqual(placements.destinations('tempest.dice.roll', []), ['mainframe']);
  assert.deepEqual(placements.destinations('tempest.pet.play', []), ['streaming']);

  const saved = JSON.parse(await readFile(path.join(dataDirectory, 'extension-feature-placements.json'), 'utf8'));
  assert.deepEqual(saved.placements, { 'tempest.dice.roll': ['mainframe'], 'tempest.pet.play': ['streaming'] });

  const restored = await placements.reset(definitions);
  assert.deepEqual(restored.map((feature) => feature.destinations), [[], []]);
  await assert.rejects(() => placements.update('tempest.unknown', { destinations: ['streaming'] }, definitions), /was not found/);
  await assert.rejects(() => placements.update('tempest.dice.roll', { destinations: ['mobile'] }, definitions), /mainframe or streaming/);
});
