const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');
const { buildTempestDiscordProfilePack, importTempestDiscordProfilePack } = require('../dist/discord-profile-packs');

test('round-trips a portable Discord guest profile with verified images and no private layout history', async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-discord-profile-source-'));
  const destinationDirectory = await mkdtemp(path.join(os.tmpdir(), 'tempest-discord-profile-import-'));
  const idlePath = path.join(sourceDirectory, 'guest-idle.png');
  const speakingPath = path.join(sourceDirectory, 'guest-speaking.gif');
  const idleBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x11, 0x22]);
  const speakingBytes = Buffer.from('GIF89a', 'ascii');
  await writeFile(idlePath, idleBytes);
  await writeFile(speakingPath, speakingBytes);

  const pack = await buildTempestDiscordProfilePack({
    createdWithVersion: '1.2.4-test',
    profile: {
      userId: '123456789012345678',
      displayName: 'Reactive Guest',
      accent: '#22ccff',
      idleUri: pathToFileURL(idlePath).href,
      speakingUri: pathToFileURL(speakingPath).href,
      muteUri: pathToFileURL(idlePath).href,
      visible: false,
      order: 92,
      positionX: 27.5,
      positionY: 73.2,
      lastGuildName: 'Private Stream Server',
      lastChannelName: 'Live Voice'
    }
  });

  assert.equal(pack.type, 'tempest.discord-profile');
  assert.equal(pack.profile.userId, '123456789012345678');
  assert.equal(pack.profile.accent, '#22CCFF');
  assert.equal(pack.assets.length, 2);
  assert.equal(pack.media.idle, pack.media.mute);
  const serialized = JSON.stringify(pack);
  assert.doesNotMatch(serialized, /file:/i);
  assert.doesNotMatch(serialized, /tempest-discord-profile-source/i);
  assert.doesNotMatch(serialized, /Private Stream Server|Live Voice/);
  assert.doesNotMatch(serialized, /positionX|positionY|visible|order/);

  const imported = await importTempestDiscordProfilePack(pack, destinationDirectory);
  assert.equal(imported.profile.userId, '123456789012345678');
  assert.equal(imported.profile.displayName, 'Reactive Guest');
  assert.equal(imported.profile.accent, '#22CCFF');
  assert.equal(imported.assetCount, 2);
  assert.deepEqual(await readFile(fileURLToPath(imported.profile.idleUri)), idleBytes);
  assert.equal(imported.profile.idleUri, imported.profile.muteUri);
  assert.deepEqual(await readFile(fileURLToPath(imported.profile.speakingUri)), speakingBytes);
  assert.equal(imported.profile.deafenUri, undefined);

  const tampered = structuredClone(pack);
  tampered.assets[0].data = Buffer.from('tampered').toString('base64');
  await assert.rejects(() => importTempestDiscordProfilePack(tampered, destinationDirectory), /invalid size|integrity check/i);
});
