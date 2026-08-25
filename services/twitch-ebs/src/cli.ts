#!/usr/bin/env node
import { startTwitchEbs } from './index';
import { readFile } from 'node:fs/promises';

function list(value: string | undefined): string[] {
  return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  const secrets = list(process.env.TWITCH_EXTENSION_SECRETS || process.env.TWITCH_EXTENSION_SECRET);
  const relayToken = String(process.env.TEMPEST_EBS_RELAY_TOKEN || '');
  const allowedChannelIds = list(process.env.TEMPEST_EBS_CHANNEL_IDS);
  const pfxPath = String(process.env.TEMPEST_EBS_TLS_PFX || '').trim();
  const runtime = await startTwitchEbs({
    host: process.env.TEMPEST_EBS_HOST || '0.0.0.0',
    port: Number(process.env.PORT || process.env.TEMPEST_EBS_PORT) || 8080,
    twitchExtensionSecrets: secrets,
    relayToken,
    allowedChannelIds,
    allowedActions: list(process.env.TEMPEST_EBS_ALLOWED_ACTIONS),
    allowedOrigins: list(process.env.TEMPEST_EBS_ALLOWED_ORIGINS),
    allowAnonymous: process.env.TEMPEST_EBS_ALLOW_ANONYMOUS === '1',
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
