#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { startWarudoAdapter } from './index';

async function resolveToken(): Promise<string> {
  const supplied = String(process.env.TEMPEST_BRIDGE_TOKEN || '').trim();
  if (supplied) return supplied;
  const defaultPath = path.join(String(process.env.APPDATA || ''), '@tempest', 'studio-desktop', 'bridge', 'bridge-token');
  const tokenPath = String(process.env.TEMPEST_BRIDGE_TOKEN_FILE || defaultPath).trim();
  if (!tokenPath) throw new Error('Set TEMPEST_BRIDGE_TOKEN or TEMPEST_BRIDGE_TOKEN_FILE.');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const token = (await readFile(tokenPath, 'utf8')).trim();
      if (token) return token;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (attempt === 0) console.log(`Waiting for Studio to create its Bridge token at ${tokenPath}...`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Studio Bridge token was not created within 60 seconds: ${tokenPath}`);
}

async function main(): Promise<void> {
  const runtime = startWarudoAdapter({
    bridgeUrl: process.env.TEMPEST_BRIDGE_URL,
    bridgeToken: await resolveToken(),
    warudoUrl: process.env.TEMPEST_WARUDO_URL
  });
  const stop = async () => { await runtime.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
