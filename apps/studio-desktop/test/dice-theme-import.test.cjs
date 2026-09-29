const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { importDiceBoxTheme } = require('../dist/dice-theme-import');

test('imports a validated Dice Box theme folder into Studio-managed storage', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tempest-dice-theme-'));
  const source = path.join(root, 'source');
  const destination = path.join(root, 'managed');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'theme.config.json'), JSON.stringify({ systemName: 'auroraDice', name: 'Aurora Dice', diceAvailable: ['d6', 'd20'], themeColor: '#44ccff', meshFile: 'aurora.json' }));
  await writeFile(path.join(source, 'aurora.json'), '{}');
  await writeFile(path.join(source, 'texture.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const imported = await importDiceBoxTheme(source, destination);
  assert.equal(imported.id, 'auroraDice');
  assert.equal(imported.name, 'Aurora Dice');
  assert.deepEqual(imported.diceAvailable, ['d6', 'd20']);
  assert.equal(imported.fileCount, 3);
  assert.equal(JSON.parse(await readFile(path.join(destination, 'auroraDice', 'theme.config.json'), 'utf8')).systemName, 'auroraDice');
});

test('rejects executable files in imported Dice Box themes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tempest-dice-theme-reject-'));
  const source = path.join(root, 'source');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'theme.config.json'), JSON.stringify({ systemName: 'unsafeDice', name: 'Unsafe Dice', diceAvailable: ['d20'] }));
  await writeFile(path.join(source, 'setup.js'), 'alert(1)');
  await assert.rejects(() => importDiceBoxTheme(source, path.join(root, 'managed')), /not a supported Dice Box theme asset/);
});

test('rejects an oversized Dice Box theme manifest before parsing it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tempest-dice-theme-manifest-'));
  const source = path.join(root, 'source');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'theme.config.json'), ' '.repeat(1024 * 1024 + 1));
  await assert.rejects(() => importDiceBoxTheme(source, path.join(root, 'managed')), /smaller than 1 MB/);
});

test('rejects built-in names and theme assets outside the selected folder', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tempest-dice-theme-path-'));
  const source = path.join(root, 'source');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'theme.config.json'), JSON.stringify({ systemName: 'default', diceAvailable: ['d20'], meshFile: '../outside.json' }));
  await assert.rejects(() => importDiceBoxTheme(source, path.join(root, 'managed')), /reserved by a built-in/);
  await writeFile(path.join(source, 'theme.config.json'), JSON.stringify({ systemName: 'outsideDice', diceAvailable: ['d20'], meshFile: '../outside.json' }));
  await assert.rejects(() => importDiceBoxTheme(source, path.join(root, 'managed')), /inside the selected theme folder/);
});
