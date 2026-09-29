const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { sha256File } = require('../dist/file-checksum');

test('hashes asset files incrementally with the expected SHA-256 digest', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tempest-file-checksum-'));
  const filePath = path.join(directory, 'large-asset.bin');
  const bytes = Buffer.alloc(2 * 1024 * 1024 + 17, 0x5a);
  await writeFile(filePath, bytes);
  assert.equal(await sha256File(filePath), createHash('sha256').update(bytes).digest('hex'));
});
