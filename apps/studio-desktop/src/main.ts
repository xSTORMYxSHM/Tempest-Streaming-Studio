import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from 'electron';
import { extensionRelayOptionsFromEnvironment, startTempestBridge, TempestBridgeRuntime, TwitchCredentialStore, TwitchTokenSet } from '@tempest/bridge';
import { TempestApplicationManifest, TempestSoundAlertPlaybackCommand, validateApplicationManifest } from '@tempest/contracts';
import { startWarudoAdapter, WarudoAdapterRuntime } from '@tempest/warudo-adapter';
import {
  LocalExtensionRuntime,
  LocalExtensionStatus,
  localExtensionUrls,
  startLocalExtension,
  validateLocalExtensionSettings
} from './local-extension';
import { defaultTwitchPanelDesign, TwitchPanelDesign, validateTwitchPanelDesign } from './panel-design';

const bridgePort = Number(process.env.TEMPEST_BRIDGE_PORT) || 4765;
const productName = 'Tempest Streaming Studio';
const captureArgument = process.argv.find((argument) => argument.startsWith('--capture-ui='));
const captureSectionArgument = process.argv.find((argument) => argument.startsWith('--capture-section='));
const captureTargetArgument = process.argv.find((argument) => argument.startsWith('--capture-target='));
const captureDialogArgument = process.argv.find((argument) => argument.startsWith('--capture-dialog='));
const captureOverlay = process.argv.includes('--capture-overlay');
const capturePreviewArgument = process.argv.find((argument) => argument.startsWith('--capture-preview='));
let bridge: TempestBridgeRuntime | null = null;
let warudoAdapter: WarudoAdapterRuntime | null = null;
let localExtension: LocalExtensionRuntime | null = null;
let localExtensionLastError: string | undefined;
let mainWindow: BrowserWindow | null = null;
const twitchAuthorizationWindows = new Set<BrowserWindow>();

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const extensionAssetRoot = path.join(workspaceRoot, 'apps', 'twitch-extension', 'dist');
const extensionCertificatePath = path.join(workspaceRoot, '.tempest-extension', 'localhost.pfx');
const extensionCertificateScript = path.join(workspaceRoot, 'tools', 'create-extension-certificate.ps1');
const extensionCertificatePassword = 'tempest-local-dev';

interface StoredLocalExtensionSettings {
  schemaVersion: 1;
  channelId: string;
  extensionSecret: string;
}

async function waitForRendererReady(window: BrowserWindow): Promise<boolean> {
  return window.webContents.executeJavaScript(`new Promise((resolve) => {
    const deadline = performance.now() + 5000;
    const check = () => {
      if (window.__tempestStudioReady) return resolve(true);
      if (performance.now() >= deadline) return resolve(false);
      setTimeout(check, 50);
    };
    check();
  })`);
}

function resolveManifestPath(value: string | undefined, manifestDirectory: string): string | undefined {
  if (!value) return value;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(manifestDirectory, value);
}

function createTwitchCredentialStore(dataDirectory: string, fileName = 'twitch-credentials.bin'): TwitchCredentialStore {
  const credentialPath = path.join(dataDirectory, fileName);
  return {
    available: safeStorage.isEncryptionAvailable(),
    async load(): Promise<TwitchTokenSet | null> {
      if (!safeStorage.isEncryptionAvailable()) return null;
      try {
        const encrypted = await readFile(credentialPath);
        return JSON.parse(safeStorage.decryptString(encrypted)) as TwitchTokenSet;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new Error(`Could not read secure Twitch credentials: ${(error as Error).message}`);
      }
    },
    async save(tokens: TwitchTokenSet): Promise<void> {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Operating-system credential encryption is unavailable.');
      await mkdir(dataDirectory, { recursive: true });
      await writeFile(credentialPath, safeStorage.encryptString(JSON.stringify(tokens)), { mode: 0o600 });
    },
    async clear(): Promise<void> {
      await unlink(credentialPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  };
}

function localExtensionCredentialPath(): string {
  return path.join(app.getPath('userData'), 'local-extension-credentials.bin');
}

function giphyCredentialPath(): string {
  return path.join(app.getPath('userData'), 'giphy-api-key.bin');
}

function twitchPanelDesignPath(): string {
  return path.join(app.getPath('userData'), 'twitch-panel-design.json');
}

async function loadTwitchPanelDesign(): Promise<TwitchPanelDesign> {
  try { return validateTwitchPanelDesign(JSON.parse(await readFile(twitchPanelDesignPath(), 'utf8'))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...defaultTwitchPanelDesign };
    throw new Error(`Could not read the Twitch Panel design: ${(error as Error).message}`);
  }
}

async function saveTwitchPanelDesign(input: unknown): Promise<TwitchPanelDesign> {
  const design = validateTwitchPanelDesign(input);
  await mkdir(path.dirname(twitchPanelDesignPath()), { recursive: true });
  await writeFile(twitchPanelDesignPath(), `${JSON.stringify(design, null, 2)}\n`, { mode: 0o600 });
  return design;
}

async function loadGiphyApiKey(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(await readFile(giphyCredentialPath())).trim() || null; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Could not read the encrypted GIPHY API key: ${(error as Error).message}`);
  }
}

async function saveGiphyApiKey(value: unknown): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable.');
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 200 || /[\r\n\0]/.test(key)) throw new Error('Enter a valid GIPHY API key.');
  await mkdir(path.dirname(giphyCredentialPath()), { recursive: true });
  await writeFile(giphyCredentialPath(), safeStorage.encryptString(key), { mode: 0o600 });
}

async function loadLocalExtensionSettings(): Promise<StoredLocalExtensionSettings | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await readFile(localExtensionCredentialPath());
    const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as StoredLocalExtensionSettings;
    const validated = validateLocalExtensionSettings(parsed);
    return { schemaVersion: 1, ...validated };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Could not read encrypted Local Extension settings: ${(error as Error).message}`);
  }
}

async function saveLocalExtensionSettings(settings: StoredLocalExtensionSettings): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable.');
  const validated = validateLocalExtensionSettings(settings);
  const credentialPath = localExtensionCredentialPath();
  await mkdir(path.dirname(credentialPath), { recursive: true });
  await writeFile(credentialPath, safeStorage.encryptString(JSON.stringify({ schemaVersion: 1, ...validated })), { mode: 0o600 });
}

async function getLocalExtensionStatus(): Promise<LocalExtensionStatus> {
  const [stored, certificate] = await Promise.all([
    loadLocalExtensionSettings().catch(() => null),
    stat(extensionCertificatePath).catch(() => null)
  ]);
  return {
    running: Boolean(localExtension),
    channelId: localExtension?.status().channelId || stored?.channelId,
    ...localExtensionUrls,
    certificateAvailable: Boolean(certificate?.isFile()),
    secretStored: Boolean(stored),
    lastError: localExtensionLastError
  };
}

async function stopLocalExtension(): Promise<void> {
  const runtime = localExtension;
  localExtension = null;
  if (runtime) await runtime.close();
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 680,
    show: !process.argv.includes('--smoke-test') && !captureArgument,
    backgroundColor: '#05080d',
    title: productName,
    icon: path.join(__dirname, 'renderer', 'assets', 'app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  window.removeMenu();
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  return window;
}

function isAllowedTwitchAuthorizationNavigation(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'twitch.tv' || url.hostname.endsWith('.twitch.tv'));
  } catch {
    return false;
  }
}

async function openIsolatedTwitchAuthorization(value: unknown): Promise<boolean> {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:' || url.hostname !== 'www.twitch.tv' || url.pathname !== '/activate') {
    throw new Error('Only Twitch device activation may open in the isolated sign-in window.');
  }
  const authWindow = new BrowserWindow({
    width: 760,
    height: 820,
    minWidth: 560,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Connect Chat Bot to Twitch',
    backgroundColor: '#0e0e10',
    ...(mainWindow ? { parent: mainWindow } : {}),
    webPreferences: {
      partition: `tempest-twitch-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  });
  twitchAuthorizationWindows.add(authWindow);
  const authSession = authWindow.webContents.session;
  authSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  authSession.on('will-download', (event) => event.preventDefault());
  const guardNavigation = (event: Electron.Event, targetUrl: string) => {
    if (!isAllowedTwitchAuthorizationNavigation(targetUrl)) event.preventDefault();
  };
  authWindow.webContents.on('will-navigate', guardNavigation);
  authWindow.webContents.on('will-redirect', guardNavigation);
  authWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isAllowedTwitchAuthorizationNavigation(targetUrl) && !authWindow.isDestroyed()) void authWindow.loadURL(targetUrl);
    return { action: 'deny' };
  });
  authWindow.once('ready-to-show', () => authWindow.show());
  authWindow.on('closed', () => {
    twitchAuthorizationWindows.delete(authWindow);
    void authSession.clearStorageData().catch(() => {});
  });
  try {
    await authWindow.loadURL(url.href);
    return true;
  } catch (error) {
    if (!authWindow.isDestroyed()) authWindow.destroy();
    throw new Error(`Could not open the isolated Twitch sign-in: ${(error as Error).message}`);
  }
}

function closeIsolatedTwitchAuthorization(): number {
  const windows = [...twitchAuthorizationWindows];
  for (const window of windows) {
    if (!window.isDestroyed()) window.close();
  }
  return windows.length;
}

function registerDesktopHandlers(): void {
  ipcMain.handle('studio:copy-text', (_event, value: unknown) => {
    const text = String(value || '');
    if (!text || text.length > 4096) throw new Error('The value could not be copied.');
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle('studio:get-bridge-config', () => {
    if (!bridge) throw new Error('Tempest Bridge is not running.');
    return { baseUrl: bridge.baseUrl, protocolVersion: '1.0' };
  });

  ipcMain.handle('studio:bridge-request', async (_event, request: { path?: string; method?: string; body?: unknown }) => {
    if (!bridge) throw new Error('Tempest Bridge is not running.');
    const requestPath = String(request?.path || '');
    if (requestPath !== '/health' && !requestPath.startsWith('/v1/')) throw new Error('Bridge route is outside the Studio API boundary.');
    const method = String(request?.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'DELETE'].includes(method)) throw new Error('Bridge request method is not permitted.');
    const response = await fetch(`${bridge.baseUrl}${requestPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Tempest-Token': bridge.token
      },
      body: method === 'GET' ? undefined : JSON.stringify(request?.body ?? {})
    });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || `Bridge request failed with ${response.status}.`);
    return body;
  });

  ipcMain.handle('studio:get-warudo-status', () => ({
    ...(warudoAdapter?.status() || { bridge: 'disconnected', warudo: 'disconnected' }),
    endpoint: process.env.TEMPEST_WARUDO_URL || 'ws://localhost:4770/',
    action: 'tempestPerformance'
  }));

  ipcMain.handle('studio:get-local-extension-status', () => getLocalExtensionStatus());
  ipcMain.handle('studio:get-twitch-panel-design', () => loadTwitchPanelDesign());
  ipcMain.handle('studio:save-twitch-panel-design', (_event, input: unknown) => saveTwitchPanelDesign(input));

  ipcMain.handle('studio:start-local-extension', async (_event, input: { channelId?: unknown; extensionSecret?: unknown }) => {
    if (!bridge) throw new Error('Tempest Bridge is not running.');
    if (localExtension) return getLocalExtensionStatus();
    const stored = await loadLocalExtensionSettings();
    const channelId = String(input?.channelId || stored?.channelId || '').trim();
    const extensionSecret = String(input?.extensionSecret || stored?.extensionSecret || '').trim();
    const settings = validateLocalExtensionSettings({ channelId, extensionSecret });
    await saveLocalExtensionSettings({ schemaVersion: 1, ...settings });
    localExtensionLastError = undefined;
    try {
      localExtension = await startLocalExtension({
        ...settings,
        assetRoot: extensionAssetRoot,
        pfxPath: extensionCertificatePath,
        pfxPassphrase: extensionCertificatePassword,
        getPanelDesign: () => loadTwitchPanelDesign(),
        configureRelay: (options) => bridge!.configureExtensionRelay(options)
      });
      return getLocalExtensionStatus();
    } catch (error) {
      localExtensionLastError = (error as Error).message;
      throw error;
    }
  });

  ipcMain.handle('studio:stop-local-extension', async () => {
    await stopLocalExtension();
    localExtensionLastError = undefined;
    return getLocalExtensionStatus();
  });

  ipcMain.handle('studio:forget-local-extension-secret', async () => {
    await stopLocalExtension();
    await unlink(localExtensionCredentialPath()).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    localExtensionLastError = undefined;
    return getLocalExtensionStatus();
  });

  ipcMain.handle('studio:prepare-local-extension-certificate', async () => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', extensionCertificateScript, '-Trust'], {
      cwd: workspaceRoot,
      windowsHide: true,
      stdio: 'ignore',
      shell: false
    });
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
    if (exitCode !== 0) throw new Error(`Local certificate preparation failed with exit code ${exitCode}.`);
    return getLocalExtensionStatus();
  });

  ipcMain.handle('studio:open-local-extension-panel', async () => {
    if (!localExtension) throw new Error('Start the Local Extension before opening its panel.');
    await shell.openExternal(localExtensionUrls.panelUrl);
    return true;
  });

  ipcMain.handle('studio:select-application-manifest', async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined as never, {
      title: 'Register Tempest Application',
      properties: ['openFile'],
      filters: [
        { name: 'Tempest application manifest', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const manifestPath = result.filePaths[0];
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8')) as TempestApplicationManifest;
    const validation = validateApplicationManifest(parsed);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join('\n'));
    const manifestDirectory = path.dirname(manifestPath);
    const manifest: TempestApplicationManifest = {
      ...validation.value,
      manifestPath,
      icon: resolveManifestPath(validation.value.icon, manifestDirectory),
      launch: validation.value.launch ? {
        ...validation.value.launch,
        executable: resolveManifestPath(validation.value.launch.executable, manifestDirectory) as string,
        workingDirectory: resolveManifestPath(validation.value.launch.workingDirectory, manifestDirectory)
      } : undefined
    };
    return manifest;
  });

  ipcMain.handle('studio:select-asset', async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined as never, {
      title: 'Add Asset to Tempest Library',
      properties: ['openFile'],
      filters: [{ name: 'All assets', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = result.filePaths[0];
    const bytes = await readFile(filePath);
    const details = await stat(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'asset';
    return {
      path: filePath,
      uri: pathToFileURL(filePath).href,
      name: baseName,
      suggestedId: `com.tempestmainframe.asset.${slug}`,
      checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      size: details.size,
      extension: path.extname(filePath).toLowerCase()
    };
  });

  ipcMain.handle('studio:select-sound-alert-audio', async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined as never, {
      title: 'Assign Sound Alert Audio',
      properties: ['openFile'],
      filters: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = path.normalize(result.filePaths[0]);
    const details = await stat(filePath);
    if (!details.isFile()) throw new Error('The selected Sound Alert audio is not a file.');
    return { path: filePath, uri: pathToFileURL(filePath).href, name: path.basename(filePath), size: details.size };
  });

  ipcMain.handle('studio:select-sound-alert-visual', async () => {
    const result = await dialog.showOpenDialog(mainWindow || undefined as never, {
      title: 'Assign Sound Alert Visual',
      properties: ['openFile'],
      filters: [
        { name: 'Visual alerts', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'mp4', 'webm'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const filePath = path.normalize(result.filePaths[0]);
    const details = await stat(filePath);
    if (!details.isFile()) throw new Error('The selected Sound Alert visual is not a file.');
    return { path: filePath, uri: pathToFileURL(filePath).href, name: path.basename(filePath), size: details.size };
  });

  ipcMain.handle('studio:get-giphy-status', async () => ({ configured: Boolean(await loadGiphyApiKey()), encryptionAvailable: safeStorage.isEncryptionAvailable() }));

  ipcMain.handle('studio:save-giphy-api-key', async (_event, apiKey: unknown) => {
    await saveGiphyApiKey(apiKey);
    return { configured: true, encryptionAvailable: true };
  });

  ipcMain.handle('studio:search-giphy', async (_event, query: unknown) => {
    const apiKey = await loadGiphyApiKey();
    if (!apiKey) throw new Error('Add a GIPHY API key before searching.');
    const search = String(query || '').trim();
    if (!search || search.length > 50) throw new Error('GIPHY searches must contain 1 to 50 characters.');
    const url = new URL('https://api.giphy.com/v1/gifs/search');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('q', search);
    url.searchParams.set('limit', '12');
    url.searchParams.set('rating', 'pg-13');
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`GIPHY search returned HTTP ${response.status}.`);
    const body = await response.json() as { data?: Array<{ id?: string; title?: string; images?: Record<string, { url?: string }> }> };
    return {
      results: (body.data || []).flatMap((entry) => {
        const previewUrl = entry.images?.fixed_width_small?.url || entry.images?.fixed_width?.url;
        const mediaUrl = entry.images?.original?.url;
        return entry.id && previewUrl && mediaUrl ? [{ id: entry.id, title: entry.title || 'GIPHY GIF', previewUrl, mediaUrl }] : [];
      })
    };
  });

  ipcMain.handle('studio:import-giphy-visual', async (_event, input: { id?: unknown; mediaUrl?: unknown }) => {
    const id = String(input?.id || '').trim();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('The selected GIPHY result has an invalid identifier.');
    const mediaUrl = new URL(String(input?.mediaUrl || ''));
    if (mediaUrl.protocol !== 'https:' || !/^(?:media\d*|i)\.giphy\.com$/i.test(mediaUrl.hostname)) throw new Error('Only GIPHY-hosted media can be imported through this picker.');
    const response = await fetch(mediaUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GIPHY media download returned HTTP ${response.status}.`);
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== 'https:' || !/^(?:media\d*|i)\.giphy\.com$/i.test(finalUrl.hostname)) throw new Error('GIPHY redirected the media download to an unapproved host.');
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 25 * 1024 * 1024) throw new Error('The selected GIF exceeds the 25 MB local alert limit.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 25 * 1024 * 1024) throw new Error('The selected GIF exceeds the 25 MB local alert limit.');
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!['image/gif', 'image/webp', 'video/mp4'].includes(contentType || '')) throw new Error('GIPHY returned an unsupported media format.');
    const extension = contentType === 'image/webp' ? '.webp' : contentType === 'video/mp4' ? '.mp4' : '.gif';
    const directory = path.join(app.getPath('userData'), 'bridge', 'visual-alerts', 'giphy');
    await mkdir(directory, { recursive: true });
    const filePath = path.join(directory, `${id}${extension}`);
    await writeFile(filePath, bytes, { mode: 0o600 });
    return { path: filePath, uri: pathToFileURL(filePath).href, name: `GIPHY ${id}${extension}`, size: bytes.length };
  });

  ipcMain.handle('studio:launch-application', async (_event, input: unknown) => {
    const validation = validateApplicationManifest(input);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const launch = validation.value.launch;
    if (!launch) throw new Error(`${validation.value.name} has no launch configuration.`);
    const executable = path.normalize(launch.executable);
    const executableDetails = await stat(executable).catch(() => null);
    if (!executableDetails?.isFile()) throw new Error(`Application executable was not found: ${executable}`);
    const workingDirectory = launch.workingDirectory || path.dirname(executable);
    const child = spawn(executable, launch.args || [], {
      cwd: workingDirectory,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      shell: false
    });
    child.unref();
    return { launched: true, pid: child.pid };
  });

  ipcMain.handle('studio:reveal-path', async (_event, targetPath: string) => {
    const normalized = path.normalize(String(targetPath || ''));
    if (!normalized) throw new Error('No path was supplied.');
    shell.showItemInFolder(normalized);
    return true;
  });

  ipcMain.handle('studio:open-external', async (_event, targetUrl: string) => {
    const url = new URL(String(targetUrl || ''));
    const twitchLink = ['twitch.tv', 'www.twitch.tv', 'dev.twitch.tv'].includes(url.hostname);
    const stormHorizonPlayer = url.hostname === 'a12.asurahosting.com' && url.pathname === '/public/storm_horizon_radio';
    if (url.protocol !== 'https:' || (!twitchLink && !stormHorizonPlayer)) throw new Error('Only approved Twitch and Storm Horizon Radio HTTPS links may be opened from Studio.');
    await shell.openExternal(url.href);
    return true;
  });

  ipcMain.handle('studio:open-isolated-twitch-authorization', (_event, targetUrl: unknown) => openIsolatedTwitchAuthorization(targetUrl));
  ipcMain.handle('studio:close-isolated-twitch-authorization', () => closeIsolatedTwitchAuthorization());
}

app.whenReady().then(async () => {
  const bridgeDataDirectory = path.join(app.getPath('userData'), 'bridge');
  bridge = await startTempestBridge({
    host: '127.0.0.1',
    port: bridgePort,
    dataDirectory: bridgeDataDirectory,
    twitchCredentialStore: createTwitchCredentialStore(bridgeDataDirectory),
    chatbotCredentialStore: createTwitchCredentialStore(bridgeDataDirectory, 'chatbot-credentials.bin'),
    extensionRelay: extensionRelayOptionsFromEnvironment(),
    soundAlertPlayback(command: TempestSoundAlertPlaybackCommand) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('studio:sound-alert-playback', command);
    }
  });
  warudoAdapter = startWarudoAdapter({
    bridgeUrl: `${bridge.baseUrl.replace('http', 'ws')}/v1/socket`,
    bridgeToken: bridge.token,
    warudoUrl: process.env.TEMPEST_WARUDO_URL,
    // Packaged GUI launches do not have a durable stdout/stderr pipe on Windows.
    logger: { info() {}, warn() {}, error() {} }
  });
  registerDesktopHandlers();
  mainWindow = createWindow();

  if (process.argv.includes('--smoke-test')) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const ready = mainWindow ? await waitForRendererReady(mainWindow) : false;
      console.log(ready ? 'TEMPEST_STUDIO_SMOKE_OK' : 'TEMPEST_STUDIO_SMOKE_FAILED');
      app.exit(ready ? 0 : 1);
    });
  } else if (captureArgument) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const ready = mainWindow ? await waitForRendererReady(mainWindow) : false;
      if (!ready || !mainWindow) throw new Error('Studio renderer did not become ready for capture.');
      if (captureOverlay && bridge) {
        await mainWindow.loadURL(`${bridge.baseUrl}/visual-alerts`);
        for (let attempt = 0; attempt < 30; attempt += 1) {
          const status = await fetch(`${bridge.baseUrl}/v1/visual-alerts`, { headers: { 'X-Tempest-Token': bridge.token } }).then((response) => response.json()) as { connectedClients?: number };
          if ((status.connectedClients || 0) > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const previewAlertId = capturePreviewArgument?.slice('--capture-preview='.length);
        if (previewAlertId && /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(previewAlertId)) {
          await fetch(`${bridge.baseUrl}/v1/visual-alerts/twitch/${encodeURIComponent(previewAlertId)}/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tempest-Token': bridge.token },
            body: '{}'
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const captureSection = captureSectionArgument?.slice('--capture-section='.length);
      if (captureSection && /^[a-z]+$/.test(captureSection)) {
        await mainWindow.webContents.executeJavaScript(`document.querySelector('[data-section="${captureSection}"]')?.click()`);
      }
      const captureTarget = captureTargetArgument?.slice('--capture-target='.length);
      if (captureTarget && /^[A-Za-z][A-Za-z0-9_-]*$/.test(captureTarget)) {
        await mainWindow.webContents.executeJavaScript(`document.getElementById('${captureTarget}')?.scrollIntoView({ block: 'center' })`);
      }
      const captureDialog = captureDialogArgument?.slice('--capture-dialog='.length);
      if (captureDialog && /^[A-Za-z][A-Za-z0-9_-]*$/.test(captureDialog)) {
        await mainWindow.webContents.executeJavaScript(captureDialog === 'twitchDesignDialog'
          ? `document.querySelector('[data-twitch-alert-design]')?.click()`
          : `document.getElementById('${captureDialog}')?.showModal()`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const outputPath = path.resolve(captureArgument.slice('--capture-ui='.length));
      await mkdir(path.dirname(outputPath), { recursive: true });
      const image = await mainWindow.webContents.capturePage();
      await writeFile(outputPath, image.toPNG());
      console.log(`TEMPEST_STUDIO_CAPTURED ${outputPath}`);
      app.exit(0);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
}).catch((error) => {
  dialog.showErrorBox(`${productName} could not start`, error.message);
  app.exit(1);
});

app.on('before-quit', () => {
  if (localExtension) {
    const activeExtension = localExtension;
    localExtension = null;
    void activeExtension.close().catch(() => {});
  }
  if (warudoAdapter) {
    const activeAdapter = warudoAdapter;
    warudoAdapter = null;
    void activeAdapter.close().catch(() => {});
  }
  if (bridge) {
    const activeBridge = bridge;
    bridge = null;
    void activeBridge.close().catch(() => {});
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
