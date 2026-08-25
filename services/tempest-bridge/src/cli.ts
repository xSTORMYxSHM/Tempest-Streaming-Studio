#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { extensionRelayOptionsFromEnvironment, startTempestBridge } from './index';

function defaultDataDirectory(): string {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Tempest Mainframe', 'Bridge');
  }
  return path.join(os.homedir(), '.tempest-mainframe', 'bridge');
}

async function main(): Promise<void> {
  const runtime = await startTempestBridge({
    host: process.env.TEMPEST_BRIDGE_HOST || '127.0.0.1',
    port: Number(process.env.TEMPEST_BRIDGE_PORT) || 4765,
    dataDirectory: process.env.TEMPEST_BRIDGE_DATA_DIR || defaultDataDirectory(),
    token: process.env.TEMPEST_BRIDGE_TOKEN,
    extensionRelay: extensionRelayOptionsFromEnvironment()
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
