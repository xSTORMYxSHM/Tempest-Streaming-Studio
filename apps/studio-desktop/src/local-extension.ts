import { randomBytes } from 'node:crypto';
import { createServer as createHttpsServer, Server } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { decodeTwitchSecrets, startTwitchEbs, TwitchEbsRuntime } from '@tempest/twitch-ebs';
import type { ExtensionRelayOptions } from '@tempest/bridge';
import type { TwitchPanelDesign } from './panel-design';

export interface LocalExtensionSettings {
  channelId: string;
  extensionSecret: string;
}

export interface LocalExtensionStatus {
  running: boolean;
  channelId?: string;
  panelUrl: string;
  componentUrl: string;
  ebsUrl: string;
  certificateAvailable: boolean;
  secretStored: boolean;
  lastError?: string;
}

export interface StartLocalExtensionOptions extends LocalExtensionSettings {
  assetRoot: string;
  pfxPath: string;
  pfxPassphrase: string;
  getPanelDesign(): Promise<TwitchPanelDesign>;
  configureRelay(options?: ExtensionRelayOptions): Promise<void>;
}

export interface LocalExtensionRuntime {
  status(): LocalExtensionStatus;
  close(): Promise<void>;
}

const panelUrl = 'https://localhost:8080/panel.html';
const componentUrl = 'https://localhost:8080/video_component.html';
const ebsUrl = 'https://localhost:8090';
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml']
]);

export function validateLocalExtensionSettings(input: unknown): LocalExtensionSettings {
  if (!input || typeof input !== 'object') throw new Error('Local Extension settings are required.');
  const source = input as { channelId?: unknown; extensionSecret?: unknown };
  const channelId = String(source.channelId || '').trim();
  const extensionSecret = String(source.extensionSecret || '').trim();
  if (!/^\d{1,30}$/.test(channelId)) throw new Error('The Twitch channel ID must be the numeric ID from the authorized account.');
  decodeTwitchSecrets([extensionSecret]);
  return { channelId, extensionSecret };
}

async function startAssetServer(assetRoot: string, pfx: Buffer, passphrase: string, getPanelDesign: () => Promise<TwitchPanelDesign>): Promise<Server> {
  const root = path.resolve(assetRoot);
  const server = createHttpsServer({ pfx, passphrase }, async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'https://localhost:8080');
      if (requestUrl.pathname === '/runtime-config.json') {
        response.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        });
        return response.end(`${JSON.stringify({ schemaVersion: 1, ebsBaseUrl: ebsUrl, mockMode: false, panelDesign: await getPanelDesign() }, null, 2)}\n`);
      }
      const requestedPath = requestUrl.pathname === '/' ? '/panel.html' : requestUrl.pathname;
      const decodedPath = decodeURIComponent(requestedPath).replaceAll('\\', '/');
      const filePath = path.resolve(root, `.${decodedPath}`);
      const relativePath = path.relative(root, filePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) throw new Error('Path is outside the Extension asset root.');
      const details = await stat(filePath);
      if (!details.isFile()) throw new Error('Asset is not a file.');
      const content = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' https://extension-files.twitch.tv; connect-src 'self' https:; img-src 'self' data:; style-src 'self'; frame-ancestors https://supervisor.ext-twitch.tv https://extension-files.twitch.tv https://*.twitch.tv https://*.twitch.tech https://localhost.twitch.tv:* https://localhost.twitch.tech:* http://localhost.rig.twitch.tv:*",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });
      response.end(content);
    } catch (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(`${(error as Error).message || 'Not found'}\n`);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(8080, '127.0.0.1', () => resolve());
  });
  return server;
}

async function closeServer(server: Server | null): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function startLocalExtension(options: StartLocalExtensionOptions): Promise<LocalExtensionRuntime> {
  const settings = validateLocalExtensionSettings(options);
  const pfx = await readFile(options.pfxPath).catch(() => {
    throw new Error('The trusted localhost certificate is missing. Use Prepare Certificate in Studio first.');
  });
  const relayToken = randomBytes(32).toString('hex');
  let ebs: TwitchEbsRuntime | null = null;
  let assetServer: Server | null = null;
  let closed = false;
  try {
    ebs = await startTwitchEbs({
      host: '127.0.0.1',
      port: 8090,
      twitchExtensionSecrets: [settings.extensionSecret],
      relayToken,
      allowedChannelIds: [settings.channelId],
      allowedActions: ['tempest.blackhole'],
      allowedOrigins: ['https://localhost:8080'],
      allowAnonymous: false,
      tls: { pfx, passphrase: options.pfxPassphrase },
      logger: { info() {}, warn() {}, error() {} }
    });
    assetServer = await startAssetServer(options.assetRoot, pfx, options.pfxPassphrase, options.getPanelDesign);
    await options.configureRelay({
      url: `${ebs.websocketUrl}`,
      token: relayToken,
      channelId: settings.channelId,
      allowUnauthorizedLocalTls: true
    });
  } catch (error) {
    await options.configureRelay(undefined).catch(() => undefined);
    await closeServer(assetServer).catch(() => undefined);
    await ebs?.close().catch(() => undefined);
    throw error;
  }

  return {
    status: () => ({
      running: !closed,
      channelId: settings.channelId,
      panelUrl,
      componentUrl,
      ebsUrl,
      certificateAvailable: true,
      secretStored: true
    }),
    close: async () => {
      if (closed) return;
      closed = true;
      await options.configureRelay(undefined).catch(() => undefined);
      await closeServer(assetServer);
      await ebs?.close();
    }
  };
}

export const localExtensionUrls = { panelUrl, componentUrl, ebsUrl } as const;
