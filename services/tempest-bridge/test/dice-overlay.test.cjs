const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TempestDiceOverlay, parseStudioDiceExpression } = require('../dist/dice-overlay');

test('parses bounded Studio dice notation without importing tabletop state', () => {
  assert.deepEqual(parseStudioDiceExpression(' 2D20 kh1 + 3 '), {
    expression: '2d20kh1+3', count: 2, sides: 20, keepMode: 'kh', keepCount: 1, modifier: 3
  });
  assert.deepEqual(parseStudioDiceExpression('4d6kl2-1'), {
    expression: '4d6kl2-1', count: 4, sides: 6, keepMode: 'kl', keepCount: 2, modifier: -1
  });
  assert.throws(() => parseStudioDiceExpression('21d6'), /between 1 and 20/);
  assert.throws(() => parseStudioDiceExpression('1d20 + fire'), /dice notation/);
});

test('resolves one fixed result before the 3D Browser Source replays it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-studio-dice-'));
  const overlay = new TempestDiceOverlay(directory);
  await overlay.initialize();

  const roll = overlay.roll({ expression: '2d20kh1+3', reason: 'Saving throw', rollerName: 'Storm' });
  assert.equal(roll.dice.length, 2);
  assert.equal(roll.dice.filter((die) => die.kept).length, 1);
  assert.equal(roll.subtotal, Math.max(...roll.dice.map((die) => die.value)));
  assert.equal(roll.total, roll.subtotal + 3);
  assert.ok(roll.dice.every((die) => die.value >= 1 && die.value <= 20));
  assert.equal(roll.reason, 'Saving throw');
  assert.equal(overlay.status('http://127.0.0.1/dice-overlay').latestRoll.id, roll.id);

  const page = overlay.page();
  assert.match(page, /Tempest Studio 3D Dice/);
  assert.match(page, /new EventSource\('\.\/dice-overlay\/events'\)/);
  assert.match(page, /TEMPEST STUDIO 3D DICE/);
  assert.match(page, /URL\.createObjectURL\(impactWav\(\)\)/);
  assert.match(page, /new Audio\(impactUrl\)/);
  assert.doesNotMatch(page, /Math\.random/);
  overlay.close();
});

test('persists presentation settings separately from roll history', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-studio-dice-settings-'));
  const overlay = new TempestDiceOverlay(directory);
  await overlay.initialize();
  await overlay.update({ theme: 'brass', durationMs: 7000, scalePercent: 115, soundEnabled: true });
  overlay.roll({ expression: '1d6' });
  overlay.close();

  const saved = JSON.parse(await readFile(path.join(directory, 'dice-overlay.json'), 'utf8'));
  assert.equal(saved.theme, 'brass');
  assert.equal(saved.durationMs, 7000);
  assert.equal(saved.scalePercent, 115);
  assert.equal(saved.soundEnabled, true);
  assert.equal(saved.latestRoll, undefined);

  const restored = new TempestDiceOverlay(directory);
  await restored.initialize();
  assert.equal(restored.status('local').settings.theme, 'brass');
  assert.equal(restored.status('local').history.length, 0);
  restored.close();
});
