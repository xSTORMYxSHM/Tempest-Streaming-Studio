#!/usr/bin/env node
import { PostgresTwitchEbsInstallationStore, startTwitchEbs } from './index';
import { readFile } from 'node:fs/promises';

function list(value: string | undefined): string[] {
  return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function bitsProducts(value: string | undefined): Record<string, { action: string; bits: number }> {
  if (!String(value || '').trim()) return {};
  const parsed = JSON.parse(String(value));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('TEMPEST_BITS_PRODUCT_ACTIONS must be a JSON object.');
  return parsed as Record<string, { action: string; bits: number }>;
}

async function main(): Promise<void> {
  const secrets = list(process.env.TWITCH_EXTENSION_SECRETS || process.env.TWITCH_EXTENSION_SECRET);
  const relayToken = String(process.env.TEMPEST_EBS_RELAY_TOKEN || '');
  const allowedChannelIds = list(process.env.TEMPEST_EBS_CHANNEL_IDS);
  const pfxPath = String(process.env.TEMPEST_EBS_TLS_PFX || '').trim();
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();
  const allowedTwitchClientIds = list(process.env.TEMPEST_EBS_TWITCH_CLIENT_IDS);
  const bitsClientId = String(process.env.TEMPEST_BITS_EXTENSION_CLIENT_ID || '').trim();
  const bitsSecrets = list(process.env.TEMPEST_BITS_EXTENSION_SECRETS || process.env.TEMPEST_BITS_EXTENSION_SECRET);
  const configuredBitsProducts = bitsProducts(process.env.TEMPEST_BITS_PRODUCT_ACTIONS);
  const bitsConfigured = Boolean(bitsClientId || bitsSecrets.length || Object.keys(configuredBitsProducts).length);
  if (bitsConfigured && (!bitsClientId || !bitsSecrets.length || !Object.keys(configuredBitsProducts).length)) {
    throw new Error('Twitch Bits mode requires TEMPEST_BITS_EXTENSION_CLIENT_ID, TEMPEST_BITS_EXTENSION_SECRETS, and TEMPEST_BITS_PRODUCT_ACTIONS.');
  }
  if (!databaseUrl && (!relayToken || !allowedChannelIds.length)) {
    throw new Error('Public EBS mode requires DATABASE_URL. Legacy local mode requires TEMPEST_EBS_RELAY_TOKEN and TEMPEST_EBS_CHANNEL_IDS.');
  }
  if (databaseUrl && !allowedTwitchClientIds.length) throw new Error('Public EBS mode requires TEMPEST_EBS_TWITCH_CLIENT_IDS.');
  const runtime = await startTwitchEbs({
    host: process.env.TEMPEST_EBS_HOST || '0.0.0.0',
    port: Number(process.env.PORT || process.env.TEMPEST_EBS_PORT) || 8080,
    twitchExtensionSecrets: secrets,
    ...(databaseUrl ? { installationStore: new PostgresTwitchEbsInstallationStore(databaseUrl, process.env.TEMPEST_DATABASE_SSL === '1') } : { relayToken, allowedChannelIds }),
    allowedTwitchClientIds,
    allowedActions: databaseUrl ? [] : list(process.env.TEMPEST_EBS_ALLOWED_ACTIONS),
    allowedOrigins: list(process.env.TEMPEST_EBS_ALLOWED_ORIGINS),
    allowAnonymous: process.env.TEMPEST_EBS_ALLOW_ANONYMOUS === '1',
    bitsExtension: bitsConfigured ? { clientId: bitsClientId, secrets: bitsSecrets, products: configuredBitsProducts } : undefined,
    discordOAuth: process.env.TEMPEST_DISCORD_CLIENT_ID && process.env.TEMPEST_DISCORD_CLIENT_SECRET ? {
      clientId: process.env.TEMPEST_DISCORD_CLIENT_ID,
      clientSecret: process.env.TEMPEST_DISCORD_CLIENT_SECRET,
      redirectUri: process.env.TEMPEST_DISCORD_REDIRECT_URI
    } : undefined,
    tls: pfxPath ? {
      pfx: await readFile(pfxPath),
      passphrase: process.env.TEMPEST_EBS_TLS_PASSWORD
    } : undefined
  });
  const stop = async () => {
    await runtime.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
