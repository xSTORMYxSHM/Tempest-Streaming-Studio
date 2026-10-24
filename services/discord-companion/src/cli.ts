#!/usr/bin/env node
import { readDiscordCompanionConfig, startDiscordCompanion } from './index';

async function main(): Promise<void> {
  const runtime = await startDiscordCompanion(readDiscordCompanionConfig());
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
