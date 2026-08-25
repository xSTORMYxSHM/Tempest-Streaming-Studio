import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { createConnection } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const certificatePath = path.join(workspace, '.tempest-extension', 'localhost.pfx');
const ebsUrl = 'https://localhost:8090';
const channelId = String(process.env.TEMPEST_TWITCH_CHANNEL_ID || '546679431').trim();
const extensionSecret = String(process.env.TWITCH_EXTENSION_SECRET || process.env.TWITCH_EXTENSION_SECRETS || '').trim();
const npmExecPath = process.env.npm_execpath;

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(500, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

if (!/^\d{1,30}$/.test(channelId)) throw new Error('TEMPEST_TWITCH_CHANNEL_ID must be your numeric Twitch channel ID.');
if (!extensionSecret) throw new Error('Set TWITCH_EXTENSION_SECRET to the base64 Extension secret from the Twitch developer console before starting the local test.');
if (!npmExecPath) throw new Error('Run this command through pnpm: pnpm local:twitch');
await access(certificatePath).catch(() => {
  throw new Error('Local HTTPS certificate is missing. Run: powershell -ExecutionPolicy Bypass -File tools/create-extension-certificate.ps1 -Trust');
});
const occupiedPorts = (await Promise.all([4765, 8080, 8090].map(async (port) => [port, await portIsOpen(port)])))
  .filter(([, occupied]) => occupied)
  .map(([port]) => port);
if (occupiedPorts.length) throw new Error(`Close the existing Studio or local Extension services using port(s) ${occupiedPorts.join(', ')}, then run pnpm local:twitch again.`);

const sharedEnvironment = {
  ...process.env,
  TEMPEST_EXTENSION_EBS_URL: ebsUrl
};

await new Promise((resolve, reject) => {
  const build = spawn(process.execPath, [npmExecPath, '-r', '--sort', 'build'], {
    cwd: workspace,
    env: sharedEnvironment,
    stdio: 'inherit',
    windowsHide: true
  });
  build.once('error', reject);
  build.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Workspace build failed with exit code ${code}.`)));
});

const relayToken = randomBytes(32).toString('hex');
const children = [];
let shuttingDown = false;

function launch(name, executable, args, environment = {}) {
  const child = spawn(executable, args, {
    cwd: workspace,
    env: { ...sharedEnvironment, ...environment },
    stdio: 'inherit',
    windowsHide: name !== 'Studio'
  });
  children.push(child);
  child.once('error', (error) => {
    console.error(`${name} could not start:`, error);
    void shutdown(1);
  });
  child.once('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`${name} stopped unexpectedly with exit code ${code}.`);
      void shutdown(code || 1);
    }
  });
  return child;
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
  process.exit(exitCode);
}

launch('Twitch EBS', process.execPath, [path.join(workspace, 'services', 'twitch-ebs', 'dist', 'cli.js')], {
  TWITCH_EXTENSION_SECRETS: extensionSecret,
  TEMPEST_EBS_RELAY_TOKEN: relayToken,
  TEMPEST_EBS_CHANNEL_IDS: channelId,
  TEMPEST_EBS_HOST: '127.0.0.1',
  TEMPEST_EBS_PORT: '8090',
  TEMPEST_EBS_ALLOWED_ACTIONS: 'tempest.blackhole',
  TEMPEST_EBS_ALLOWED_ORIGINS: 'https://localhost:8080',
  TEMPEST_EBS_TLS_PFX: certificatePath,
  TEMPEST_EBS_TLS_PASSWORD: 'tempest-local-dev'
});

launch('Extension server', process.execPath, [path.join(workspace, 'apps', 'twitch-extension', 'server.mjs')]);

const requireFromStudio = createRequire(pathToFileURL(path.join(workspace, 'apps', 'studio-desktop', 'package.json')));
const electronExecutable = requireFromStudio('electron');
launch('Studio', electronExecutable, [path.join(workspace, 'apps', 'studio-desktop', 'dist', 'main.js')], {
  TEMPEST_EXTENSION_RELAY_URL: 'wss://localhost:8090/v1/studio',
  TEMPEST_EXTENSION_RELAY_TOKEN: relayToken,
  TEMPEST_EXTENSION_CHANNEL_ID: channelId,
  TEMPEST_EXTENSION_RELAY_ALLOW_SELF_SIGNED: '1'
});

console.log('');
console.log('Tempest local Twitch integration is running.');
console.log('Extension viewer: https://localhost:8080/video_component.html');
console.log('Extension config: https://localhost:8080/config.html');
console.log('Local EBS health: https://localhost:8090/health');
console.log('Warudo blueprint socket: ws://127.0.0.1:19190/ (adapter is embedded in Studio)');
console.log('Press Ctrl+C to stop the local integration services.');

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));
await new Promise(() => {});
