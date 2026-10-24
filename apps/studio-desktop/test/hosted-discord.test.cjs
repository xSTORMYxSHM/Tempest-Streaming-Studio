const test = require('node:test');
const assert = require('node:assert/strict');
const { getHostedDiscordInstallUrl, OFFICIAL_DISCORD_APPLICATION_ID, OFFICIAL_HOSTED_DISCORD_URL, validateHostedDiscordBaseUrl, validateHostedDiscordCredentials } = require('../dist/hosted-discord');

test('ships Tempest Signal as the hosted Discord control-plane default', () => {
  assert.equal(OFFICIAL_HOSTED_DISCORD_URL, 'https://signal.tempestmainframe.com');
  assert.equal(validateHostedDiscordBaseUrl(undefined), OFFICIAL_HOSTED_DISCORD_URL);
});

test('builds the official bot install independently from Studio pairing', async () => {
  const install = new URL(await getHostedDiscordInstallUrl(undefined));
  assert.equal(install.hostname, 'discord.com');
  assert.equal(install.searchParams.get('client_id'), OFFICIAL_DISCORD_APPLICATION_ID);
  assert.match(install.searchParams.get('scope'), /applications\.commands/);
});

test('accepts bounded tenant credentials and rejects insecure public endpoints', () => {
  const value = validateHostedDiscordCredentials({
    schemaVersion: 1,
    baseUrl: OFFICIAL_HOSTED_DISCORD_URL,
    bindingId: 'e378d19e-076d-44e0-b73c-3a0f3d094ea0',
    guildId: '12345678901234567',
    studioAlias: 'Main Studio',
    relayToken: 'a'.repeat(43),
    pairedAt: '2026-10-24T12:00:00.000Z'
  });
  assert.equal(value.guildId, '12345678901234567');
  assert.equal(value.studioAlias, 'Main Studio');
  assert.throws(() => validateHostedDiscordBaseUrl('http://signal.example.com'), /HTTPS/);
  assert.throws(() => validateHostedDiscordCredentials({ ...value, relayToken: 'short' }), /invalid/);
});
