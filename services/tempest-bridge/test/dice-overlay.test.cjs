const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { mkdtemp, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TempestDiceOverlay, diceBoxPhysicalSides, parseStudioDiceExpression } = require('../dist/dice-overlay');

function connectedClient(overlay) {
  const response = new EventEmitter();
  response.destroyed = false;
  response.writableEnded = false;
  response.chunks = [];
  response.setHeader = () => {};
  response.flushHeaders = () => {};
  response.write = (chunk) => { response.chunks.push(String(chunk)); return true; };
  response.end = () => { response.writableEnded = true; };
  overlay.connect(response);
  return response;
}

function latestEvent(response, name) {
  const prefix = `event: ${name}\ndata: `;
  const chunk = [...response.chunks].reverse().find((value) => value.startsWith(prefix));
  assert.ok(chunk, `expected ${name} event`);
  return JSON.parse(chunk.slice(prefix.length).trim());
}

test('parses bounded Studio dice notation and maps custom ranges to bundled Dice Box models', () => {
  assert.deepEqual(parseStudioDiceExpression(' 2D20 kh1 + 3 '), {
    expression: '2d20kh1+3', count: 2, sides: 20, keepMode: 'kh', keepCount: 1, modifier: 3
  });
  assert.deepEqual(parseStudioDiceExpression('1d50'), {
    expression: '1d50', count: 1, sides: 50, keepMode: undefined, keepCount: undefined, modifier: 0
  });
  assert.equal(diceBoxPhysicalSides(6), 6);
  assert.equal(diceBoxPhysicalSides(7), 8);
  assert.equal(diceBoxPhysicalSides(50), 100);
  assert.throws(() => parseStudioDiceExpression('21d6'), /between 1 and 20/);
  assert.throws(() => parseStudioDiceExpression('1d101'), /between 2 and 100/);
  assert.throws(() => parseStudioDiceExpression('1d20 + fire'), /dice notation/);
});

test('records the Dice Box physical result after the on-stream dice settle', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-studio-dice-'));
  const overlay = new TempestDiceOverlay(directory);
  await overlay.initialize();
  const client = connectedClient(overlay);
  const init = latestEvent(client, 'init');
  overlay.reportClient({ clientId: init.clientId, state: 'ready', theme: 'default', renderer: 'offscreen' });

  const rolling = overlay.roll({ expression: '2d20kh1+3', reason: 'Saving throw', rollerName: 'Storm' });
  const request = latestEvent(client, 'roll-request');
  assert.equal(request.physicalSides, 20);
  const completed = overlay.complete({ id: request.id, token: request.token, values: [7, 18] });
  assert.equal(overlay.complete({ id: request.id, token: request.token, values: [7, 18] }).id, completed.id);
  const roll = await rolling;

  assert.deepEqual(roll.dice.map((die) => die.value), [7, 18]);
  assert.equal(roll.dice.filter((die) => die.kept).length, 1);
  assert.equal(roll.subtotal, 18);
  assert.equal(roll.total, 21);
  assert.equal(roll.reason, 'Saving throw');
  assert.equal(overlay.status('http://127.0.0.1/dice-overlay').latestRoll.id, roll.id);
  assert.equal(latestEvent(client, 'roll-result').total, 21);

  const page = overlay.page();
  const browserClient = overlay.client();
  assert.match(page, /Tempest Studio 3D Dice/);
  assert.match(page, /id="diceWorld"/);
  assert.match(page, /\/dice-overlay\/client\.js/);
  assert.doesNotMatch(page, /type="module"/);
  assert.match(browserClient, /import\('\/dice-overlay\/vendor\/dice-box\.es\.min\.js'\)/);
  assert.match(browserClient, /diceBox\.roll/);
  assert.match(browserClient, /diceBox\.reroll\(rejected/);
  assert.match(browserClient, /onDieComplete: \(die\) => physicalDieListener/);
  assert.match(browserClient, /onRollComplete: \(results\) => physicalRollListener/);
  assert.match(browserClient, /Promise\.race\(\[apiResult, callbackResult\]\)/);
  assert.match(browserClient, /settled visually but did not return its physical result within 20 seconds/);
  assert.match(browserClient, /if \(payload\.roll\) showResult\(payload\.roll\)/);
  assert.match(browserClient, /postJson\('\/dice-overlay\/error'/);
  assert.match(browserClient, /hasOwnProperty\.call\(result, 'value'\)/);
  assert.match(browserClient, /diceBox\.loadTheme\(requested\)/);
  assert.match(browserClient, /Using Classic dice instead/);
  assert.match(browserClient, /Offscreen Dice Box initialization timed out/);
  assert.match(browserClient, /create\(false\)/);
  assert.match(browserClient, /new DiceBoxClass/);
  assert.match(browserClient, /new Audio\(\)/);
  assert.match(browserClient, /new AudioContextClass/);
  assert.match(browserClient, /events\.addEventListener\('audio-test'/);
  assert.doesNotMatch(browserClient, /Math\.random/);
  assert.equal(overlay.status('local').requests.pageLoads, 1);
  assert.equal(overlay.status('local').requests.clientLoads, 1);
  overlay.close();
});

test('tracks renderer readiness, verifies sound, and fails promptly when the authority disconnects', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-studio-dice-health-'));
  const overlay = new TempestDiceOverlay(directory);
  await overlay.initialize();
  const client = connectedClient(overlay);
  const init = latestEvent(client, 'init');
  overlay.reportClient({ clientId: init.clientId, state: 'degraded', theme: 'default', renderer: 'onscreen', error: 'Custom theme unavailable.' });
  assert.equal(overlay.status('local').readyClients, 1);
  assert.equal(overlay.status('local').clients[0].state, 'degraded');

  const testing = overlay.testAudio();
  const audioRequest = latestEvent(client, 'audio-test');
  overlay.reportAudio({ clientId: init.clientId, testId: audioRequest.id, state: 'ready', method: 'web-audio' });
  assert.deepEqual(await testing, { state: 'ready', method: 'web-audio', testedAt: overlay.status('local').audio.testedAt });

  const rolling = overlay.roll({ expression: '1d20' });
  latestEvent(client, 'roll-request');
  const rejected = assert.rejects(rolling, /disconnected before the roll settled/);
  client.emit('close');
  await rejected;
  assert.equal(overlay.status('local').rolling, false);
  overlay.close();
});

test('ends a pending roll immediately when the Browser Source reports a failure', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-studio-dice-failure-'));
  const overlay = new TempestDiceOverlay(directory);
  await overlay.initialize();
  const client = connectedClient(overlay);
  const rolling = overlay.roll({ expression: '1d20' });
  const rejected = assert.rejects(rolling, /OBS Dice Box callback failed/);
  const request = latestEvent(client, 'roll-request');
  overlay.fail({ id: request.id, token: request.token, message: 'OBS Dice Box callback failed.' });
  await rejected;
  assert.equal(overlay.status('local').rolling, false);
  assert.match(latestEvent(client, 'roll-error').message, /OBS Dice Box callback failed/);
  overlay.close();
});

test('persists presentation settings separately from physical roll history', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-studio-dice-settings-'));
  const overlay = new TempestDiceOverlay(directory);
  await overlay.initialize();
  await overlay.update({ theme: 'brass', diceTheme: 'wooden', durationMs: 7000, scalePercent: 115, soundEnabled: true });
  const client = connectedClient(overlay);
  const rolling = overlay.roll({ expression: '1d6' });
  const request = latestEvent(client, 'roll-request');
  overlay.complete({ id: request.id, token: request.token, values: [4] });
  await rolling;
  overlay.close();

  const saved = JSON.parse(await readFile(path.join(directory, 'dice-overlay.json'), 'utf8'));
  assert.equal(saved.theme, 'brass');
  assert.equal(saved.diceTheme, 'wooden');
  assert.equal(saved.durationMs, 7000);
  assert.equal(saved.scalePercent, 115);
  assert.equal(saved.soundEnabled, true);
  assert.equal(saved.latestRoll, undefined);

  const restored = new TempestDiceOverlay(directory);
  await restored.initialize();
  assert.equal(restored.status('local').settings.theme, 'brass');
  assert.equal(restored.status('local').settings.diceTheme, 'wooden');
  assert.equal(restored.status('local').history.length, 0);
  restored.close();
});
