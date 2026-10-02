const test = require('node:test');
const assert = require('node:assert/strict');
const { access, mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { importManagedMediaAsset, removeManagedMediaAsset } = require('../dist/media-library');

test('copies, hashes, deduplicates, and removes managed alert media', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tempest-media-library-'));
  const source = path.join(root, 'Celebration Sound.wav');
  const library = path.join(root, 'library');
  await writeFile(source, Buffer.from('RIFF-tempest-test-wave'));

  const imported = await importManagedMediaAsset(source, library);
  assert.equal(imported.manifest.type, 'tempest.media.audio');
  assert.equal(imported.manifest.name, 'Celebration Sound');
  assert.match(imported.manifest.id, /^com\.tempestmainframe\.asset\.sha256-[a-f0-9]{24}-wav$/);
  assert.match(imported.manifest.checksum, /^sha256:[a-f0-9]{64}$/);
  assert.equal(imported.manifest.metadata.managed, true);
  assert.equal(imported.reused, false);
  await access(imported.path);

  const duplicate = await importManagedMediaAsset(source, library);
  assert.equal(duplicate.manifest.id, imported.manifest.id);
  assert.equal(duplicate.path, imported.path);
  assert.equal(duplicate.reused, true);

  assert.equal(await removeManagedMediaAsset(imported.manifest.uri, library), true);
  assert.equal(await removeManagedMediaAsset(imported.manifest.uri, library), false);
});

test('rejects unsupported files and removal outside the managed library', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tempest-media-library-guard-'));
  const source = path.join(root, 'payload.exe');
  const library = path.join(root, 'library');
  await writeFile(source, 'not media');
  await assert.rejects(importManagedMediaAsset(source, library), /support MP3/);
  await assert.rejects(removeManagedMediaAsset(new URL(`file:///${source.replaceAll('\\', '/')}`).href, library), /outside the Studio Media Library/);
});
