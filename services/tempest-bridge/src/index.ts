import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { fileURLToPath, URL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  TEMPEST_PROTOCOL_VERSION,
  TEMPEST_STUDIO_VERSION,
  TempestBridgeHealth,
  TempestBridgeMessage,
  TempestBroadcastStatus,
  TempestInteractionRequest,
  TempestNormalizedChatEvent,
  TempestNormalizedTwitchEvent,
  TempestSoundAlertPlaybackCommand,
  TempestSoundAlertTriggerRequest,
  TempestTwitchVisualAlertDefinition,
  createBridgeMessage,
  validateBridgeMessage,
  validateDualFormatConfigureRequest,
  validateSimulcastConfigureRequest,
  validateSimulcastStartRequest,
  validateSimulcastStopRequest
} from '@tempest/contracts';
import { TempestRegistry } from './registry';
import { blackHoleWorkflow, soundAlertPerformanceWorkflow, twitchAlertReactionWorkflow, TempestWorkflowEngine } from './workflow-engine';
import { TwitchIntegrationGateway, type TwitchCredentialStore } from './twitch-integration';
import { TempestSoundAlertCatalog } from './sound-alerts';
import { TempestVisualAlertOverlay } from './visual-alerts';
import { TempestTwitchVisualAlertCatalog, resolveTwitchAlertDesignForScene, validateTwitchAlertDesign } from './twitch-visual-alerts';
export { TempestTwitchVisualAlertCatalog, resolveTwitchAlertDesignForScene, validateTwitchAlertDesign } from './twitch-visual-alerts';
import { TempestChatOverlay } from './chat-overlay';
import { TempestEmoteWall } from './emote-wall';
import { TempestTwitchExperiences } from './twitch-experiences';
import { TempestDiscordVoiceOverlay } from './discord-voice-overlay';
import { TempestAlertQueue, TempestAlertQueueItem } from './alert-queue';
import { TempestAlertHistory } from './alert-history';
import {
  ExtensionRelayOptions,
  ExtensionRelayStatus,
  TempestExtensionRelayClient
} from './extension-relay';
import { ChatbotDispatch, TwitchChatbot } from './chatbot';
import { KickIntegrationGateway, type KickCredentialStore } from './kick-integration';

export type { TwitchCredentialStore, TwitchTokenSet } from './twitch-integration';
export type { KickCredentialSet, KickCredentialStore, KickIntegrationStatus } from './kick-integration';
export { KickIntegrationGateway } from './kick-integration';
export type { ChatbotCommand, ChatbotStatus } from './chatbot';
export {
  extensionRelayOptionsFromEnvironment,
  TempestExtensionRelayClient
} from './extension-relay';
export type { ExtensionRelayOptions, ExtensionRelayResult, ExtensionRelayStatus } from './extension-relay';

export interface StartBridgeOptions {
  host?: string;
  port?: number;
  dataDirectory: string;
  token?: string;
  twitchCredentialStore?: TwitchCredentialStore;
  chatbotCredentialStore?: TwitchCredentialStore;
  kickCredentialStore?: KickCredentialStore;
  chatbotFetchImplementation?: typeof fetch;
  emoteProviderFetchImplementation?: typeof fetch;
  kickFetchImplementation?: typeof fetch;
  kickWebhookUrl?: string;
  extensionRelay?: ExtensionRelayOptions;
  soundAlertPlayback?: (command: TempestSoundAlertPlaybackCommand) => void | Promise<void>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface TempestBridgeRuntime {
  host: string;
  port: number;
  baseUrl: string;
  token: string;
  dataDirectory: string;
  configureExtensionRelay(options?: ExtensionRelayOptions): Promise<void>;
  close(): Promise<void>;
}

interface BridgeClient {
  id: string;
  applicationId: string;
  version?: string;
  capabilities: string[];
  status?: Record<string, unknown>;
  statusReportedAt?: string;
  connectedAt: string;
  lastSeenAt: string;
  subscriptions: Set<string>;
  socket: WebSocket;
}

const maximumBodyBytes = 2 * 1024 * 1024;
const broadcastApplicationId = 'com.tempestmainframe.tempest-broadcast';
const dualFormatConfigureCapability = 'broadcast.dual-format.configure';
const dualFormatPreviewCapability = 'broadcast.dual-format.preview';
const simulcastConfigureCapability = 'broadcast.simulcast.configure';
const simulcastPreflightCapability = 'broadcast.simulcast.preflight';
const simulcastStartCapability = 'broadcast.simulcast.start';
const simulcastStopCapability = 'broadcast.simulcast.stop';
const simulcastRetryKickCapability = 'broadcast.simulcast.retry-kick';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function dualFormatSnapshot(connection?: BridgeClient): Record<string, unknown> {
  const broadcastStatus = (connection?.status || {}) as TempestBroadcastStatus;
  const reported = isRecord(broadcastStatus.dualFormat) ? broadcastStatus.dualFormat : undefined;
  const canvas = reported && isRecord(reported.canvas) ? reported.canvas : undefined;
  const width = Number(canvas?.outputWidth || canvas?.baseWidth || 0);
  const height = Number(canvas?.outputHeight || canvas?.baseHeight || 0);
  const verticalCanvasReady = (width === 1080 && height === 1920) || (width === 720 && height === 1280);
  const connected = Boolean(connection);
  const controllerSupported = Boolean(connection?.capabilities.includes(dualFormatConfigureCapability)) && reported?.supported !== false;
  const previewSupported = Boolean(connection?.capabilities.includes(dualFormatPreviewCapability)) && reported?.previewAvailable !== false;
  const statusReported = Boolean(reported);
  const enhancedBroadcastingEnabled = reported?.enhancedBroadcastingEnabled === true;
  const enabled = reported?.enabled === true;
  const additionalCanvasSelected = reported?.additionalCanvasSelected === true;
  const sceneLinksReady = reported?.sceneLinksReady === true;
  const audioReady = reported?.audioReady === true;
  const browserSourcesReady = reported?.browserSourcesReady === true;
  const ready = connected && controllerSupported && statusReported && enabled && enhancedBroadcastingEnabled
    && verticalCanvasReady && additionalCanvasSelected && sceneLinksReady && audioReady && browserSourcesReady;
  const streaming = broadcastStatus.streaming === true;
  const lastError = typeof reported?.lastError === 'string' ? reported.lastError.slice(0, 400) : undefined;
  const state = !connected ? 'broadcast-offline'
    : !controllerSupported || !statusReported ? 'update-required'
      : lastError ? 'error'
        : ready && streaming ? 'live'
          : ready ? 'ready' : 'setup-required';
  return {
    state,
    connected,
    controllerSupported,
    previewSupported,
    statusReported,
    ready,
    streaming,
    recording: broadcastStatus.recording === true,
    enabled,
    enhancedBroadcastingEnabled,
    additionalCanvasSelected,
    sceneLinksReady,
    audioReady,
    browserSourcesReady,
    canvas: canvas ? {
      id: typeof canvas.id === 'string' ? canvas.id : '',
      name: typeof canvas.name === 'string' ? canvas.name : 'Vertical canvas',
      baseWidth: Number(canvas.baseWidth || 0),
      baseHeight: Number(canvas.baseHeight || 0),
      outputWidth: width,
      outputHeight: height,
      fpsNumerator: Number(canvas.fpsNumerator || 0),
      fpsDenominator: Number(canvas.fpsDenominator || 1)
    } : undefined,
    lastError,
    requirements: { enhancedBroadcasting: true, recommendedCanvas: { width: 1080, height: 1920 }, supportedPresets: ['1080x1920', '720x1280'] },
    checks: [
      { id: 'broadcast', label: 'Tempest Broadcast connected', ready: connected },
      { id: 'controller', label: 'Dual Format controller available', ready: controllerSupported && statusReported },
      { id: 'enhanced-broadcasting', label: 'Enhanced Broadcasting enabled', ready: enhancedBroadcastingEnabled },
      { id: 'vertical-canvas', label: 'Supported 9:16 canvas selected', ready: verticalCanvasReady && additionalCanvasSelected },
      { id: 'scene-links', label: 'Horizontal and vertical scenes linked', ready: sceneLinksReady },
      { id: 'audio', label: 'Program audio routed to both formats', ready: audioReady },
      { id: 'browser-sources', label: 'Vertical alert sources installed', ready: browserSourcesReady }
    ]
  };
}

function simulcastSnapshot(connection?: BridgeClient): Record<string, unknown> {
  const broadcastStatus = (connection?.status || {}) as TempestBroadcastStatus;
  const reported = isRecord(broadcastStatus.simulcast) ? broadcastStatus.simulcast : undefined;
  const twitch: Record<string, unknown> = reported && isRecord(reported.twitch) ? reported.twitch : {};
  const kick: Record<string, unknown> = reported && isRecord(reported.kick) ? reported.kick : {};
  const connected = Boolean(connection);
  const controllerSupported = Boolean(connection?.capabilities.includes(simulcastConfigureCapability)
    && connection?.capabilities.includes(simulcastPreflightCapability)
    && connection?.capabilities.includes(simulcastStartCapability)
    && connection?.capabilities.includes(simulcastStopCapability)
    && connection?.capabilities.includes(simulcastRetryKickCapability)) && reported?.supported !== false;
  const configured = reported?.configured === true;
  const enabled = reported?.enabled === true;
  const credentialsStored = reported?.credentialsStored === true;
  const twitchServiceReady = reported?.twitchServiceReady === true;
  const dualFormatReady = reported?.dualFormatReady === true;
  const kickServerConfigured = reported?.kickServerConfigured === true;
  const secureStorageAvailable = reported?.secureStorageAvailable === true;
  const uploadCapacityConfigured = reported?.uploadCapacityConfigured === true;
  const uploadHeadroomReady = reported?.uploadHeadroomReady !== false;
  const lastPreflightAt = typeof reported?.lastPreflightAt === 'string' ? reported.lastPreflightAt : undefined;
  const lastPreflightTime = lastPreflightAt ? Date.parse(lastPreflightAt) : Number.NaN;
  const preflightAge = Date.now() - lastPreflightTime;
  const preflightReady = reported?.lastPreflightPassed === true && Number.isFinite(lastPreflightTime)
    && preflightAge >= 0 && preflightAge <= 4 * 60 * 60 * 1000;
  const ready = connected && controllerSupported && configured && enabled && credentialsStored
    && twitchServiceReady && dualFormatReady && kickServerConfigured && secureStorageAvailable
    && uploadCapacityConfigured && uploadHeadroomReady && preflightReady;
  const twitchActive = twitch.active === true;
  const kickActive = kick.active === true;
  const lastError = typeof reported?.lastError === 'string' ? reported.lastError.slice(0, 400) : undefined;
  const state = !connected ? 'broadcast-offline'
    : !controllerSupported || !reported ? 'update-required'
      : lastError && !twitchActive && !kickActive ? 'error'
        : twitchActive && kickActive ? 'live'
          : twitchActive || kickActive ? 'degraded-live'
            : ready ? 'ready' : 'setup-required';
  return {
    state,
    connected,
    controllerSupported,
    statusReported: Boolean(reported),
    statusReportedAt: connection?.statusReportedAt,
    ready,
    enabled,
    configured,
    credentialsStored,
    secureStorageAvailable,
    kickServerConfigured,
    twitchServiceReady,
    dualFormatReady,
    sharedEncoder: reported?.sharedEncoder === true,
    uploadCapacityConfigured,
    uploadCapacityKbps: Number(reported?.uploadCapacityKbps || 0),
    estimatedRequiredKbps: Number(reported?.estimatedRequiredKbps || 0),
    uploadHeadroomReady,
    recordingWithStream: reported?.recordingWithStream === true,
    lastPreflightAt,
    lastPreflightPassed: reported?.lastPreflightPassed === true,
    preflightReady,
    ...(typeof reported?.lastPreflightError === 'string' ? { lastPreflightError: reported.lastPreflightError.slice(0, 400) } : {}),
    recording: broadcastStatus.recording === true,
    twitch: {
      state: typeof twitch.state === 'string' ? twitch.state : twitchActive ? 'live' : 'offline',
      active: twitchActive,
      bytesSent: Number(twitch.bytesSent || 0),
      droppedFrames: Number(twitch.droppedFrames || 0),
      totalFrames: Number(twitch.totalFrames || 0),
      congestion: Number(twitch.congestion || 0),
      ...(typeof twitch.lastError === 'string' ? { lastError: twitch.lastError.slice(0, 400) } : {})
    },
    kick: {
      state: typeof kick.state === 'string' ? kick.state : kickActive ? 'live' : 'offline',
      active: kickActive,
      bytesSent: Number(kick.bytesSent || 0),
      droppedFrames: Number(kick.droppedFrames || 0),
      totalFrames: Number(kick.totalFrames || 0),
      congestion: Number(kick.congestion || 0),
      ...(typeof kick.lastError === 'string' ? { lastError: kick.lastError.slice(0, 400) } : {})
    },
    lastError,
    checks: [
      { id: 'broadcast', label: 'Tempest Broadcast connected', ready: connected },
      { id: 'controller', label: 'Production simulcast controller available', ready: controllerSupported && Boolean(reported) },
      { id: 'twitch', label: 'Twitch output service ready', ready: twitchServiceReady },
      { id: 'dual-format', label: 'Twitch horizontal + vertical ready', ready: dualFormatReady },
      { id: 'kick-server', label: 'Kick ingest server configured', ready: kickServerConfigured },
      { id: 'kick-key', label: 'Kick stream key stored securely', ready: credentialsStored && secureStorageAvailable },
      { id: 'upload', label: 'Upload budget has production headroom', ready: uploadCapacityConfigured && uploadHeadroomReady },
      { id: 'preflight', label: 'Local production preflight passed', ready: preflightReady }
    ]
  };
}

async function loadOrCreateToken(dataDirectory: string, supplied?: string): Promise<string> {
  if (supplied?.trim()) return supplied.trim();
  await mkdir(dataDirectory, { recursive: true });
  const tokenPath = path.join(dataDirectory, 'bridge-token');
  try {
    const existing = (await readFile(tokenPath, 'utf8')).trim();
    if (existing.length >= 32) return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const token = randomBytes(32).toString('hex');
  await writeFile(tokenPath, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
  return token;
}

function setCommonHeaders(response: ServerResponse): void {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Access-Control-Allow-Origin', 'null');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Tempest-Token, Authorization');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response: ServerResponse, statusCode: number, data: unknown): void {
  setCommonHeaders(response);
  response.statusCode = statusCode;
  response.end(JSON.stringify(data));
}

function sendOAuthPage(response: ServerResponse, statusCode: number, title: string, message: string): void {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(`<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title><style>body{margin:0;display:grid;min-height:100vh;place-items:center;color:#dff;background:#070d13;font:16px Segoe UI,sans-serif}main{max-width:560px;padding:32px;border:1px solid #24505a;border-radius:12px;background:#0a151d}h1{color:#54f2eb}p{line-height:1.55}</style></head><body><main><h1>${escape(title)}</h1><p>${escape(message)}</p><p>You may close this browser tab and return to Tempest Streaming Studio.</p></main></body></html>`);
}

function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress || '';
  return address === '::1' || address === '127.0.0.1' || address.startsWith('::ffff:127.');
}

const visualMediaTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm'
};
const audioMediaTypes: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.flac': 'audio/flac'
};

function requestToken(request: IncomingMessage, requestUrl: URL): string {
  const authorization = request.headers.authorization || '';
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  return String(request.headers['x-tempest-token'] || requestUrl.searchParams.get('token') || '');
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumBodyBytes) throw new Error('Request body exceeds the 2 MB limit.');
    chunks.push(bytes);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function topicMatches(subscription: string, topic: string): boolean {
  if (subscription === '*') return true;
  if (subscription.endsWith('.*')) return topic.startsWith(subscription.slice(0, -1));
  return subscription === topic;
}

function sendSocket(socket: WebSocket, message: TempestBridgeMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export async function startTempestBridge(options: StartBridgeOptions): Promise<TempestBridgeRuntime> {
  const host = options.host || '127.0.0.1';
  const requestedPort = options.port ?? 4765;
  const logger = options.logger || console;
  const token = await loadOrCreateToken(options.dataDirectory, options.token);
  const registry = new TempestRegistry(options.dataDirectory);
  await registry.initialize();
  for (const bundledWorkflow of [blackHoleWorkflow, soundAlertPerformanceWorkflow, twitchAlertReactionWorkflow]) {
    const installedWorkflow = registry.listWorkflows().find((workflow) => workflow.id === bundledWorkflow.id);
    await registry.registerWorkflow({ ...bundledWorkflow, enabled: installedWorkflow?.enabled ?? bundledWorkflow.enabled });
  }
  const startedAt = new Date().toISOString();
  const clients = new Map<string, BridgeClient>();
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: maximumBodyBytes });
  let ingestChatEvent: (event: TempestNormalizedChatEvent) => Promise<void> = async () => {};
  const twitchGateway = new TwitchIntegrationGateway({ dataDirectory: options.dataDirectory, credentialStore: options.twitchCredentialStore, onEvent: (event) => ingestChatEvent(event) });
  await twitchGateway.initialize();
  const connectedBroadcast = (): BridgeClient | undefined => [...clients.values()].find((client) => client.applicationId === broadcastApplicationId);
  const sendBroadcastCommand = (client: BridgeClient, topic: string, commandArguments: Record<string, unknown>): string => {
    const message = createBridgeMessage({
      kind: 'command',
      source: 'tempest.studio',
      target: broadcastApplicationId,
      topic,
      payload: { requestedBy: 'studio.operator', arguments: commandArguments }
    });
    sendSocket(client.socket, message);
    return message.id;
  };
  let dispatchChatCommand: (dispatch: ChatbotDispatch) => Promise<void> = async () => {};
  let kickGateway!: KickIntegrationGateway;
  const chatbot = new TwitchChatbot({
    dataDirectory: options.dataDirectory,
    credentialStore: options.chatbotCredentialStore,
    fetchImplementation: options.chatbotFetchImplementation,
    onEvent: (event) => ingestChatEvent(event),
    onCommand: (dispatch) => dispatchChatCommand(dispatch),
    sendPlatformMessage: async (_platform, message, replyParentMessageId) => { await kickGateway.postMessage({ message, replyToMessageId: replyParentMessageId }); },
    onConnectionState(eventSub, chat) { twitchGateway.setChatConnectionState(eventSub, chat); }
  });
  await chatbot.initialize(twitchGateway.status().clientId || '');
  kickGateway = new KickIntegrationGateway({
    dataDirectory: options.dataDirectory,
    defaultRedirectUri: `http://localhost:${requestedPort || 4765}/v1/integrations/kick/oauth/callback`,
    webhookUrl: options.kickWebhookUrl,
    credentialStore: options.kickCredentialStore,
    fetchImplementation: options.kickFetchImplementation,
    onChatEvent: async (event) => { await chatbot.processChatEvent(event); }
  });
  await kickGateway.initialize();
  const soundAlerts = new TempestSoundAlertCatalog(options.dataDirectory);
  await soundAlerts.initialize();
  const visualAlerts = new TempestVisualAlertOverlay();
  const twitchAlertOverlay = new TempestVisualAlertOverlay();
  const twitchVisualAlerts = new TempestTwitchVisualAlertCatalog(options.dataDirectory);
  await twitchVisualAlerts.initialize();
  const alertHistory = new TempestAlertHistory(options.dataDirectory);
  await alertHistory.initialize();
  const chatOverlay = new TempestChatOverlay(options.dataDirectory);
  await chatOverlay.initialize();
  const emoteWall = new TempestEmoteWall(options.dataDirectory, options.emoteProviderFetchImplementation);
  await emoteWall.initialize();
  const twitchExperiences = new TempestTwitchExperiences(options.dataDirectory);
  await twitchExperiences.initialize();
  const discordVoiceOverlay = new TempestDiscordVoiceOverlay(options.dataDirectory);
  await discordVoiceOverlay.initialize();
  let alertQueue: TempestAlertQueue | undefined;
  let extensionRelay: TempestExtensionRelayClient | null = null;
  let runtime!: TempestBridgeRuntime;

  let workflowEngine: TempestWorkflowEngine | null = null;

  const activeBroadcastScene = (): string | undefined => {
    const broadcast = [...clients.values()].find((client) => client.applicationId === 'com.tempestmainframe.tempest-broadcast' || client.capabilities.includes('broadcast.status'));
    const inventory = broadcast?.status?.sourceInventory;
    if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) return undefined;
    const sceneName = (inventory as Record<string, unknown>).currentScene;
    return typeof sceneName === 'string' && sceneName.trim() ? sceneName.trim().slice(0, 120) : undefined;
  };

  const health = (): TempestBridgeHealth => ({
    service: 'tempest-bridge',
    productVersion: TEMPEST_STUDIO_VERSION,
    status: 'online',
    protocolVersion: TEMPEST_PROTOCOL_VERSION,
    startedAt,
    applications: registry.listApplications().length,
    assets: registry.listAssets().length,
    connections: clients.size,
    workflows: registry.listWorkflows().length,
    activeRuns: workflowEngine?.safetyState().activeRuns || 0,
    safetyArmed: workflowEngine?.safetyState().armed ?? true
  });

  const visualAlertOutputStatus = () => {
    const interaction = visualAlerts.status(`${runtime.baseUrl}/visual-alerts/interactions`);
    const twitch = twitchAlertOverlay.status(`${runtime.baseUrl}/visual-alerts/twitch`);
    return {
      state: interaction.state === 'showing' || twitch.state === 'showing' ? 'showing' : 'ready',
      connectedClients: interaction.connectedClients + twitch.connectedClients,
      interaction,
      twitch,
      vertical: {
        twitchUrl: `${runtime.baseUrl}/visual-alerts/twitch?orientation=vertical`,
        interactionUrl: `${runtime.baseUrl}/visual-alerts/interactions?orientation=vertical`,
        orientation: 'vertical',
        audio: 'muted'
      },
      ...(alertQueue ? { queue: alertQueue.status() } : {})
    };
  };

  const alertDiagnostics = async () => {
    const interactionAlerts = soundAlerts.list();
    const twitchAlerts = twitchVisualAlerts.list();
    const assets: Array<{ kind: 'interaction' | 'twitch'; alertId: string; alertName: string; variantId?: string; role: 'audio' | 'visual'; uri: string }> = [];
    for (const alert of interactionAlerts) {
      if (alert.audioUri) assets.push({ kind: 'interaction', alertId: alert.id, alertName: alert.name, role: 'audio', uri: alert.audioUri });
      if (alert.visualUri) assets.push({ kind: 'interaction', alertId: alert.id, alertName: alert.name, role: 'visual', uri: alert.visualUri });
    }
    for (const alert of twitchAlerts) {
      if (alert.audioUri) assets.push({ kind: 'twitch', alertId: alert.id, alertName: alert.name, role: 'audio', uri: alert.audioUri });
      if (alert.visualUri) assets.push({ kind: 'twitch', alertId: alert.id, alertName: alert.name, role: 'visual', uri: alert.visualUri });
      for (const variant of alert.alertVariants || []) {
        if (variant.audioUri) assets.push({ kind: 'twitch', alertId: alert.id, alertName: alert.name, variantId: variant.id, role: 'audio', uri: variant.audioUri });
        if (variant.visualUri) assets.push({ kind: 'twitch', alertId: alert.id, alertName: alert.name, variantId: variant.id, role: 'visual', uri: variant.visualUri });
      }
    }
    const issues: Array<{ severity: 'error'; kind: 'interaction' | 'twitch'; alertId: string; alertName: string; variantId?: string; role: 'audio' | 'visual'; message: string }> = [];
    await Promise.all(assets.map(async (asset) => {
      try {
        const details = await stat(fileURLToPath(asset.uri));
        if (!details.isFile()) throw new Error('not a file');
      } catch {
        issues.push({ severity: 'error', kind: asset.kind, alertId: asset.alertId, alertName: asset.alertName, ...(asset.variantId ? { variantId: asset.variantId } : {}), role: asset.role, message: `${asset.role === 'audio' ? 'Sound' : 'Visual'} file is unavailable.` });
      }
    }));
    const output = visualAlertOutputStatus();
    return {
      generatedAt: new Date().toISOString(),
      history: alertHistory.summary(),
      configured: { interactionAlerts: interactionAlerts.length, twitchAlerts: twitchAlerts.length, variants: twitchAlerts.reduce((sum, alert) => sum + (alert.alertVariants?.length || 0), 0), assignedAssets: assets.length, unavailableAssets: issues.length },
      sources: { interactionClients: output.interaction.connectedClients, twitchClients: output.twitch.connectedClients },
      queue: alertQueue?.status(),
      issues
    };
  };

  const broadcastSystemEvent = (topic: string, payload: unknown, excludedClientId = ''): void => {
    const message = createBridgeMessage({ kind: 'event', source: 'tempest.bridge', topic, payload });
    for (const client of clients.values()) {
      if (client.id !== excludedClientId && [...client.subscriptions].some((entry) => topicMatches(entry, topic))) {
        sendSocket(client.socket, message);
      }
    }
  };

  workflowEngine = new TempestWorkflowEngine(async ({ runId, workflowId, action, phase, simulateMissing }) => {
    const capability = phase === 'release' ? action.releaseCapability || action.capability : action.capability;
    const manifest = registry.listApplications().find((entry) => entry.id === action.target);
    const recipients = [...clients.values()].filter((client) => client.applicationId === action.target);
    if (!recipients.length) return { delivery: simulateMissing ? 'simulated' : 'unavailable' };
    const advertised = recipients.some((client) => client.capabilities.includes(capability));
    const clientsAdvertiseCapabilities = recipients.some((client) => client.capabilities.length > 0);
    const declared = manifest?.capabilities.provides.includes(capability) ?? false;
    if (!advertised && (clientsAdvertiseCapabilities || (manifest && !declared))) return { delivery: 'unavailable' };
    const message = createBridgeMessage({
      kind: 'command',
      source: 'tempest.workflow',
      target: action.target,
      topic: capability,
      correlationId: runId,
      payload: {
        workflowId,
        runId,
        actionId: action.id,
        phase,
        arguments: action.arguments || {},
        lease: action.lease
      }
    });
    recipients.forEach((client) => sendSocket(client.socket, message));
    return { delivery: 'connected' };
  });
  workflowEngine.setWorkflows(registry.listWorkflows());
  alertQueue = new TempestAlertQueue({
    maximumWaiting: 25,
    transitionGapMs: 500,
    onChange(status) { broadcastSystemEvent('alert-queue.updated', status); },
    onError(item, error) {
      alertHistory.failed(item, error);
      workflowEngine!.recordExternalEvent('alert-queue.item.failed', 'error', `${item.name} could not start from the Alert Queue: ${error.message}`, { queueItem: item });
    },
    onStarted(item) { alertHistory.started(item); },
    onCompleted(item) { alertHistory.completed(item); },
    onCleared(items) { alertHistory.cancelled(items); }
  });

  const triggerTwitchAlertReaction = async (
    alert: TempestTwitchVisualAlertDefinition,
    event: TempestNormalizedTwitchEvent,
    source: string
  ) => {
    const run = await workflowEngine!.trigger(twitchAlertReactionWorkflow.id, {
      source,
      eventId: `${event.id}:twitch-alert-reaction`,
      viewerId: event.viewer?.id,
      viewerName: event.viewer?.displayName || event.viewer?.login,
      payload: {
        alertId: alert.id,
        reactionId: alert.id,
        name: alert.name,
        eventType: 'twitch-alert',
        durationMs: alert.durationMs,
        circuit: 'alerts',
        accent: alert.accent,
        effect: 'spectrum',
        strength: 1,
        dedupeId: event.id,
        preview: source === 'studio.simulator'
      },
      simulateMissing: source === 'studio.simulator',
      bypassCooldown: source === 'studio.simulator'
    });
    broadcastSystemEvent('workflow.started', run);
    return run;
  };

  const queueTwitchAlert = async (alert: TempestTwitchVisualAlertDefinition, event: TempestNormalizedTwitchEvent, source: string) => {
    const accepted = await alertQueue!.enqueue({
      kind: 'twitch',
      alertId: alert.id,
      name: alert.name,
      source,
      durationMs: alert.durationMs,
      diagnostics: {
        viewerName: event.topic === 'viewer.raid.received' ? String(event.payload.fromBroadcasterName || 'A raider') : event.viewer?.displayName || event.viewer?.login,
        variantId: alert.selectedVariantId,
        variantName: alert.selectedVariantName,
        audioAssigned: Boolean(alert.audioUri),
        visualAssigned: Boolean(alert.visualUri),
        audioRoute: alert.audioUri ? 'browser-source' : 'none',
        browserClients: twitchAlertOverlay.status('').connectedClients,
        preview: source === 'studio.simulator'
      },
      execute: async () => {
        const reactionRun = await triggerTwitchAlertReaction(alert, event, source);
        const sceneName = activeBroadcastScene();
        const activeAlert = twitchAlertOverlay.showTwitch(alert, event, event.id, resolveTwitchAlertDesignForScene(alert.design, sceneName), false, sceneName);
        return { reactionRun, activeAlert };
      }
    });
    return {
      queued: accepted.queued,
      queuePosition: accepted.position,
      queueItem: accepted.item,
      ...(accepted.result || {})
    };
  };

  ingestChatEvent = async (event) => {
    if (event.source === 'twitch') {
      const ingestion = twitchGateway.ingest(event);
      if (ingestion.duplicate) {
        workflowEngine!.recordExternalEvent('integration.event.duplicate', 'info', `Duplicate Twitch event ${event.id} was ignored.`, { eventId: event.id, topic: event.topic });
        return;
      }
    }
    workflowEngine!.recordExternalEvent(event.topic, 'info', `${event.topic} received from ${event.source === 'kick' ? 'Kick' : 'Twitch'}.`, { event });
    broadcastSystemEvent(event.topic, event);
    chatOverlay.push(event);
    if (event.source === 'twitch' && event.topic === 'viewer.raid.received') {
      const raidAutomation = await chatbot.processRaidEvent(event);
      workflowEngine!.recordExternalEvent('chatbot.raid-automation', raidAutomation.error ? 'warning' : 'success', raidAutomation.error || `Raid automation handled ${event.payload.fromBroadcasterName}.`, { raidAutomation });
    }
    if (event.source === 'twitch') {
      emoteWall.push(event);
      twitchExperiences.ingest(event);
      const twitchVisual = twitchVisualAlerts.findForEvent(event);
      if (twitchVisual?.enabled) await queueTwitchAlert(twitchVisual, event, 'twitch.chat');
    }
  };

  dispatchChatCommand = async ({ command, event, arguments: commandArguments, simulated }) => {
    if (!command.workflowId) return;
    const workflow = registry.listWorkflows().find((entry) => entry.id === command.workflowId && entry.enabled);
    if (!workflow) throw new Error(`Workflow ${command.workflowId} is not available.`);
    const run = await workflowEngine!.trigger(workflow.id, {
      source: simulated ? 'studio.simulator' : event.source === 'kick' ? 'kick.chat' : 'twitch.chat',
      eventId: event.id,
      viewerId: event.viewer?.id,
      viewerName: event.viewer?.displayName || event.viewer?.login,
      payload: { ...event.payload, command: command.name, arguments: commandArguments, dedupeId: event.id },
      simulateMissing: simulated,
      bypassCooldown: simulated
    });
    broadcastSystemEvent('workflow.started', run);
  };

  const syncChatbotConnection = async (): Promise<void> => {
    const twitchStatus = twitchGateway.status();
    await chatbot.setClientId(twitchStatus.clientId || '');
    const authorization = twitchGateway.connectionAuthorization();
    await chatbot.connectChannel(authorization);
    await emoteWall.setChannel(authorization?.channelId || '');
  };

  const triggerSoundAlert = async (idOrCue: string, request: TempestSoundAlertTriggerRequest) => {
    const prepared = soundAlerts.prepare(idOrCue, request);
    if (!workflowEngine!.safetyState().armed) throw new Error('Viewer interactions are disarmed. Arm Studio before adding an Interaction Alert to the queue.');
    const accepted = await alertQueue!.enqueue({
      kind: 'interaction',
      alertId: prepared.alert.id,
      name: prepared.alert.name,
      source: request.source,
      durationMs: prepared.alert.durationMs,
      diagnostics: {
        viewerName: request.viewerName,
        audioAssigned: Boolean(prepared.alert.audioUri),
        visualAssigned: Boolean(prepared.alert.visualUri),
        audioRoute: !prepared.alert.audioUri ? 'none' : prepared.alert.broadcastAudioSource ? 'broadcast-source' : visualAlerts.status('').connectedClients ? 'browser-source' : options.soundAlertPlayback ? 'studio-local' : 'none',
        browserClients: visualAlerts.status('').connectedClients,
        preview: request.source === 'studio.operator'
      },
      onAccepted: () => soundAlerts.commit(prepared),
      execute: async () => {
        const run = await workflowEngine!.trigger(soundAlertPerformanceWorkflow.id, {
          source: request.source,
          eventId: prepared.eventId,
          viewerId: request.viewerId,
          viewerName: request.viewerName,
          payload: prepared.payload,
          simulateMissing: request.simulateMissing,
          bypassCooldown: request.bypassCooldown
        });
        const sceneName = activeBroadcastScene();
        const activeVisualAlert = visualAlerts.show(prepared.alert, request.viewerName, run.id, true, resolveTwitchAlertDesignForScene(prepared.alert.design, sceneName), false, sceneName);
        workflowEngine!.recordExternalEvent('sound-alert.triggered', 'success', `${prepared.alert.name} started from the Alert Queue.`, {
          alertId: prepared.alert.id,
          eventId: prepared.eventId,
          runId: run.id,
          source: request.source,
          free: true
        });
        broadcastSystemEvent('sound-alert.triggered', { alert: prepared.alert, eventId: prepared.eventId, run });
        const browserSourceOwnsAudio = Boolean(activeVisualAlert.audioUrl && visualAlerts.hasClients());
        const separateBroadcastSourceOwnsAudio = Boolean(prepared.alert.broadcastAudioSource);
        if (options.soundAlertPlayback && !browserSourceOwnsAudio && !separateBroadcastSourceOwnsAudio) {
          Promise.resolve(options.soundAlertPlayback({ phase: 'play', runId: run.id, alert: prepared.alert })).catch((error) => {
            workflowEngine!.recordExternalEvent('sound-alert.audio.failed', 'error', `Local audio playback failed for ${prepared.alert.name}: ${(error as Error).message}`, {
              alertId: prepared.alert.id,
              runId: run.id
            });
          });
        }
        return { run, activeVisualAlert };
      }
    });
    return {
      alert: prepared.alert,
      eventId: prepared.eventId,
      queued: accepted.queued,
      queuePosition: accepted.position,
      queueItem: accepted.item,
      ...(accepted.result || {})
    };
  };

  const server = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${host}`);
    try {
      if (request.method === 'OPTIONS') {
        setCommonHeaders(response);
        response.statusCode = 204;
        return response.end();
      }
      if (request.method === 'GET' && requestUrl.pathname === '/health') return sendJson(response, 200, health());
      if (request.method === 'GET' && requestUrl.pathname === '/v1/integrations/kick/oauth/callback') {
        if (!isLoopbackRequest(request)) return sendOAuthPage(response, 403, 'Kick connection blocked', 'This OAuth callback is accepted only on the computer running Studio.');
        try {
          await kickGateway.completeAuthorization({ code: requestUrl.searchParams.get('code'), state: requestUrl.searchParams.get('state'), error: requestUrl.searchParams.get('error') });
          return sendOAuthPage(response, 200, 'Kick connected', 'Kick chat authorization completed successfully.');
        } catch (error) {
          return sendOAuthPage(response, 400, 'Kick connection failed', (error as Error).message);
        }
      }
      const visualAlertPageRoute = requestUrl.pathname === '/visual-alerts' || requestUrl.pathname === '/visual-alerts/interactions'
        ? { overlay: visualAlerts, eventsPath: '/visual-alerts/interactions/events' }
        : requestUrl.pathname === '/visual-alerts/twitch'
          ? { overlay: twitchAlertOverlay, eventsPath: '/visual-alerts/twitch/events' }
          : undefined;
      if (request.method === 'GET' && visualAlertPageRoute) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Visual Alerts overlay is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self';");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(visualAlertPageRoute.overlay.page(visualAlertPageRoute.eventsPath));
      }
      const visualAlertEventsOverlay = requestUrl.pathname === '/visual-alerts/events' || requestUrl.pathname === '/visual-alerts/interactions/events'
        ? visualAlerts
        : requestUrl.pathname === '/visual-alerts/twitch/events'
          ? twitchAlertOverlay
          : undefined;
      if (request.method === 'GET' && visualAlertEventsOverlay) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Visual Alerts overlay is available only on this computer.' });
        visualAlertEventsOverlay.connect(response);
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/chat-overlay') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Chat Overlay is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; media-src 'self';");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(chatOverlay.page());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/chat-overlay/events') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Chat Overlay is available only on this computer.' });
        chatOverlay.connect(response);
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/emote-wall') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Emote Wall is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' https:;");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(emoteWall.page());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/emote-wall/events') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Emote Wall is available only on this computer.' });
        emoteWall.connect(response);
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/twitch-experiences') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Twitch Experiences are available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self';");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(twitchExperiences.page());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/twitch-experiences/events') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Twitch Experiences are available only on this computer.' });
        twitchExperiences.connect(response);
        return;
      }
      const twitchExperienceMediaMatch = requestUrl.pathname.match(/^\/twitch-experiences\/media\/(hype-train|raid-portal|goal-overlay)$/);
      if (request.method === 'GET' && twitchExperienceMediaMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Twitch Experience media is available only on this computer.' });
        try {
          if (!await twitchExperiences.serveMedia(twitchExperienceMediaMatch[1] as 'hype-train' | 'raid-portal' | 'goal-overlay', response)) return sendJson(response, 404, { error: 'The assigned Twitch Experience media is unavailable.' });
        } catch (error) { return sendJson(response, 502, { error: error instanceof Error ? error.message : 'Twitch Experience media could not be loaded.' }); }
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/discord-voice') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Discord Voice overlay is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net;");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(discordVoiceOverlay.page());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/discord-voice/events') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Discord Voice overlay is available only on this computer.' });
        discordVoiceOverlay.connect(response);
        return;
      }
      const discordVoiceMediaMatch = requestUrl.pathname.match(/^\/discord-voice\/media\/([^/]+)\/(idle|speaking|mute|deafen)$/);
      if (request.method === 'GET' && discordVoiceMediaMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Discord Voice media is available only on this computer.' });
        try {
          if (!await discordVoiceOverlay.serveMedia(decodeURIComponent(discordVoiceMediaMatch[1]), discordVoiceMediaMatch[2], response)) return sendJson(response, 404, { error: 'Discord participant media is unavailable.' });
        } catch (error) { return sendJson(response, 502, { error: error instanceof Error ? error.message : 'Discord participant media could not be loaded.' }); }
        return;
      }
      const emoteMediaMatch = requestUrl.pathname.match(/^\/emote-wall\/media\/([a-f0-9]{32})$/);
      if (request.method === 'GET' && emoteMediaMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Emote Wall media is available only on this computer.' });
        try {
          if (!await emoteWall.serveMedia(emoteMediaMatch[1], response)) return sendJson(response, 404, { error: 'Emote media is unavailable.' });
        } catch (error) { return sendJson(response, 502, { error: error instanceof Error ? error.message : 'Emote media could not be loaded.' }); }
        return;
      }
      const visualMediaMatch = requestUrl.pathname.match(/^\/visual-alerts\/media\/([^/]+)$/);
      if (request.method === 'GET' && visualMediaMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Visual Alerts overlay is available only on this computer.' });
        const mediaId = decodeURIComponent(visualMediaMatch[1]);
        const selectedVariantId = requestUrl.searchParams.get('variant') || undefined;
        const alert = soundAlerts.find(mediaId) || twitchVisualAlerts.resolveVariant(mediaId, selectedVariantId);
        if (!alert?.visualUri) return sendJson(response, 404, { error: 'No local visual is assigned to this alert.' });
        const filePath = fileURLToPath(alert.visualUri);
        const details = await stat(filePath);
        if (!details.isFile()) return sendJson(response, 404, { error: 'The assigned visual file is unavailable.' });
        const contentType = visualMediaTypes[path.extname(filePath).toLowerCase()];
        if (!contentType) return sendJson(response, 415, { error: 'The assigned visual format is not supported.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', contentType);
        response.setHeader('Content-Length', details.size);
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        createReadStream(filePath).pipe(response);
        return;
      }
      const alertAudioMatch = requestUrl.pathname.match(/^\/visual-alerts\/audio\/([^/]+)$/);
      if (request.method === 'GET' && alertAudioMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Visual Alerts audio is available only on this computer.' });
        const audioId = decodeURIComponent(alertAudioMatch[1]);
        const selectedVariantId = requestUrl.searchParams.get('variant') || undefined;
        const alert = soundAlerts.find(audioId) || twitchVisualAlerts.resolveVariant(audioId, selectedVariantId);
        if (!alert?.audioUri) return sendJson(response, 404, { error: 'No local audio is assigned to this alert.' });
        const filePath = fileURLToPath(alert.audioUri);
        const details = await stat(filePath);
        if (!details.isFile()) return sendJson(response, 404, { error: 'The assigned audio file is unavailable.' });
        const contentType = audioMediaTypes[path.extname(filePath).toLowerCase()];
        if (!contentType) return sendJson(response, 415, { error: 'The assigned audio format is not supported.' });
        const rangeMatch = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
        let start = 0;
        let end = details.size - 1;
        if (rangeMatch) {
          start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
          end = rangeMatch[2] ? Number(rangeMatch[2]) : end;
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= details.size) {
            response.statusCode = 416;
            response.setHeader('Content-Range', `bytes */${details.size}`);
            return response.end();
          }
          end = Math.min(end, details.size - 1);
          response.statusCode = 206;
          response.setHeader('Content-Range', `bytes ${start}-${end}/${details.size}`);
        } else response.statusCode = 200;
        response.setHeader('Content-Type', contentType);
        response.setHeader('Content-Length', end - start + 1);
        response.setHeader('Accept-Ranges', 'bytes');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        createReadStream(filePath, { start, end }).pipe(response);
        return;
      }
      if (requestToken(request, requestUrl) !== token) return sendJson(response, 401, { error: 'A valid Tempest Bridge token is required.' });

      if (request.method === 'GET' && requestUrl.pathname === '/v1/broadcast/simulcast') {
        return sendJson(response, 200, simulcastSnapshot(connectedBroadcast()));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/simulcast/configure') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes(simulcastConfigureCapability)) {
          return sendJson(response, 409, { error: 'The connected Broadcast build does not provide simulcast configuration.' });
        }
        const currentStatus = (client.status as TempestBroadcastStatus | undefined);
        const reported = isRecord(currentStatus?.simulcast) ? currentStatus.simulcast : undefined;
        if (currentStatus?.streaming === true || (isRecord(reported?.kick) && reported.kick.active === true)) {
          return sendJson(response, 409, { error: 'Stop Twitch and Kick outputs before changing simulcast configuration.' });
        }
        const validation = validateSimulcastConfigureRequest(await readJson(request));
        if (!validation.ok || !validation.value) return sendJson(response, 400, { error: validation.errors.join(' ') });
        const commandId = sendBroadcastCommand(client, simulcastConfigureCapability, validation.value as unknown as Record<string, unknown>);
        workflowEngine!.recordExternalEvent('broadcast.simulcast.configuration-requested', 'info', validation.value.enabled ? 'Production simulcast setup requested from Broadcast.' : 'Simulcast disable requested from Broadcast.', { commandId });
        return sendJson(response, 202, { accepted: true, commandId, status: simulcastSnapshot(client) });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/simulcast/start') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes(simulcastStartCapability)) {
          return sendJson(response, 409, { error: 'The connected Broadcast build does not provide coordinated Go Live control.' });
        }
        const status = simulcastSnapshot(client);
        if (status.ready !== true) return sendJson(response, 409, { error: 'Simulcast readiness checks must pass before going live.', status });
        const validation = validateSimulcastStartRequest(await readJson(request));
        if (!validation.ok || !validation.value) return sendJson(response, 400, { error: validation.errors.join(' ') });
        if (validation.value.operatorChecklistAccepted !== true) return sendJson(response, 409, { error: 'Complete and accept the operator rehearsal checklist before going live.' });
        const commandId = sendBroadcastCommand(client, simulcastStartCapability, validation.value as Record<string, unknown>);
        workflowEngine!.recordExternalEvent('broadcast.simulcast.start-requested', 'warning', 'Coordinated Twitch and Kick Go Live requested by the operator.', { commandId });
        return sendJson(response, 202, { accepted: true, commandId, status });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/simulcast/preflight') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes(simulcastPreflightCapability)) return sendJson(response, 409, { error: 'The connected Broadcast build does not provide the production preflight.' });
        const currentStatus = (client.status as TempestBroadcastStatus | undefined);
        const reported = isRecord(currentStatus?.simulcast) ? currentStatus.simulcast : undefined;
        if (currentStatus?.streaming === true || (isRecord(reported?.kick) && reported.kick.active === true)) return sendJson(response, 409, { error: 'Run preflight while Twitch and Kick outputs are stopped.' });
        const commandId = sendBroadcastCommand(client, simulcastPreflightCapability, {});
        workflowEngine!.recordExternalEvent('broadcast.simulcast.preflight-requested', 'info', 'Local production output preflight requested.', { commandId });
        return sendJson(response, 202, { accepted: true, commandId });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/simulcast/retry-kick') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes(simulcastRetryKickCapability)) return sendJson(response, 409, { error: 'The connected Broadcast build does not provide Kick recovery control.' });
        const status = simulcastSnapshot(client);
        const twitch = isRecord(status.twitch) ? status.twitch : {};
        const kick = isRecord(status.kick) ? status.kick : {};
        if (twitch.active !== true || kick.active === true) return sendJson(response, 409, { error: 'Kick recovery is available only while Twitch is live and Kick is offline.', status });
        const commandId = sendBroadcastCommand(client, simulcastRetryKickCapability, {});
        workflowEngine!.recordExternalEvent('broadcast.simulcast.kick-retry-requested', 'warning', 'Kick output recovery requested while Twitch remains live.', { commandId });
        return sendJson(response, 202, { accepted: true, commandId, status });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/simulcast/stop') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes(simulcastStopCapability)) {
          return sendJson(response, 409, { error: 'The connected Broadcast build does not provide simulcast stop control.' });
        }
        const validation = validateSimulcastStopRequest(await readJson(request));
        if (!validation.ok || !validation.value) return sendJson(response, 400, { error: validation.errors.join(' ') });
        const commandId = sendBroadcastCommand(client, simulcastStopCapability, validation.value as Record<string, unknown>);
        workflowEngine!.recordExternalEvent('broadcast.simulcast.stop-requested', 'warning', validation.value.scope === 'kick' ? 'Kick output stop requested; Twitch will remain live.' : 'Emergency stop requested for Twitch and Kick outputs.', { commandId, scope: validation.value.scope });
        return sendJson(response, 202, { accepted: true, commandId, status: simulcastSnapshot(client) });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/simulcast/refresh') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes('broadcast.status')) return sendJson(response, 409, { error: 'Broadcast status refresh is unavailable.' });
        const commandId = sendBroadcastCommand(client, 'broadcast.status', {});
        return sendJson(response, 202, { accepted: true, commandId });
      }

      if (request.method === 'GET' && requestUrl.pathname === '/v1/broadcast/dual-format') {
        return sendJson(response, 200, dualFormatSnapshot(connectedBroadcast()));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/dual-format/configure') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes(dualFormatConfigureCapability)) {
          return sendJson(response, 409, { error: 'The connected Broadcast build does not provide Dual Format configuration.' });
        }
        if ((client.status as TempestBroadcastStatus | undefined)?.streaming === true) {
          return sendJson(response, 409, { error: 'Stop streaming before changing Dual Format configuration.' });
        }
        const validation = validateDualFormatConfigureRequest(await readJson(request));
        if (!validation.ok || !validation.value) return sendJson(response, 400, { error: validation.errors.join(' ') });
        const { enabled, canvasPreset, canvasName } = validation.value;
        const [width, height] = canvasPreset!.split('x').map(Number);
        const commandId = sendBroadcastCommand(client, dualFormatConfigureCapability, {
          enabled,
          enhancedBroadcasting: enabled,
          additionalCanvas: enabled ? {
            name: canvasName,
            baseWidth: width,
            baseHeight: height,
            outputWidth: width,
            outputHeight: height,
            fps: 'follow-main'
          } : null,
          selectAsAdditionalCanvas: enabled,
          preserveCanvasWhenDisabled: true,
          verticalBrowserSources: {
            twitchAlerts: { url: `${runtime.baseUrl}/visual-alerts/twitch?orientation=vertical`, audio: false },
            interactionAlerts: { url: `${runtime.baseUrl}/visual-alerts/interactions?orientation=vertical`, audio: false },
            chatOverlay: null
          }
        });
        workflowEngine!.recordExternalEvent('broadcast.dual-format.configuration-requested', 'info', enabled ? 'Dual Format setup requested from Broadcast.' : 'Dual Format disable requested from Broadcast.', { commandId, canvasPreset });
        return sendJson(response, 202, { accepted: true, commandId, status: dualFormatSnapshot(client) });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/dual-format/preview') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes(dualFormatPreviewCapability)) {
          return sendJson(response, 409, { error: 'The connected Broadcast build does not provide a vertical preview command.' });
        }
        const commandId = sendBroadcastCommand(client, dualFormatPreviewCapability, { orientation: 'vertical' });
        return sendJson(response, 202, { accepted: true, commandId });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/broadcast/dual-format/refresh') {
        const client = connectedBroadcast();
        if (!client) return sendJson(response, 409, { error: 'Tempest Broadcast is not connected.' });
        if (!client.capabilities.includes('broadcast.status')) {
          return sendJson(response, 409, { error: 'The connected Broadcast build cannot refresh its status.' });
        }
        const commandId = sendBroadcastCommand(client, 'broadcast.status', {});
        return sendJson(response, 202, { accepted: true, commandId });
      }

      if (request.method === 'GET' && requestUrl.pathname === '/v1/applications') {
        return sendJson(response, 200, { applications: registry.listApplications() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/applications') {
        const application = await registry.registerApplication(await readJson(request));
        broadcastSystemEvent('system.registry.application', { action: 'registered', application });
        return sendJson(response, 201, { application });
      }
      if (request.method === 'DELETE' && requestUrl.pathname.startsWith('/v1/applications/')) {
        const id = decodeURIComponent(requestUrl.pathname.slice('/v1/applications/'.length));
        const removed = await registry.removeApplication(id);
        if (removed) broadcastSystemEvent('system.registry.application', { action: 'removed', id });
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true, id } : { error: 'Application was not registered.' });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/assets') {
        return sendJson(response, 200, { assets: registry.listAssets() });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/sound-alerts') {
        return sendJson(response, 200, { owner: 'tempest-mainframe-studio', pricing: 'free', alerts: soundAlerts.list() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/sound-alerts') {
        const alert = await soundAlerts.create(await readJson(request));
        broadcastSystemEvent('sound-alert.configuration.created', { alert });
        return sendJson(response, 201, { alert });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/visual-alerts') {
        return sendJson(response, 200, visualAlertOutputStatus());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/alert-queue') {
        return sendJson(response, 200, alertQueue!.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/alert-queue/clear') {
        const removed = alertQueue!.clearWaiting();
        broadcastSystemEvent('alert-queue.cleared', { removed, reason: 'operator' });
        return sendJson(response, 200, { removed, ...alertQueue!.status() });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/chat-overlay') {
        return sendJson(response, 200, chatOverlay.status(`${runtime.baseUrl}/chat-overlay`));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chat-overlay/settings') {
        const settings = await chatOverlay.update(await readJson(request));
        return sendJson(response, 200, { settings });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chat-overlay/preview') {
        return sendJson(response, 202, { message: chatOverlay.preview() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chat-overlay/clear') {
        chatOverlay.clear();
        return sendJson(response, 200, chatOverlay.status(`${runtime.baseUrl}/chat-overlay`));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/emote-wall') {
        return sendJson(response, 200, emoteWall.status(`${runtime.baseUrl}/emote-wall`));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/emote-wall/settings') {
        const settings = await emoteWall.update(await readJson(request));
        return sendJson(response, 200, { settings });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/emote-wall/preview') {
        return sendJson(response, 202, { items: emoteWall.preview() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/emote-wall/pyramid/preview') {
        return sendJson(response, 202, { pyramid: emoteWall.previewPyramid() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/emote-wall/providers/refresh') {
        await emoteWall.refreshProviders();
        return sendJson(response, 200, emoteWall.status(`${runtime.baseUrl}/emote-wall`));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/emote-wall/clear') {
        emoteWall.clear();
        return sendJson(response, 200, emoteWall.status(`${runtime.baseUrl}/emote-wall`));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/twitch-experiences') return sendJson(response, 200, twitchExperiences.status(`${runtime.baseUrl}/twitch-experiences`));
      if (request.method === 'POST' && requestUrl.pathname === '/v1/twitch-experiences/settings') {
        const settings = await twitchExperiences.update(await readJson(request));
        return sendJson(response, 200, { settings });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/twitch-experiences/preview') {
        const body = await readJson(request) as { kind?: unknown };
        if (!['hype-train','raid-portal','goal-overlay'].includes(String(body.kind || ''))) throw new Error('A valid Twitch Experience preview kind is required.');
        twitchExperiences.preview(body.kind as 'hype-train'|'raid-portal'|'goal-overlay');
        return sendJson(response, 202, twitchExperiences.status(`${runtime.baseUrl}/twitch-experiences`));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/twitch-experiences/clear') { twitchExperiences.clear(); return sendJson(response, 200, twitchExperiences.status(`${runtime.baseUrl}/twitch-experiences`)); }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/discord-voice') return sendJson(response, 200, discordVoiceOverlay.status(`${runtime.baseUrl}/discord-voice`));
      if (request.method === 'POST' && requestUrl.pathname === '/v1/discord-voice/settings') {
        const settings = await discordVoiceOverlay.updateSettings(await readJson(request));
        return sendJson(response, 200, { settings });
      }
      const discordVoiceProfileMatch = requestUrl.pathname.match(/^\/v1\/discord-voice\/profiles\/([^/]+)$/);
      if (request.method === 'POST' && discordVoiceProfileMatch) {
        const profile = await discordVoiceOverlay.updateProfile(decodeURIComponent(discordVoiceProfileMatch[1]), await readJson(request));
        return sendJson(response, 200, { profile });
      }
      if (request.method === 'DELETE' && discordVoiceProfileMatch) {
        const removed = await discordVoiceOverlay.removeProfile(decodeURIComponent(discordVoiceProfileMatch[1]));
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true } : { error: 'Discord participant design was not found.' });
      }
      const discordVoiceProfileResetMatch = requestUrl.pathname.match(/^\/v1\/discord-voice\/profiles\/([^/]+)\/reset$/);
      if (request.method === 'POST' && discordVoiceProfileResetMatch) {
        const reset = await discordVoiceOverlay.resetProfile(decodeURIComponent(discordVoiceProfileResetMatch[1]));
        return sendJson(response, reset ? 200 : 404, reset ? { reset: true } : { error: 'Discord guest profile was not found.' });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/discord-voice/state') {
        await discordVoiceOverlay.setState(await readJson(request) as Record<string, unknown>);
        return sendJson(response, 200, discordVoiceOverlay.status(`${runtime.baseUrl}/discord-voice`));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/discord-voice/speaking') {
        const body = await readJson(request) as { userId?: unknown; speaking?: unknown };
        discordVoiceOverlay.setSpeaking(body.userId, body.speaking);
        return sendJson(response, 202, { accepted: true });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/discord-voice/preview') {
        discordVoiceOverlay.preview();
        return sendJson(response, 202, discordVoiceOverlay.status(`${runtime.baseUrl}/discord-voice`));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/discord-voice/clear') {
        discordVoiceOverlay.clearPreview();
        return sendJson(response, 200, discordVoiceOverlay.status(`${runtime.baseUrl}/discord-voice`));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/visual-alerts/twitch') {
        return sendJson(response, 200, { alerts: twitchVisualAlerts.list() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/visual-alerts/twitch') {
        const alert = await twitchVisualAlerts.create(await readJson(request));
        broadcastSystemEvent('twitch-alert.configuration.created', { alert });
        return sendJson(response, 201, { alert });
      }
      const twitchVisualUpdateMatch = requestUrl.pathname.match(/^\/v1\/visual-alerts\/twitch\/([^/]+)$/);
      if (request.method === 'POST' && twitchVisualUpdateMatch) {
        const alert = await twitchVisualAlerts.update(decodeURIComponent(twitchVisualUpdateMatch[1]), await readJson(request));
        return sendJson(response, 200, { alert });
      }
      if (request.method === 'DELETE' && twitchVisualUpdateMatch) {
        const id = decodeURIComponent(twitchVisualUpdateMatch[1]);
        const removed = await twitchVisualAlerts.remove(id);
        if (removed) broadcastSystemEvent('twitch-alert.configuration.removed', { id });
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true, id } : { error: 'The Twitch Alert was not found.' });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/visual-alerts/position-preview/clear') {
        const body = await readJson(request) as { kind?: unknown };
        if (body.kind === 'interaction') visualAlerts.clearPositioning();
        else if (body.kind === 'twitch') twitchAlertOverlay.clearPositioning();
        else return sendJson(response, 400, { error: 'kind must be interaction or twitch.' });
        return sendJson(response, 200, visualAlertOutputStatus());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/visual-alerts/position-preview') {
        const body = await readJson(request) as { kind?: unknown; alertId?: unknown; variantId?: unknown; design?: unknown; viewerName?: unknown; amount?: unknown; message?: unknown; sceneName?: unknown; useGlobalPlacement?: unknown };
        const kind = body.kind === 'interaction' ? 'interaction' : body.kind === 'twitch' ? 'twitch' : undefined;
        const alertId = typeof body.alertId === 'string' ? body.alertId : '';
        if (!kind) return sendJson(response, 400, { error: 'kind must be interaction or twitch.' });
        if (!alertId) return sendJson(response, 400, { error: 'alertId is required.' });
        const design = validateTwitchAlertDesign(body.design);
        const requestedSceneName = body.useGlobalPlacement === true ? undefined : typeof body.sceneName === 'string' && body.sceneName.trim() ? body.sceneName.trim().slice(0, 120) : activeBroadcastScene();
        const sceneDesign = resolveTwitchAlertDesignForScene(design, requestedSceneName);
        const viewerName = typeof body.viewerName === 'string' ? body.viewerName.trim().slice(0, 80) || 'Studio Operator' : 'Studio Operator';
        if (kind === 'interaction') {
          const alert = soundAlerts.find(alertId);
          if (!alert) return sendJson(response, 404, { error: 'The Interaction Alert was not found.' });
          const activeAlert = visualAlerts.show(alert, viewerName, `positioning:${alert.id}`, false, sceneDesign, true, requestedSceneName);
          return sendJson(response, 202, { activeAlert, positioning: true, connectedClients: visualAlerts.status('').connectedClients });
        }
        const variantId = typeof body.variantId === 'string' && body.variantId ? body.variantId : undefined;
        const alert = twitchVisualAlerts.resolveVariant(alertId, variantId);
        if (!alert) return sendJson(response, 404, { error: variantId ? 'The Twitch Alert variant was not found.' : 'The Twitch Alert was not found.' });
        const numericAmount = Number(body.amount);
        const amount = Number.isFinite(numericAmount) ? Math.max(0, numericAmount) : 100;
        const viewerMessage = typeof body.message === 'string' ? body.message.slice(0, 500) : '';
        const previewEvent: TempestNormalizedTwitchEvent = {
          schemaVersion: 1,
          id: `positioning:${alert.id}`,
          topic: alert.topic,
          occurredAt: new Date().toISOString(),
          source: 'twitch',
          channel: { id: 'studio-positioning', displayName: 'Studio Positioning' },
          viewer: { id: 'studio-operator', displayName: viewerName },
          payload: alert.topic === 'viewer.cheer.received' ? { bits: amount, message: viewerMessage }
            : alert.topic === 'viewer.raid.received' ? { fromBroadcasterId: 'studio-positioning', fromBroadcasterName: viewerName, viewers: amount }
              : alert.topic === 'viewer.reward.redeemed' ? { rewardTitle: 'Sample Reward', rewardId: 'studio-positioning-reward', rewardCost: amount, input: viewerMessage }
                : alert.topic === 'viewer.subscription.started' ? { isGift: alert.variant === 'gift', tier: '1000', cumulativeMonths: amount, message: viewerMessage }
                  : { message: viewerMessage }
        };
        const activeAlert = twitchAlertOverlay.showTwitch(alert, previewEvent, `positioning:${alert.id}`, sceneDesign, true, requestedSceneName);
        return sendJson(response, 202, { activeAlert, positioning: true, connectedClients: twitchAlertOverlay.status('').connectedClients });
      }
      const twitchVisualPreviewMatch = requestUrl.pathname.match(/^\/v1\/visual-alerts\/twitch\/([^/]+)\/preview$/);
      if (request.method === 'POST' && twitchVisualPreviewMatch) {
        const alertId = decodeURIComponent(twitchVisualPreviewMatch[1]);
        const body = await readJson(request) as { variantId?: unknown };
        const variantId = typeof body.variantId === 'string' ? body.variantId : undefined;
        const baseAlert = twitchVisualAlerts.find(alertId);
        const alert = twitchVisualAlerts.resolveVariant(alertId, variantId);
        if (!baseAlert || !alert) return sendJson(response, 404, { error: variantId ? 'The Twitch Alert variant was not found.' : 'The Twitch Visual Alert was not found.' });
        const selectedCondition = variantId ? baseAlert.alertVariants?.find((entry) => entry.id === variantId)?.condition : undefined;
        const previewEvent: TempestNormalizedTwitchEvent = {
          schemaVersion: 1,
          id: globalThis.crypto.randomUUID(),
          topic: alert.topic,
          occurredAt: new Date().toISOString(),
          source: 'twitch',
          channel: { id: 'studio-preview', displayName: 'Studio Preview' },
          viewer: { id: 'studio-operator', displayName: 'Studio Operator' },
          payload: alert.topic === 'viewer.cheer.received' ? { bits: selectedCondition?.minimumBits ?? selectedCondition?.maximumBits ?? 100 }
            : alert.topic === 'viewer.raid.received' ? { fromBroadcasterId: 'studio-preview', fromBroadcasterName: 'Incoming Channel', viewers: selectedCondition?.minimumViewers ?? selectedCondition?.maximumViewers ?? 42 }
              : alert.topic === 'viewer.reward.redeemed' ? { rewardTitle: 'Channel Point Reward', rewardId: selectedCondition?.rewardId || 'studio-preview-reward', rewardCost: selectedCondition?.minimumRewardCost ?? selectedCondition?.maximumRewardCost ?? 1000 }
                : alert.topic === 'viewer.subscription.started' ? { isGift: alert.variant === 'gift', tier: selectedCondition?.subscriptionTier || '1000', cumulativeMonths: selectedCondition?.minimumMonths ?? selectedCondition?.maximumMonths ?? 3 }
                  : {}
        };
        const sceneName = activeBroadcastScene();
        const activeAlert = twitchAlertOverlay.showTwitch(alert, previewEvent, previewEvent.id, resolveTwitchAlertDesignForScene(alert.design, sceneName), false, sceneName);
        const reactionRun = await triggerTwitchAlertReaction(alert, previewEvent, 'studio.simulator');
        const previewTime = new Date().toISOString();
        const previewItem: TempestAlertQueueItem = { id: globalThis.crypto.randomUUID(), kind: 'twitch', alertId: alert.id, name: alert.name, source: 'studio.simulator', durationMs: alert.durationMs, state: 'playing', enqueuedAt: previewTime, startedAt: previewTime, diagnostics: { viewerName: 'Studio Operator', variantId: alert.selectedVariantId, variantName: alert.selectedVariantName, audioAssigned: Boolean(alert.audioUri), visualAssigned: Boolean(alert.visualUri), audioRoute: alert.audioUri ? 'browser-source' : 'none', browserClients: twitchAlertOverlay.status('').connectedClients, preview: true } };
        alertHistory.started(previewItem);
        alertHistory.completed(previewItem);
        return sendJson(response, 202, { activeAlert, reactionRun, preview: true });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/visual-alerts/clear') {
        visualAlerts.clear();
        twitchAlertOverlay.clear();
        return sendJson(response, 200, visualAlertOutputStatus());
      }
      const visualAlertPreviewMatch = requestUrl.pathname.match(/^\/v1\/visual-alerts\/([^/]+)\/preview$/);
      if (request.method === 'POST' && visualAlertPreviewMatch) {
        const alert = soundAlerts.find(decodeURIComponent(visualAlertPreviewMatch[1]));
        if (!alert) return sendJson(response, 404, { error: 'The Visual Alert was not found.' });
        const body = await readJson(request) as { viewerName?: unknown };
        const viewerName = typeof body.viewerName === 'string' ? body.viewerName.slice(0, 80) : 'Studio Operator';
        const sceneName = activeBroadcastScene();
        const activeAlert = visualAlerts.show(alert, viewerName, globalThis.crypto.randomUUID(), false, resolveTwitchAlertDesignForScene(alert.design, sceneName), false, sceneName);
        const previewTime = new Date().toISOString();
        const previewItem: TempestAlertQueueItem = { id: globalThis.crypto.randomUUID(), kind: 'interaction', alertId: alert.id, name: alert.name, source: 'studio.visual-preview', durationMs: alert.visualDurationMs, state: 'playing', enqueuedAt: previewTime, startedAt: previewTime, diagnostics: { viewerName, audioAssigned: Boolean(alert.audioUri), visualAssigned: Boolean(alert.visualUri), audioRoute: 'none', browserClients: visualAlerts.status('').connectedClients, preview: true } };
        alertHistory.started(previewItem);
        alertHistory.completed(previewItem);
        return sendJson(response, 202, { activeAlert, preview: true });
      }
      const soundAlertTriggerMatch = requestUrl.pathname.match(/^\/v1\/sound-alerts\/([^/]+)\/trigger$/);
      if (request.method === 'POST' && soundAlertTriggerMatch) {
        const alertId = decodeURIComponent(soundAlertTriggerMatch[1]);
        const body = await readJson(request) as Partial<TempestSoundAlertTriggerRequest>;
        const result = await triggerSoundAlert(alertId, {
          source: body.source || 'api',
          eventId: body.eventId,
          viewerId: body.viewerId,
          viewerName: body.viewerName,
          intensity: body.intensity,
          simulateMissing: body.simulateMissing,
          bypassCooldown: body.bypassCooldown
        });
        return sendJson(response, 202, result);
      }
      const soundAlertUpdateMatch = requestUrl.pathname.match(/^\/v1\/sound-alerts\/([^/]+)$/);
      if (request.method === 'POST' && soundAlertUpdateMatch) {
        const alert = await soundAlerts.update(decodeURIComponent(soundAlertUpdateMatch[1]), await readJson(request));
        broadcastSystemEvent('sound-alert.configuration.updated', { alert });
        return sendJson(response, 200, { alert });
      }
      if (request.method === 'DELETE' && soundAlertUpdateMatch) {
        const id = decodeURIComponent(soundAlertUpdateMatch[1]);
        const removed = await soundAlerts.remove(id);
        if (removed) broadcastSystemEvent('sound-alert.configuration.removed', { id });
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true, id } : { error: 'The Interaction Alert was not found.' });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/assets') {
        const asset = await registry.registerAsset(await readJson(request));
        broadcastSystemEvent('system.registry.asset', { action: 'registered', asset });
        return sendJson(response, 201, { asset });
      }
      if (request.method === 'DELETE' && requestUrl.pathname.startsWith('/v1/assets/')) {
        const id = decodeURIComponent(requestUrl.pathname.slice('/v1/assets/'.length));
        const removed = await registry.removeAsset(id);
        if (removed) broadcastSystemEvent('system.registry.asset', { action: 'removed', id });
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true, id } : { error: 'Asset was not registered.' });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/workflows') {
        return sendJson(response, 200, { workflows: registry.listWorkflows() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/workflows') {
        const workflow = await registry.registerWorkflow(await readJson(request));
        workflowEngine.setWorkflows(registry.listWorkflows());
        broadcastSystemEvent('system.registry.workflow', { action: 'registered', workflow });
        return sendJson(response, 201, { workflow });
      }
      const workflowTriggerMatch = requestUrl.pathname.match(/^\/v1\/workflows\/([^/]+)\/trigger$/);
      if (request.method === 'POST' && workflowTriggerMatch) {
        const workflowId = decodeURIComponent(workflowTriggerMatch[1]);
        const interaction = await readJson(request) as TempestInteractionRequest;
        const run = await workflowEngine.trigger(workflowId, interaction);
        broadcastSystemEvent('workflow.started', run);
        return sendJson(response, 202, { run });
      }
      if (request.method === 'DELETE' && requestUrl.pathname.startsWith('/v1/workflows/')) {
        const id = decodeURIComponent(requestUrl.pathname.slice('/v1/workflows/'.length));
        const removed = await registry.removeWorkflow(id);
        workflowEngine.setWorkflows(registry.listWorkflows());
        if (removed) broadcastSystemEvent('system.registry.workflow', { action: 'removed', id });
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true, id } : { error: 'Workflow was not registered.' });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactions') {
        const body = await readJson(request) as TempestInteractionRequest & { action?: string };
        const workflow = registry.listWorkflows().find((entry) => entry.trigger.action === body.action && entry.enabled);
        if (!workflow) return sendJson(response, 404, { error: `No enabled workflow handles ${body.action || 'this interaction'}.` });
        const run = await workflowEngine.trigger(workflow.id, body);
        broadcastSystemEvent('workflow.started', run);
        return sendJson(response, 202, { run });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/runs') {
        return sendJson(response, 200, { runs: workflowEngine.listRuns(Number(requestUrl.searchParams.get('limit')) || 40) });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/events') {
        return sendJson(response, 200, { events: workflowEngine.listEvents(Number(requestUrl.searchParams.get('limit')) || 100) });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/alert-history') {
        return sendJson(response, 200, { summary: alertHistory.summary(), records: alertHistory.list(Number(requestUrl.searchParams.get('limit')) || 200) });
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/alert-history') {
        return sendJson(response, 200, { removed: alertHistory.clear() });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/alert-diagnostics') {
        return sendJson(response, 200, await alertDiagnostics());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/safety') {
        return sendJson(response, 200, workflowEngine.safetyState());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/safety/stop') {
        const body = await readJson(request) as { reason?: string };
        const stoppedRuns = await workflowEngine.emergencyStop(body.reason || 'Operator emergency stop');
        const clearedQueuedAlerts = alertQueue!.clearAll();
        visualAlerts.clear();
        twitchAlertOverlay.clear();
        await options.soundAlertPlayback?.({ phase: 'stop-all' });
        broadcastSystemEvent('system.safety.disarmed', { stoppedRuns, clearedQueuedAlerts });
        return sendJson(response, 200, { ...workflowEngine.safetyState(), stoppedRuns, clearedQueuedAlerts });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/safety/arm') {
        workflowEngine.arm();
        broadcastSystemEvent('system.safety.armed', workflowEngine.safetyState());
        return sendJson(response, 200, workflowEngine.safetyState());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/integrations/twitch') {
        return sendJson(response, 200, twitchGateway.status());
      }
      if (request.method === 'GET' && ['/v1/integrations/now-playing', '/v1/integrations/storm-horizon-radio'].includes(requestUrl.pathname)) {
        return sendJson(response, 200, await chatbot.radioStatus());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/configuration') {
        const status = await twitchGateway.configure(await readJson(request));
        await syncChatbotConnection();
        return sendJson(response, 200, status);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/oauth/device') {
        return sendJson(response, 201, await twitchGateway.startDeviceAuthorization());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/oauth/poll') {
        const result = await twitchGateway.pollDeviceAuthorization();
        if (!result.pending) await syncChatbotConnection();
        return sendJson(response, 200, result);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/oauth/validate') {
        const status = await twitchGateway.validateAuthorization();
        await syncChatbotConnection();
        return sendJson(response, 200, status);
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/integrations/twitch/oauth') {
        const status = await twitchGateway.disconnect();
        await syncChatbotConnection();
        return sendJson(response, 200, status);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/integrations/kick') {
        return sendJson(response, 200, kickGateway.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/kick/configuration') {
        return sendJson(response, 200, await kickGateway.configure(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/kick/oauth/start') {
        return sendJson(response, 201, await kickGateway.startAuthorization());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/kick/oauth/validate') {
        return sendJson(response, 200, await kickGateway.validateAuthorization());
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/integrations/kick/oauth') {
        return sendJson(response, 200, await kickGateway.disconnect());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/kick/events') {
        const body = await readJson(request) as { event?: unknown; eventId?: unknown; occurredAt?: unknown };
        return sendJson(response, 202, await kickGateway.ingestWebhook(body.event ?? body, String(body.eventId || ''), String(body.occurredAt || '')));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/chatbot') {
        return sendJson(response, 200, chatbot.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/configuration') {
        return sendJson(response, 200, await chatbot.configure(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/oauth/device') {
        return sendJson(response, 201, await chatbot.startDeviceAuthorization());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/oauth/poll') {
        return sendJson(response, 200, await chatbot.pollDeviceAuthorization());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/oauth/validate') {
        const status = await chatbot.validateAuthorization();
        await syncChatbotConnection();
        return sendJson(response, 200, status);
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/chatbot/oauth') {
        return sendJson(response, 200, await chatbot.disconnect());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/commands') {
        return sendJson(response, 200, { command: await chatbot.upsertCommand(await readJson(request)), status: chatbot.status() });
      }
      const chatbotCommandMatch = requestUrl.pathname.match(/^\/v1\/chatbot\/commands\/([^/]+)$/);
      if (request.method === 'DELETE' && chatbotCommandMatch) {
        const id = decodeURIComponent(chatbotCommandMatch[1]);
        const removed = await chatbot.removeCommand(id);
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true, id, status: chatbot.status() } : { error: 'Chatbot command was not found.' });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/test') {
        return sendJson(response, 200, await chatbot.testCommand(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/automod/test') {
        return sendJson(response, 200, await chatbot.testAutoMod(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/raid/test') {
        return sendJson(response, 200, await chatbot.testRaidAutomation(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/messages') {
        const body = await readJson(request) as { platform?: unknown };
        return sendJson(response, 202, body.platform === 'kick' ? await kickGateway.postMessage(body) : await chatbot.postMessage(body));
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/chatbot/messages') {
        return sendJson(response, 200, chatbot.clearMessages());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/events') {
        const ingestion = twitchGateway.ingest(await readJson(request));
        const event = ingestion.event;
        if (ingestion.duplicate) {
          workflowEngine.recordExternalEvent('integration.event.duplicate', 'info', `Duplicate Twitch event ${event.id} was ignored.`, { eventId: event.id, topic: event.topic });
          return sendJson(response, 200, { accepted: false, duplicate: true, eventId: event.id });
        }
        if (event.topic === 'viewer.interaction.requested') {
          const access = await chatbot.authorizeInteraction(event);
          if (!access.allowed) {
            workflowEngine.recordExternalEvent('viewer.interaction.denied', 'warning', access.reason || 'Viewer interaction access was denied.', { eventId: event.id, viewerId: event.viewer?.id, accessCode: access.code });
            return sendJson(response, 403, { accepted: false, error: access.reason, code: access.code.replaceAll('-', '_'), eventId: event.id });
          }
        }
        workflowEngine.recordExternalEvent(event.topic, 'info', `${event.topic} received from Twitch.`, { event });
        broadcastSystemEvent(event.topic, event);
        chatOverlay.push(event);
        emoteWall.push(event);
        twitchExperiences.ingest(event);
        const raidAutomation = event.topic === 'viewer.raid.received' ? await chatbot.processRaidEvent(event) : undefined;

        const action = typeof event.payload.action === 'string' ? event.payload.action : undefined;
        const configuredAlert = typeof event.payload.alertId === 'string' ? soundAlerts.find(event.payload.alertId)
          : typeof event.payload.cue === 'string' ? soundAlerts.find(event.payload.cue)
            : action ? soundAlerts.find(action) : undefined;
        if ((event.topic === 'viewer.interaction.requested' || event.topic === 'viewer.reward.redeemed') && configuredAlert) {
          const result = await triggerSoundAlert(configuredAlert.id, {
            source: event.topic === 'viewer.reward.redeemed' ? 'twitch.channel-points' : 'twitch.extension',
            eventId: event.id,
            viewerId: event.viewer?.id,
            viewerName: event.viewer?.displayName || event.viewer?.login,
            intensity: typeof event.payload.intensity === 'number' ? event.payload.intensity : undefined,
            simulateMissing: false
          });
          return sendJson(response, 202, { accepted: true, duplicate: false, ...result });
        }
        const twitchVisual = twitchVisualAlerts.findForEvent(event);
        if (twitchVisual?.enabled) await queueTwitchAlert(twitchVisual, event, 'twitch.eventsub');
        const triggerType = event.topic === 'viewer.interaction.requested' ? 'viewer.interaction'
          : event.topic === 'viewer.reward.redeemed' ? 'twitch.channel-points'
            : event.topic === 'viewer.cheer.received' && action ? 'twitch.cheer' : undefined;
        const workflow = triggerType && action ? registry.listWorkflows().find((entry) => entry.enabled && entry.trigger.type === triggerType && entry.trigger.action === action) : undefined;
        if (!workflow) return sendJson(response, 202, { accepted: true, duplicate: false, eventId: event.id, ...(raidAutomation ? { raidAutomation } : {}) });

        const run = await workflowEngine.trigger(workflow.id, {
          source: event.topic === 'viewer.reward.redeemed' ? 'twitch.channel-points' : event.topic === 'viewer.cheer.received' ? 'twitch.cheer' : 'twitch.extension',
          eventId: event.id,
          viewerId: event.viewer?.id,
          viewerName: event.viewer?.displayName || event.viewer?.login,
          payload: { ...event.payload, dedupeId: typeof event.payload.dedupeId === 'string' ? event.payload.dedupeId : event.id }
        });
        broadcastSystemEvent('workflow.started', run);
        return sendJson(response, 202, { accepted: true, duplicate: false, eventId: event.id, run });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/connections') {
        return sendJson(response, 200, {
          connections: [...clients.values()].map((client) => ({
            id: client.id,
            applicationId: client.applicationId,
            version: client.version,
            capabilities: client.capabilities,
            status: client.status,
            connectedAt: client.connectedAt,
            lastSeenAt: client.lastSeenAt,
            subscriptions: [...client.subscriptions]
          }))
        });
      }
      return sendJson(response, 404, { error: 'Tempest Bridge route was not found.' });
    } catch (error) {
      logger.warn(error);
      return sendJson(response, 400, { error: (error as Error).message });
    }
  });

  server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url || '/', `http://${host}`);
    if (requestUrl.pathname !== '/v1/socket' || requestToken(request, requestUrl) !== token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => webSockets.emit('connection', webSocket, request));
  });

  webSockets.on('connection', (socket) => {
    const id = globalThis.crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const client: BridgeClient = {
      id,
      applicationId: 'unidentified',
      capabilities: [],
      connectedAt: timestamp,
      lastSeenAt: timestamp,
      subscriptions: new Set(['system.*']),
      socket
    };
    clients.set(id, client);
    sendSocket(socket, createBridgeMessage({ kind: 'welcome', source: 'tempest.bridge', target: id, payload: { clientId: id, protocolVersion: TEMPEST_PROTOCOL_VERSION } }));

    socket.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        const validation = validateBridgeMessage(parsed);
        if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
        const message = validation.value;
        client.lastSeenAt = new Date().toISOString();

        if (message.kind === 'hello') {
          const payload = message.payload as { applicationId?: string; version?: string; capabilities?: unknown } | undefined;
          client.applicationId = String(payload?.applicationId || message.source || 'unidentified');
          client.version = typeof payload?.version === 'string' ? payload.version.slice(0, 80) : undefined;
          client.capabilities = Array.isArray(payload?.capabilities)
            ? payload.capabilities.filter((entry): entry is string => typeof entry === 'string').slice(0, 100)
            : [];
          broadcastSystemEvent('system.app.connected', {
            clientId: id,
            applicationId: client.applicationId,
            version: client.version,
            capabilities: client.capabilities
          }, id);
        } else if (message.kind === 'subscribe' && Array.isArray((message.payload as { topics?: unknown })?.topics)) {
          for (const topic of (message.payload as { topics: unknown[] }).topics) {
            if (typeof topic === 'string' && topic.length <= 120) client.subscriptions.add(topic);
          }
        } else if (message.kind === 'unsubscribe' && Array.isArray((message.payload as { topics?: unknown })?.topics)) {
          for (const topic of (message.payload as { topics: unknown[] }).topics) client.subscriptions.delete(String(topic));
        } else if (message.kind === 'heartbeat') {
          sendSocket(socket, createBridgeMessage({ kind: 'response', source: 'tempest.bridge', target: client.applicationId, correlationId: message.id, payload: { alive: true } }));
        } else if (message.kind === 'publish' || message.kind === 'command' || message.kind === 'response') {
          if (message.kind === 'publish' && message.topic === 'broadcast.status' && message.payload && typeof message.payload === 'object') {
            client.status = message.payload as Record<string, unknown>;
            client.statusReportedAt = new Date().toISOString();
          }
          for (const recipient of clients.values()) {
            const targeted = !message.target || message.target === recipient.applicationId || message.target === recipient.id;
            const subscribed = message.kind !== 'publish' || !message.topic || [...recipient.subscriptions].some((entry) => topicMatches(entry, message.topic as string));
            if (recipient.id !== id && targeted && subscribed) sendSocket(recipient.socket, message);
          }
        }
      } catch (error) {
        sendSocket(socket, createBridgeMessage({ kind: 'error', source: 'tempest.bridge', target: id, payload: { message: (error as Error).message } }));
      }
    });

    socket.on('close', () => {
      clients.delete(id);
      broadcastSystemEvent('system.app.disconnected', { clientId: id, applicationId: client.applicationId });
    });
  });

  const configureExtensionRelay = async (relayOptions?: ExtensionRelayOptions): Promise<void> => {
    const previousRelay = extensionRelay;
    extensionRelay = null;
    if (previousRelay) await previousRelay.close();
    if (!relayOptions) {
      twitchGateway.setExtensionRelayState('not-configured');
      return;
    }
    const nextRelay = new TempestExtensionRelayClient({
      ...relayOptions,
      logger,
      catalog: () => soundAlerts.list().filter((alert) => alert.enabled).map((alert) => ({
        id: alert.id,
        name: alert.name,
        durationMs: alert.durationMs,
        cooldownMs: Math.max(alert.viewerCooldownMs, alert.globalCooldownMs, alert.durationMs),
        accent: alert.accent || '#54F2EB',
        glyph: alert.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'FX',
        kind: 'sound-alert' as const
      })),
      onStatus(status: ExtensionRelayStatus) {
        twitchGateway.setExtensionRelayState(status.state, status.lastError);
      },
      async handler(event) {
        const response = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token },
          body: JSON.stringify(event)
        });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      },
      async kickEventHandler(event) {
        const response = await fetch(`${runtime.baseUrl}/v1/integrations/kick/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token },
          body: JSON.stringify(event)
        });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      }
    });
    extensionRelay = nextRelay;
    nextRelay.start();
  };

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => resolve());
  });
  const address = server.address() as AddressInfo;
  runtime = {
    host,
    port: address.port,
    baseUrl: `http://${host}:${address.port}`,
    token,
    dataDirectory: options.dataDirectory,
    configureExtensionRelay,
    close: async () => {
      await extensionRelay?.close();
      await chatbot.close();
      alertQueue?.close();
      await alertHistory.flush();
      visualAlerts.close();
      twitchAlertOverlay.close();
      chatOverlay.close();
      emoteWall.close();
      twitchExperiences.close();
      discordVoiceOverlay.close();
      twitchGateway.close();
      workflowEngine?.close();
      for (const client of clients.values()) client.socket.close(1001, 'Tempest Bridge shutting down');
      await new Promise<void>((resolve, reject) => webSockets.close((error) => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  };
  await syncChatbotConnection();
  await configureExtensionRelay(options.extensionRelay);
  logger.info(`Tempest Bridge ${TEMPEST_PROTOCOL_VERSION} listening on ${runtime.baseUrl}`);
  return runtime;
}
