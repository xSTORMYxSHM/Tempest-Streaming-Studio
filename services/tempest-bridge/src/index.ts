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
import { TempestVisualAlertEvent, TempestVisualAlertOverlay } from './visual-alerts';
import { TempestTwitchVisualAlertCatalog, resolveTwitchAlertDesignForScene, validateTwitchAlertDesign } from './twitch-visual-alerts';
export { TempestTwitchVisualAlertCatalog, resolveTwitchAlertDesignForScene, validateTwitchAlertDesign } from './twitch-visual-alerts';
import { TempestChatOverlay } from './chat-overlay';
import { pollOverlayPage } from './poll-overlay';
import { TempestEmoteWall } from './emote-wall';
import { TempestTwitchExperiences } from './twitch-experiences';
import { TempestDiscordVoiceOverlay } from './discord-voice-overlay';
import { TempestDiceOverlay } from './dice-overlay';
import { TempestInteractiveStage } from './interactive-stage';
import { TempestUnifiedStage } from './unified-stage';
import { TempestInteractiveWorld } from './interactive-world';
import { TempestStageActorCatalog } from './stage-actors';
import { TempestInteractionComposer } from './interaction-composer';
import { TempestExtensionFeaturePlacements, TwitchExtensionFeatureDefinition } from './extension-features';
import { TempestTobiiAdapter } from './tobii-adapter';
export { TempestStageActorCatalog } from './stage-actors';
import { TempestAlertQueue, TempestAlertQueueItem } from './alert-queue';
import { TempestAlertHistory } from './alert-history';
import {
  ExtensionRelayOptions,
  ExtensionRelayStatus,
  TempestExtensionRelayClient,
  extensionCatalogKind
} from './extension-relay';
import { TwitchChatbot, type ChatbotDiceRollRequest, type ChatbotDiceRollResult, type ChatbotDispatch } from './chatbot';
import { KickIntegrationGateway, type KickCredentialStore } from './kick-integration';

export type { TwitchCredentialStore, TwitchTokenSet } from './twitch-integration';
export type { KickCredentialSet, KickCredentialStore, KickIntegrationStatus } from './kick-integration';
export { KickIntegrationGateway } from './kick-integration';
export type { ChatbotCommand, ChatbotStatus } from './chatbot';
export {
  extensionCatalogKind,
  extensionRelayOptionsFromEnvironment,
  TempestExtensionRelayClient
} from './extension-relay';
export type { ExtensionRelayOptions, ExtensionRelayResult, ExtensionRelayStatus, TwitchExtensionCompanion, TwitchExtensionCompanionSettings } from './extension-relay';

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
  tobiiAdapterPath?: string;
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

const interactiveWorldCatalog = [
  { id: 'tempest.avatar.join', name: 'Join the Crowd', durationMs: 4_000, cooldownMs: 5_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#54F2EB', glyph: 'JOIN', kind: 'interaction' as const, destinations: ['mainframe', 'streaming'] as const },
  { id: 'tempest.avatar.left', name: 'Move Avatar Left', durationMs: 1_000, cooldownMs: 350, category: 'community' as const, placementMode: 'fixed' as const, accent: '#54F2EB', glyph: 'LEFT', kind: 'interaction' as const, destinations: ['streaming'] as const },
  { id: 'tempest.avatar.right', name: 'Move Avatar Right', durationMs: 1_000, cooldownMs: 350, category: 'community' as const, placementMode: 'fixed' as const, accent: '#54F2EB', glyph: 'RGT', kind: 'interaction' as const, destinations: ['streaming'] as const },
  { id: 'tempest.avatar.jump', name: 'Make My Avatar Jump', durationMs: 2_000, cooldownMs: 3_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#70F0B4', glyph: 'JUMP', kind: 'interaction' as const, destinations: ['streaming'] as const },
  { id: 'tempest.avatar.drop', name: 'Drop Through Platform', durationMs: 1_000, cooldownMs: 750, category: 'community' as const, placementMode: 'fixed' as const, accent: '#70F0B4', glyph: 'DROP', kind: 'interaction' as const, destinations: ['streaming'] as const },
  { id: 'tempest.avatar.interact', name: 'Interact Nearby', durationMs: 1_000, cooldownMs: 1_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#FFB45C', glyph: 'USE', kind: 'interaction' as const, destinations: ['streaming'] as const },
  { id: 'tempest.avatar.emote', name: 'Avatar Emote', durationMs: 1_500, cooldownMs: 2_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#B99CFF', glyph: 'EMO', kind: 'interaction' as const, destinations: ['streaming'] as const },
  { id: 'tempest.avatar.unstuck', name: 'Respawn My Avatar', durationMs: 1_000, cooldownMs: 10_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#FF667A', glyph: 'RST', kind: 'interaction' as const, destinations: ['streaming'] as const },
  { id: 'tempest.pet.feed', name: 'Feed the Pet', durationMs: 3_000, cooldownMs: 8_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#FFB45C', glyph: 'FEED', kind: 'interaction' as const, destinations: ['mainframe', 'streaming'] as const },
  { id: 'tempest.pet.play', name: 'Play With Pet', durationMs: 5_000, cooldownMs: 8_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#FF9F43', glyph: 'PET', kind: 'interaction' as const, destinations: ['mainframe', 'streaming'] as const },
  { id: 'tempest.pet.pet', name: 'Pet the Pet', durationMs: 3_000, cooldownMs: 5_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#B99CFF', glyph: 'LOVE', kind: 'interaction' as const, destinations: ['mainframe', 'streaming'] as const },
  { id: 'tempest.viewer-attack', name: 'Viewer Attack', durationMs: 2_000, cooldownMs: 3_000, category: 'screen-effect' as const, placementMode: 'viewer' as const, accent: '#FF667A', glyph: 'HIT', kind: 'interaction' as const, destinations: ['streaming'] as const },
  { id: 'tempest.battle.attack', name: 'Battle Attack', durationMs: 2_000, cooldownMs: 3_000, category: 'community' as const, placementMode: 'fixed' as const, accent: '#54F2EB', glyph: 'ATK', kind: 'interaction' as const, destinations: ['streaming'] as const }
].map((item) => ({
  ...item,
  viewerCooldownMs: item.cooldownMs,
  globalCooldownMs: 0,
  access: { mode: 'everyone' as const, allowedViewerIds: [], blockedViewerIds: [], hideWhenLocked: false },
  destinations: [...item.destinations]
}));

const extensionFeatureDescriptions: Record<string, { group: string; description: string }> = {
  'tempest.avatar.join': { group: 'Viewer Avatars', description: 'Let a viewer join the on-screen crowd.' },
  'tempest.avatar.left': { group: 'Viewer Avatars', description: 'Move the viewer avatar to the left.' },
  'tempest.avatar.right': { group: 'Viewer Avatars', description: 'Move the viewer avatar to the right.' },
  'tempest.avatar.jump': { group: 'Viewer Avatars', description: 'Make the viewer avatar jump.' },
  'tempest.avatar.drop': { group: 'Viewer Avatars', description: 'Drop the viewer avatar through a platform.' },
  'tempest.avatar.interact': { group: 'Viewer Avatars', description: 'Use the nearest Interactive World object.' },
  'tempest.avatar.emote': { group: 'Viewer Avatars', description: 'Play an avatar emote.' },
  'tempest.avatar.unstuck': { group: 'Viewer Avatars', description: 'Respawn an avatar at a safe checkpoint.' },
  'tempest.pet.feed': { group: 'Screen Pet', description: 'Feed the on-screen pet.' },
  'tempest.pet.play': { group: 'Screen Pet', description: 'Play with the on-screen pet.' },
  'tempest.pet.pet': { group: 'Screen Pet', description: 'Give the on-screen pet attention.' },
  'tempest.viewer-attack': { group: 'Viewer Games', description: 'Attack a selected point in the on-screen world.' },
  'tempest.battle.attack': { group: 'Viewer Games', description: 'Attack during the active viewer battle.' }
};

const diceExtensionCatalogItem = {
  id: 'tempest.dice.roll', name: 'Roll a d20', durationMs: 8_000, cooldownMs: 10_000,
  viewerCooldownMs: 10_000, globalCooldownMs: 2_000,
  category: 'community' as const, placementMode: 'fixed' as const,
  access: { mode: 'everyone' as const, allowedViewerIds: [], blockedViewerIds: [], hideWhenLocked: false },
  accent: '#8BEAFF', glyph: 'D20', kind: 'interaction' as const,
  destinations: ['streaming'] as const
};

const interactiveWorldActionIds = new Set([
  ...interactiveWorldCatalog.map((item) => item.id),
  'tempest.avatar.equip',
  'tempest.pet-play'
]);
const simulcastStartCapability = 'broadcast.simulcast.start';
const simulcastStopCapability = 'broadcast.simulcast.stop';
const simulcastRetryKickCapability = 'broadcast.simulcast.retry-kick';
const extensionDiceViewerCooldownMs = 30_000;
const extensionDiceGlobalCooldownMs = 5_000;
const extensionDicePresets = [
  { id: 'tempest.dice.d4', expression: '1d4', name: 'Roll d4', glyph: 'D4' },
  { id: 'tempest.dice.d6', expression: '1d6', name: 'Roll d6', glyph: 'D6' },
  { id: 'tempest.dice.d8', expression: '1d8', name: 'Roll d8', glyph: 'D8' },
  { id: 'tempest.dice.d10', expression: '1d10', name: 'Roll d10', glyph: 'D10' },
  { id: 'tempest.dice.d12', expression: '1d12', name: 'Roll d12', glyph: 'D12' },
  { id: 'tempest.dice.d20', expression: '1d20', name: 'Roll d20', glyph: 'D20' },
  { id: 'tempest.dice.d50', expression: '1d50', name: 'Roll 1–50', glyph: 'D50' },
  { id: 'tempest.dice.d100', expression: '1d100', name: 'Roll d100', glyph: 'D100' }
] as const;
const extensionDiceCustom = { id: 'tempest.dice.custom', name: 'Custom 1–N', glyph: '1N' } as const;
const diceBoxDistributionDirectory = path.join(path.dirname(require.resolve('@3d-dice/dice-box/package.json')), 'dist');
const diceBoxAssetsDirectory = path.join(diceBoxDistributionDirectory, 'assets');
const diceThemeAssetsDirectory = path.join(path.dirname(require.resolve('@3d-dice/dice-themes/package.json')), 'themes');

const diceBoxMediaTypes: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'
};

async function serveDiceBoxFile(response: ServerResponse, filePath: string): Promise<void> {
  const details = await stat(filePath);
  if (!details.isFile()) throw new Error('The requested Dice Box asset is unavailable.');
  const contentType = diceBoxMediaTypes[path.extname(filePath).toLowerCase()];
  if (!contentType) throw new Error('The requested Dice Box asset type is not supported.');
  response.statusCode = 200;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', details.size);
  response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  createReadStream(filePath).pipe(response);
}

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
  let extensionRelay: TempestExtensionRelayClient | null = null;
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
  let dispatchChatDice: (request: ChatbotDiceRollRequest) => Promise<ChatbotDiceRollResult> = async () => { throw new Error('3D Dice is not ready.'); };
  let kickGateway!: KickIntegrationGateway;
  const chatbot = new TwitchChatbot({
    dataDirectory: options.dataDirectory,
    credentialStore: options.chatbotCredentialStore,
    fetchImplementation: options.chatbotFetchImplementation,
    onEvent: (event) => ingestChatEvent(event),
    onCommand: (dispatch) => dispatchChatCommand(dispatch),
    createTwitchClip: (input) => twitchGateway.createClip(input),
    rollDice: (request) => dispatchChatDice(request),
    sendPlatformMessage: async (_platform, message, replyParentMessageId) => { await kickGateway.postMessage({ message, replyToMessageId: replyParentMessageId }); },
    onConnectionState(eventSub, chat) { twitchGateway.setChatConnectionState(eventSub, chat); },
    onPollChanged() { extensionRelay?.syncCatalog(); },
    onCatalogChanged() { extensionRelay?.syncCatalog(); }
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
  let workflowEngine: TempestWorkflowEngine | null = null;
  type BrowserAudioPlaybackState = 'pending' | 'started' | 'failed';
  type BrowserAudioPlaybackMethod = 'direct' | 'blob' | 'web-audio' | 'fetch' | 'watchdog';
  interface BrowserAudioPlaybackRecord {
    runId: string;
    alertId: string;
    output: 'interaction' | 'twitch';
    state: BrowserAudioPlaybackState;
    expectedAt: string;
    confirmedAt?: string;
    latencyMs?: number;
    method?: BrowserAudioPlaybackMethod;
    error?: string;
  }
  const browserAudioPlaybackRecords: BrowserAudioPlaybackRecord[] = [];
  const browserAudioPlaybackTimers = new Map<string, NodeJS.Timeout>();
  const recordBrowserAudioPlayback = (input: { runId: string; alertId: string; output: 'interaction' | 'twitch'; state: 'started' | 'failed'; method: BrowserAudioPlaybackMethod; error?: string }): BrowserAudioPlaybackRecord => {
    let record = browserAudioPlaybackRecords.find((entry) => entry.runId === input.runId && entry.output === input.output);
    const now = new Date();
    if (!record) {
      record = { runId: input.runId, alertId: input.alertId, output: input.output, state: 'pending', expectedAt: now.toISOString() };
      browserAudioPlaybackRecords.unshift(record);
    }
    const timer = browserAudioPlaybackTimers.get(`${input.output}:${input.runId}`);
    if (timer) clearTimeout(timer);
    browserAudioPlaybackTimers.delete(`${input.output}:${input.runId}`);
    if (!(record.state === 'started' && input.state === 'failed')) {
      record.state = input.state;
      record.method = input.method;
      record.confirmedAt = now.toISOString();
      record.latencyMs = Math.max(0, now.getTime() - new Date(record.expectedAt).getTime());
      if (input.error) record.error = input.error.slice(0, 500);
      else delete record.error;
    }
    browserAudioPlaybackRecords.splice(200);
    return structuredClone(record);
  };
  const expectBrowserAudioPlayback = (output: 'interaction' | 'twitch', event: TempestVisualAlertEvent): void => {
    const key = `${output}:${event.runId}`;
    const existingTimer = browserAudioPlaybackTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    let record = browserAudioPlaybackRecords.find((entry) => entry.runId === event.runId && entry.output === output);
    if (!record) {
      record = { runId: event.runId, alertId: event.alertId, output, state: 'pending', expectedAt: new Date().toISOString() };
      browserAudioPlaybackRecords.unshift(record);
      browserAudioPlaybackRecords.splice(200);
    }
    const configuredDelayMs = Math.max(0, Math.min(60_000, Number(event.design?.soundDelayMs) || 0));
    const confirmationWindowMs = configuredDelayMs + 15_000;
    const timer = setTimeout(() => {
      const failed = recordBrowserAudioPlayback({ runId: event.runId, alertId: event.alertId, output, state: 'failed', method: 'watchdog', error: `Browser Source did not confirm audio playback within ${confirmationWindowMs / 1_000} seconds, including the configured sound delay.` });
      workflowEngine?.recordExternalEvent('alert.audio.browser.failed', 'error', `${output === 'twitch' ? 'Twitch' : 'Interaction'} Alert audio did not start in the Browser Source.`, { playback: failed });
    }, confirmationWindowMs);
    timer.unref?.();
    browserAudioPlaybackTimers.set(key, timer);
  };
  const visualAlerts = new TempestVisualAlertOverlay((event) => expectBrowserAudioPlayback('interaction', event));
  const twitchAlertOverlay = new TempestVisualAlertOverlay((event) => expectBrowserAudioPlayback('twitch', event));
  const twitchVisualAlerts = new TempestTwitchVisualAlertCatalog(options.dataDirectory);
  await twitchVisualAlerts.initialize();
  const alertHistory = new TempestAlertHistory(options.dataDirectory);
  await alertHistory.initialize();
  const chatOverlay = new TempestChatOverlay(options.dataDirectory);
  await chatOverlay.initialize();
  const emoteWall = new TempestEmoteWall(options.dataDirectory, options.emoteProviderFetchImplementation);
  await emoteWall.initialize();
  const twitchExperiences = new TempestTwitchExperiences(options.dataDirectory, () => extensionRelay?.syncCatalog());
  await twitchExperiences.initialize();
  const discordVoiceOverlay = new TempestDiscordVoiceOverlay(options.dataDirectory);
  await discordVoiceOverlay.initialize();
  const diceOverlay = new TempestDiceOverlay(options.dataDirectory);
  await diceOverlay.initialize();
  const stageActors = new TempestStageActorCatalog(options.dataDirectory);
  await stageActors.initialize();
  const interactiveStage = new TempestInteractiveStage(options.dataDirectory);
  await interactiveStage.initialize();
  const unifiedStage = new TempestUnifiedStage(options.dataDirectory);
  await unifiedStage.initialize();
  const interactiveWorld = new TempestInteractiveWorld(options.dataDirectory, interactiveStage, stageActors);
  await interactiveWorld.initialize();
  const interactionComposer = new TempestInteractionComposer(options.dataDirectory);
  await interactionComposer.initialize();
  const extensionFeatures = new TempestExtensionFeaturePlacements(options.dataDirectory);
  await extensionFeatures.initialize();
  const tobiiAdapter = new TempestTobiiAdapter(options.tobiiAdapterPath, async (sample) => {
    const gaze = interactiveWorld.status().gaze;
    if (!gaze.enabled || gaze.adapter !== 'tgi-sidecar') await interactiveWorld.configureGaze({ enabled: true, adapter: 'tgi-sidecar', effect: gaze.effect });
    await interactiveWorld.sampleGaze(sample);
  });
  const extensionDiceViewerUses = new Map<string, number>();
  let extensionDiceGlobalUse = 0;
  dispatchChatDice = async (request) => {
    const roll = await diceOverlay.roll({ expression: request.expression, reason: request.reason, rollerName: request.rollerName });
    workflowEngine?.recordExternalEvent('studio.dice.chat-rolled', 'success', `${roll.rollerName} rolled ${roll.expression} from chat.`, {
      rollId: roll.id,
      expression: roll.expression,
      total: roll.total,
      reason: roll.reason,
      rollerName: roll.rollerName
    });
    return { expression: roll.expression, total: roll.total, reason: roll.reason };
  };
  let alertQueue: TempestAlertQueue | undefined;
  let runtime!: TempestBridgeRuntime;

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

  const alertAssetAvailabilityCache = new Map<string, { available: boolean; checkedAt: number }>();
  const alertAssetAvailabilityCacheTtlMs = 30_000;
  const alertAssetAvailable = async (uri: string): Promise<boolean> => {
    const now = Date.now();
    const cached = alertAssetAvailabilityCache.get(uri);
    if (cached && now - cached.checkedAt < alertAssetAvailabilityCacheTtlMs) return cached.available;
    let available = false;
    try {
      const details = await stat(fileURLToPath(uri));
      available = details.isFile();
    } catch { /* Missing or invalid alert media is reported by diagnostics below. */ }
    alertAssetAvailabilityCache.set(uri, { available, checkedAt: now });
    return available;
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
    const assignedUris = new Set(assets.map((asset) => asset.uri));
    for (const uri of alertAssetAvailabilityCache.keys()) if (!assignedUris.has(uri)) alertAssetAvailabilityCache.delete(uri);
    const issues: Array<{ severity: 'error'; kind: 'interaction' | 'twitch'; alertId: string; alertName: string; variantId?: string; role: 'audio' | 'visual'; message: string }> = [];
    await Promise.all(assets.map(async (asset) => {
      if (!await alertAssetAvailable(asset.uri)) {
        issues.push({ severity: 'error', kind: asset.kind, alertId: asset.alertId, alertName: asset.alertName, ...(asset.variantId ? { variantId: asset.variantId } : {}), role: asset.role, message: `${asset.role === 'audio' ? 'Sound' : 'Visual'} file is unavailable.` });
      }
    }));
    const output = visualAlertOutputStatus();
    const browserAudioStarted = browserAudioPlaybackRecords.filter((record) => record.state === 'started');
    const browserAudioFailed = browserAudioPlaybackRecords.filter((record) => record.state === 'failed');
    const browserAudioPending = browserAudioPlaybackRecords.filter((record) => record.state === 'pending');
    return {
      generatedAt: new Date().toISOString(),
      history: alertHistory.summary(),
      configured: { interactionAlerts: interactionAlerts.length, twitchAlerts: twitchAlerts.length, variants: twitchAlerts.reduce((sum, alert) => sum + (alert.alertVariants?.length || 0), 0), assignedAssets: assets.length, unavailableAssets: issues.length },
      sources: {
        interactionClients: output.interaction.connectedClients,
        interactionAudioClients: output.interaction.connectedAudioClients,
        twitchClients: output.twitch.connectedClients,
        twitchAudioClients: output.twitch.connectedAudioClients
      },
      audioPlayback: {
        lane: 'dedicated-loopback',
        pending: browserAudioPending.length,
        started: browserAudioStarted.length,
        failed: browserAudioFailed.length,
        ...(browserAudioStarted[0]?.confirmedAt ? { lastStartedAt: browserAudioStarted[0].confirmedAt } : {}),
        ...(browserAudioFailed[0]?.confirmedAt ? { lastFailureAt: browserAudioFailed[0].confirmedAt } : {}),
        latest: browserAudioPlaybackRecords.slice(0, 20).map((record) => structuredClone(record))
      },
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
        tempest2dEnabled: Boolean(alert.tempest2dEnabled),
        tempest2dAction: alert.tempest2dAction,
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
        browserClients: twitchAlertOverlay.status('').connectedAudioClients,
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
    const observedViewer = await interactiveWorld.observeChat(event);
    if (observedViewer) broadcastSystemEvent('interactive-world.viewer.present', { viewer: observedViewer });
    if (event.topic === 'viewer.chat.message') {
      const command = String(event.payload.text || '').trim().split(/\s+/)[0]?.toLowerCase();
      if (command?.startsWith('!')) {
        const context = { source: event.source === 'kick' ? 'kick.chat' : 'twitch.chat', viewerKey: observedViewer?.key, viewerName: event.viewer?.displayName || event.viewer?.login, input: String(event.payload.text || ''), eventId: event.id };
        const recipes = await interactionComposer.handle('chat-command', command, context);
        for (const outcome of recipes) workflowEngine!.recordExternalEvent('interaction-composer.triggered', outcome.error ? 'warning' : 'success', outcome.error || `Interaction recipe ${outcome.recipeId} ran from chat.`, { outcome, eventId: event.id });
        try { await interactiveWorld.handleGameChat(event); }
        catch (error) { workflowEngine!.recordExternalEvent('interactive-world.chat-command.failed', 'warning', (error as Error).message, { eventId: event.id, command }); }
      }
    }
    broadcastSystemEvent(event.topic, event);
    chatOverlay.push(event);
    if (event.source === 'twitch' && event.topic === 'viewer.raid.received') {
      const raidAutomation = await chatbot.processRaidEvent(event);
      workflowEngine!.recordExternalEvent('chatbot.raid-automation', raidAutomation.error ? 'warning' : 'success', raidAutomation.error || `Raid automation handled ${event.payload.fromBroadcasterName}.`, { raidAutomation });
    }
    if (event.source === 'twitch') {
      emoteWall.push(event);
      twitchExperiences.ingest(event);
      const avatarRedemption = event.topic === 'viewer.reward.redeemed' ? await interactiveWorld.applyAvatarChannelPointRedemption(event) : undefined;
      if (avatarRedemption) workflowEngine!.recordExternalEvent('interactive-world.avatar-reward.applied', 'success', `${avatarRedemption.viewerName} redeemed ${avatarRedemption.rewardTitle || avatarRedemption.redeemId}.`, { avatarRedemption, eventId: event.id });
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
        audioRoute: !prepared.alert.audioUri ? 'none' : prepared.alert.broadcastAudioSource ? 'broadcast-source' : visualAlerts.status('').connectedAudioClients ? 'browser-source' : options.soundAlertPlayback ? 'studio-local' : 'none',
        browserClients: visualAlerts.status('').connectedAudioClients,
        preview: request.source === 'studio.operator'
      },
      onAccepted: () => soundAlerts.commit(prepared),
      execute: async () => {
        const counter = prepared.alert.counterCommandId
          ? await chatbot.adjustCounter(prepared.alert.counterCommandId, prepared.alert.counterDelta ?? 1, request.source)
          : undefined;
        if (counter) prepared.payload.counter = counter;
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
        const sceneDesign = resolveTwitchAlertDesignForScene(prepared.alert.design, sceneName);
        const placement = prepared.alert.placementMode === 'viewer' && request.placement
          ? { x: Math.max(0, Math.min(1, Number(request.placement.x))), y: Math.max(0, Math.min(1, Number(request.placement.y))) }
          : undefined;
        const browserAlert = prepared.alert.broadcastAudioSource ? { ...prepared.alert, audioUri: undefined } : prepared.alert;
        const activeVisualAlert = visualAlerts.show(browserAlert, request.viewerName, run.id, true, placement ? { ...sceneDesign, position: 'custom', customPositionX: placement.x * 100, customPositionY: placement.y * 100 } : sceneDesign, false, sceneName);
        workflowEngine!.recordExternalEvent('sound-alert.triggered', 'success', `${prepared.alert.name} started from the Alert Queue.`, {
          alertId: prepared.alert.id,
          eventId: prepared.eventId,
          runId: run.id,
          source: request.source,
          free: true
        });
        broadcastSystemEvent('sound-alert.triggered', { alert: prepared.alert, eventId: prepared.eventId, run });
        const browserSourceOwnsAudio = Boolean(activeVisualAlert.audioUrl && visualAlerts.hasAudioClients());
        const separateBroadcastSourceOwnsAudio = Boolean(prepared.alert.broadcastAudioSource);
        if (options.soundAlertPlayback && !browserSourceOwnsAudio && !separateBroadcastSourceOwnsAudio) {
          Promise.resolve(options.soundAlertPlayback({ phase: 'play', runId: run.id, alert: prepared.alert })).catch((error) => {
            workflowEngine!.recordExternalEvent('sound-alert.audio.failed', 'error', `Local audio playback failed for ${prepared.alert.name}: ${(error as Error).message}`, {
              alertId: prepared.alert.id,
              runId: run.id
            });
          });
        }
        return { run, activeVisualAlert, ...(counter ? { counter } : {}) };
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

  interactionComposer.setDispatcher(async (action, context) => {
    const settings = action.settings;
    if (action.type === 'alert') return triggerSoundAlert(String(settings.alertId || settings.cue || ''), { source: 'studio.operator', viewerName: context.viewerName, viewerId: context.viewerKey, simulateMissing: false });
    if (action.type === 'stage-message') return interactiveStage.spawn({
      kind: 'text', state: 'emote', lifetimeMs: Number(settings.durationMs) || 6_000,
      placement: { x: Number(settings.x ?? 0.5), y: Number(settings.y ?? 0.5), scale: Number(settings.scale ?? 1), anchor: 'center', layer: 60 },
      properties: { glyph: String(settings.glyph || 'EVENT'), label: String(settings.message || context.input || 'Viewer interaction'), accent: String(settings.accent || '#54F2EB') }
    });
    if (action.type === 'viewer-state') {
      if (!context.viewerKey) throw new Error('This recipe needs a viewer identity for its avatar action.');
      return interactiveWorld.setViewerState(context.viewerKey, { state: settings.state || 'emote' });
    }
    if (action.type === 'viewer-attack') return interactiveWorld.viewerAttack({ platform: context.source.startsWith('kick') ? 'kick' : 'twitch', viewerId: context.viewerKey?.split(':').slice(1).join(':') || 'composer', viewerName: context.viewerName, x: settings.x, y: settings.y, intensity: settings.intensity, bypassCooldown: true });
    if (action.type === 'pet-action') return interactiveWorld.petAction(settings.action || 'play', context.viewerName);
    if (action.type === 'battle-start') return interactiveWorld.startBattle({ mode: settings.mode || 'duel', inviteOnly: settings.inviteOnly === true, bossName: settings.bossName });
    throw new Error(`Unsupported Interaction Composer action: ${action.type}.`);
  });

  const serveAlertAudio = async (request: IncomingMessage, response: ServerResponse, requestUrl: URL): Promise<boolean> => {
    const alertAudioMatch = requestUrl.pathname.match(/^\/visual-alerts\/audio\/([^/]+)$/);
    if (request.method !== 'GET' || !alertAudioMatch) return false;
    if (!isLoopbackRequest(request)) {
      sendJson(response, 403, { error: 'Visual Alerts audio is available only on this computer.' });
      return true;
    }
    const audioId = decodeURIComponent(alertAudioMatch[1]);
    const selectedVariantId = requestUrl.searchParams.get('variant') || undefined;
    const alert = soundAlerts.find(audioId) || twitchVisualAlerts.resolveVariant(audioId, selectedVariantId);
    if (!alert?.audioUri) {
      sendJson(response, 404, { error: 'No local audio is assigned to this alert.' });
      return true;
    }
    const filePath = fileURLToPath(alert.audioUri);
    const details = await stat(filePath);
    if (!details.isFile()) {
      sendJson(response, 404, { error: 'The assigned audio file is unavailable.' });
      return true;
    }
    const contentType = audioMediaTypes[path.extname(filePath).toLowerCase()];
    if (!contentType) {
      sendJson(response, 415, { error: 'The assigned audio format is not supported.' });
      return true;
    }
    const rangeMatch = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    let start = 0;
    let end = details.size - 1;
    if (rangeMatch) {
      start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
      end = rangeMatch[2] ? Number(rangeMatch[2]) : end;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= details.size) {
        response.statusCode = 416;
        response.setHeader('Content-Range', `bytes */${details.size}`);
        response.end();
        return true;
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
    const requestOrigin = request.headers.origin || '';
    if (/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(requestOrigin)) response.setHeader('Access-Control-Allow-Origin', requestOrigin);
    createReadStream(filePath, { start, end }).pipe(response);
    return true;
  };

  let alertAudioBaseUrl = '';

  const connectionsSnapshot = () => ({
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
      if (request.method === 'GET' && requestUrl.pathname === '/unified-stage') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Unified Stage is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self' http://127.0.0.1:* http://localhost:* about:;");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(unifiedStage.page());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/unified-stage/events') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Unified Stage is available only on this computer.' });
        unifiedStage.connect(response);
        return;
      }
      const visualAlertPageRoute = requestUrl.pathname === '/visual-alerts' || requestUrl.pathname === '/visual-alerts/interactions'
        ? { overlay: visualAlerts, eventsPath: '/visual-alerts/interactions/events', output: 'interaction' as const }
        : requestUrl.pathname === '/visual-alerts/twitch'
          ? { overlay: twitchAlertOverlay, eventsPath: '/visual-alerts/twitch/events', output: 'twitch' as const }
          : undefined;
      if (request.method === 'GET' && visualAlertPageRoute) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Visual Alerts overlay is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ${alertAudioBaseUrl}; img-src 'self' data:; media-src 'self' ${alertAudioBaseUrl} blob:;`);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(visualAlertPageRoute.overlay.page(visualAlertPageRoute.eventsPath, alertAudioBaseUrl, visualAlertPageRoute.output));
      }
      const visualAlertEventsOverlay = requestUrl.pathname === '/visual-alerts/events' || requestUrl.pathname === '/visual-alerts/interactions/events'
        ? visualAlerts
        : requestUrl.pathname === '/visual-alerts/twitch/events'
          ? twitchAlertOverlay
          : undefined;
      if (request.method === 'GET' && visualAlertEventsOverlay) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Visual Alerts overlay is available only on this computer.' });
        visualAlertEventsOverlay.connect(response, requestUrl.searchParams.get('orientation') === 'vertical' ? 'vertical' : 'horizontal', requestUrl.searchParams.get('audio') !== '0');
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
      if (request.method === 'GET' && requestUrl.pathname === '/poll-overlay') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Poll Overlay is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(pollOverlayPage());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/poll-overlay/status') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Poll Overlay is available only on this computer.' });
        return sendJson(response, 200, { schemaVersion: 1, poll: chatbot.status().poll });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/interactive-stage') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Interactive Stage is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(interactiveStage.page());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/interactive-stage/events') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Interactive Stage is available only on this computer.' });
        interactiveStage.connect(response, requestUrl.searchParams.get('orientation') === 'vertical' ? 'vertical' : 'horizontal');
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/interactive-stage/world-event') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Stage world events are available only on this computer.' });
        return sendJson(response, 202, { worldState: await interactiveStage.worldEvent(await readJson(request)) });
      }
      const stageActorAssetMatch = requestUrl.pathname.match(/^\/interactive-stage\/actors\/([^/]+)\/([^/]+)$/);
      if (request.method === 'GET' && stageActorAssetMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Stage Actor assets are available only on this computer.' });
        const packId = decodeURIComponent(stageActorAssetMatch[1]);
        const assetName = decodeURIComponent(stageActorAssetMatch[2]);
        if (assetName === 'rig.json') {
          const rig = stageActors.rendererRig(packId);
          return rig ? sendJson(response, 200, rig) : sendJson(response, 404, { error: 'The Stage Actor rig was not found.' });
        }
        const served = await stageActors.serveAsset(packId, assetName, response);
        if (!served) return sendJson(response, 404, { error: 'The Stage Actor asset was not found.' });
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
      if (request.method === 'GET' && requestUrl.pathname === '/dice-overlay') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The 3D Dice overlay is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src blob: data:; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:;");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(diceOverlay.page());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/dice-overlay/client.js') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The 3D Dice overlay is available only on this computer.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(diceOverlay.client());
      }
      const diceBoxVendorMatch = requestUrl.pathname.match(/^\/dice-overlay\/vendor\/(dice-box\.es(?:\.min)?\.js|Dice(?:\.min)?\.js|world\.(?:offscreen|onscreen|none)(?:\.min)?\.js)$/);
      if (request.method === 'GET' && diceBoxVendorMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Dice Box is available only on this computer.' });
        await serveDiceBoxFile(response, path.join(diceBoxDistributionDirectory, diceBoxVendorMatch[1]));
        return;
      }
      const diceBoxAssetMatch = requestUrl.pathname.match(/^\/dice-overlay\/assets\/(.+)$/);
      if (request.method === 'GET' && diceBoxAssetMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Dice Box assets are available only on this computer.' });
        const relativePath = decodeURIComponent(diceBoxAssetMatch[1]).replace(/\\/g, '/');
        if (!relativePath || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return sendJson(response, 400, { error: 'The Dice Box asset path is invalid.' });
        const themeMatch = relativePath.match(/^themes\/([a-z][a-z0-9_-]{0,63})\/(.+)$/i);
        const bundledThemeIds = new Set(['smooth', 'gemstone', 'gemstoneMarble', 'rock', 'rust', 'wooden', 'diceOfRolling', 'blueGreenMetal']);
        let filePath: string;
        if (themeMatch?.[1] === 'default') {
          filePath = path.resolve(diceBoxAssetsDirectory, 'themes', 'default', ...themeMatch[2].split('/'));
          if (!filePath.startsWith(`${path.resolve(diceBoxAssetsDirectory)}${path.sep}`)) return sendJson(response, 403, { error: 'The Dice Box asset path is outside the bundled asset directory.' });
        } else if (themeMatch && bundledThemeIds.has(themeMatch[1])) {
          filePath = path.resolve(diceThemeAssetsDirectory, themeMatch[1], ...themeMatch[2].split('/'));
          if (!filePath.startsWith(`${path.resolve(diceThemeAssetsDirectory)}${path.sep}`)) return sendJson(response, 403, { error: 'The Dice Box asset path is outside the bundled asset directory.' });
        } else if (themeMatch) {
          const customAsset = diceOverlay.resolveCustomThemeAsset(themeMatch[1], themeMatch[2].split('/'));
          if (!customAsset) return sendJson(response, 404, { error: 'The imported Dice Box theme is unavailable.' });
          filePath = customAsset;
        } else {
          filePath = path.resolve(diceBoxAssetsDirectory, ...relativePath.split('/'));
          if (!filePath.startsWith(`${path.resolve(diceBoxAssetsDirectory)}${path.sep}`)) return sendJson(response, 403, { error: 'The Dice Box asset path is outside the bundled asset directory.' });
        }
        await serveDiceBoxFile(response, filePath);
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/dice-overlay/events') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The 3D Dice overlay is available only on this computer.' });
        diceOverlay.connect(response);
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/dice-overlay/poll') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: '3D Dice polling is available only on this computer.' });
        return sendJson(response, 200, await diceOverlay.pollAsync(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/dice-overlay/result') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: '3D Dice results are accepted only from this computer.' });
        const roll = diceOverlay.complete(await readJson(request));
        return sendJson(response, 200, { roll });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/dice-overlay/error') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: '3D Dice failures are accepted only from this computer.' });
        diceOverlay.fail(await readJson(request));
        return sendJson(response, 200, { ok: true });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/dice-overlay/client-status') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: '3D Dice status is accepted only from this computer.' });
        return sendJson(response, 200, { client: diceOverlay.reportClient(await readJson(request)) });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/dice-overlay/audio-status') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: '3D Dice audio status is accepted only from this computer.' });
        return sendJson(response, 200, { audio: diceOverlay.reportAudio(await readJson(request)) });
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
      if (await serveAlertAudio(request, response, requestUrl)) return;
      if (requestToken(request, requestUrl) !== token) return sendJson(response, 401, { error: 'A valid Tempest Bridge token is required.' });

      if (request.method === 'GET' && requestUrl.pathname === '/v1/runtime-summary') {
        const broadcast = connectedBroadcast();
        return sendJson(response, 200, {
          health: health(),
          connections: connectionsSnapshot().connections,
          dualFormat: dualFormatSnapshot(broadcast),
          simulcast: simulcastSnapshot(broadcast),
          runs: workflowEngine.listRuns(50),
          safety: workflowEngine.safetyState()
        });
      }

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
      if (request.method === 'GET' && requestUrl.pathname === '/v1/extension-features') {
        return sendJson(response, 200, { schemaVersion: 1, features: extensionFeatures.list(extensionFeatureDefinitions()) });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/extension-features/reset') {
        const features = await extensionFeatures.reset(extensionFeatureDefinitions());
        extensionRelay?.refreshCatalog();
        broadcastSystemEvent('twitch.extension.feature-placement.reset', { featureCount: features.length });
        return sendJson(response, 200, { schemaVersion: 1, features });
      }
      const extensionFeatureMatch = requestUrl.pathname.match(/^\/v1\/extension-features\/([^/]+)$/);
      if (request.method === 'POST' && extensionFeatureMatch) {
        const feature = await extensionFeatures.update(decodeURIComponent(extensionFeatureMatch[1]), await readJson(request), extensionFeatureDefinitions());
        extensionRelay?.refreshCatalog();
        broadcastSystemEvent('twitch.extension.feature-placement.updated', { id: feature.id, destinations: feature.destinations });
        return sendJson(response, 200, { feature });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/sound-alerts') {
        const alert = await soundAlerts.create(await readJson(request));
        extensionRelay?.refreshCatalog();
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
      if (request.method === 'GET' && requestUrl.pathname === '/v1/unified-stage') {
        return sendJson(response, 200, unifiedStage.status(runtime.baseUrl));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/unified-stage/settings') {
        const settings = await unifiedStage.update(await readJson(request));
        return sendJson(response, 200, { settings, ...unifiedStage.status(runtime.baseUrl) });
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
      if (request.method === 'GET' && requestUrl.pathname === '/v1/interactive-stage') {
        return sendJson(response, 200, interactiveStage.status(runtime.baseUrl));
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/stage-actors') {
        return sendJson(response, 200, stageActors.status(runtime.baseUrl));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/stage-actors/reload') {
        const catalog = await stageActors.reload();
        const refreshedViewers = interactiveWorld.refreshActorPackRenders();
        return sendJson(response, 200, { ...catalog, refreshedViewers, packs: stageActors.status(runtime.baseUrl).packs });
      }
      const stageActorPackMatch = requestUrl.pathname.match(/^\/v1\/stage-actors\/([^/]+)$/);
      if (request.method === 'DELETE' && stageActorPackMatch) {
        const packId = decodeURIComponent(stageActorPackMatch[1]);
        const removed = await stageActors.remove(packId);
        if (!removed) return sendJson(response, 404, { error: 'Stage Actor pack not found.' });
        const affectedViewers = await interactiveWorld.removeActorPackReferences(packId);
        return sendJson(response, 200, { removed: true, affectedViewers, ...stageActors.status(runtime.baseUrl) });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/interactive-world') {
        return sendJson(response, 200, interactiveWorld.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/avatar-redeems') {
        const avatarChannelPointRedeems = await interactiveWorld.configureAvatarChannelPointRedeems(await readJson(request));
        return sendJson(response, 200, { avatarChannelPointRedeems, ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/avatar-redeems/test') {
        const body = await readJson(request) as Record<string, unknown>;
        const redeem = (interactiveWorld.status().avatarChannelPointRedeems || []).find((entry) => entry.id === String(body.redeemId || ''));
        if (!redeem) return sendJson(response, 404, { error: 'Avatar Channel Point redeem not found.' });
        const occurredAt = new Date().toISOString();
        const applied = await interactiveWorld.applyAvatarChannelPointRedemption({
          schemaVersion: 1,
          id: `avatar-redeem-test-${globalThis.crypto.randomUUID()}`,
          topic: 'viewer.reward.redeemed',
          occurredAt,
          source: 'twitch',
          channel: { id: twitchGateway.status().oauth.account?.userId || 'studio-test' },
          viewer: { id: String(body.viewerId || 'avatar-redeem-test'), displayName: String(body.viewerName || 'Redeem Tester').slice(0, 80) },
          payload: { redemptionId: `test-${globalThis.crypto.randomUUID()}`, rewardId: redeem.rewardId || '', rewardTitle: redeem.rewardTitle || redeem.name, rewardCost: 0 }
        });
        return sendJson(response, 202, { applied, ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/avatar-redeems/reset-session') {
        const resetViewers = await interactiveWorld.resetAvatarRewardSession();
        return sendJson(response, 200, { resetViewers, ...interactiveWorld.status() });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/interaction-composer') {
        return sendJson(response, 200, interactionComposer.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interaction-composer/recipes') {
        const recipe = await interactionComposer.save(await readJson(request));
        return sendJson(response, 200, { recipe, ...interactionComposer.status() });
      }
      const interactionRecipeRunMatch = requestUrl.pathname.match(/^\/v1\/interaction-composer\/recipes\/([^/]+)\/run$/);
      if (request.method === 'POST' && interactionRecipeRunMatch) {
        const body = await readJson(request) as Record<string, unknown>;
        return sendJson(response, 202, await interactionComposer.trigger(decodeURIComponent(interactionRecipeRunMatch[1]), { source: 'studio.operator', viewerKey: typeof body.viewerKey === 'string' ? body.viewerKey : undefined, viewerName: typeof body.viewerName === 'string' ? body.viewerName : 'Studio Operator', input: typeof body.input === 'string' ? body.input : undefined }, true));
      }
      const interactionRecipeMatch = requestUrl.pathname.match(/^\/v1\/interaction-composer\/recipes\/([^/]+)$/);
      if (request.method === 'DELETE' && interactionRecipeMatch) {
        const id = decodeURIComponent(interactionRecipeMatch[1]);
        const removed = await interactionComposer.remove(id);
        return sendJson(response, removed ? 200 : 404, removed ? { removed, id, ...interactionComposer.status() } : { error: 'Interaction recipe not found.' });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/safety') {
        return sendJson(response, 200, await interactiveWorld.updateSafety(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/presence/settings') {
        return sendJson(response, 200, await interactiveWorld.updatePresence(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/presence/sweep') {
        return sendJson(response, 200, { ...(await interactiveWorld.sweepPresence()), ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/viewers') {
        const viewer = await interactiveWorld.joinViewer(await readJson(request));
        broadcastSystemEvent('interactive-world.viewer.joined', { viewer });
        return sendJson(response, 201, { viewer, ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/viewers/clear') {
        const removed = await interactiveWorld.clearViewers();
        return sendJson(response, 200, { removed, ...interactiveWorld.status() });
      }
      const worldViewerStateMatch = requestUrl.pathname.match(/^\/v1\/interactive-world\/viewers\/([^/]+)\/state$/);
      if (request.method === 'POST' && worldViewerStateMatch) {
        const viewer = await interactiveWorld.setViewerState(decodeURIComponent(worldViewerStateMatch[1]), await readJson(request));
        return sendJson(response, 200, { viewer, ...interactiveWorld.status() });
      }
      const worldViewerControlMatch = requestUrl.pathname.match(/^\/v1\/interactive-world\/viewers\/([^/]+)\/control$/);
      if (request.method === 'POST' && worldViewerControlMatch) {
        const control = await interactiveWorld.controlViewer(decodeURIComponent(worldViewerControlMatch[1]), await readJson(request));
        broadcastSystemEvent('interactive-world.viewer.controlled', control);
        return sendJson(response, 202, { control, ...interactiveWorld.status() });
      }
      const worldViewerActorMatch = requestUrl.pathname.match(/^\/v1\/interactive-world\/viewers\/([^/]+)\/actor$/);
      if (request.method === 'POST' && worldViewerActorMatch) {
        const viewer = await interactiveWorld.setViewerActor(decodeURIComponent(worldViewerActorMatch[1]), await readJson(request));
        return sendJson(response, 200, { viewer, ...interactiveWorld.status() });
      }
      const worldViewerCosmeticsMatch = requestUrl.pathname.match(/^\/v1\/interactive-world\/viewers\/([^/]+)\/cosmetics$/);
      if (request.method === 'POST' && worldViewerCosmeticsMatch) {
        const viewer = await interactiveWorld.setViewerCosmetics(decodeURIComponent(worldViewerCosmeticsMatch[1]), await readJson(request));
        return sendJson(response, 200, { viewer, ...interactiveWorld.status() });
      }
      const worldViewerMatch = requestUrl.pathname.match(/^\/v1\/interactive-world\/viewers\/([^/]+)$/);
      if (request.method === 'DELETE' && worldViewerMatch) {
        const key = decodeURIComponent(worldViewerMatch[1]);
        const removed = await interactiveWorld.removeViewer(key);
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true, key, ...interactiveWorld.status() } : { error: 'The viewer profile was not found.' });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/pet/settings') {
        await interactiveWorld.updatePet(await readJson(request));
        return sendJson(response, 200, interactiveWorld.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/pet/actions') {
        const body = await readJson(request) as { action?: unknown; actor?: unknown };
        const pet = await interactiveWorld.petAction(body.action, body.actor);
        broadcastSystemEvent('interactive-world.pet.action', { action: body.action, actor: body.actor });
        return sendJson(response, 202, { ...interactiveWorld.status(), pet });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/battle/start') {
        const battle = await interactiveWorld.startBattle(await readJson(request));
        broadcastSystemEvent('interactive-world.battle.started', { battle });
        return sendJson(response, 201, { battle, ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/battle/action') {
        const battle = await interactiveWorld.battleAction(await readJson(request));
        broadcastSystemEvent('interactive-world.battle.action', { battleId: battle.id, state: battle.state });
        return sendJson(response, 202, { battle, ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/battle/accept') {
        const body = await readJson(request) as { viewerKey?: unknown };
        const battle = await interactiveWorld.acceptBattle(body.viewerKey);
        return sendJson(response, 202, { battle, ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/viewer-attack') {
        const object = await interactiveWorld.viewerAttack(await readJson(request));
        broadcastSystemEvent('interactive-world.viewer-attack', { object });
        return sendJson(response, 202, { object, ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/battle/end') {
        const body = await readJson(request) as { reason?: unknown };
        const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 80) : 'operator';
        const battle = await interactiveWorld.endBattle(reason);
        return sendJson(response, 200, { battle, ...interactiveWorld.status() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/gaze/settings') {
        await interactiveWorld.configureGaze(await readJson(request));
        return sendJson(response, 200, interactiveWorld.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/gaze/sample') {
        await interactiveWorld.sampleGaze(await readJson(request));
        return sendJson(response, 202, interactiveWorld.status());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/interactive-world/gaze/adapter') {
        return sendJson(response, 200, tobiiAdapter.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/gaze/adapter/connect') {
        await interactiveWorld.configureGaze({ enabled: true, adapter: 'tgi-sidecar' });
        return sendJson(response, 200, await tobiiAdapter.connect());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-world/gaze/adapter/disconnect') {
        return sendJson(response, 200, await tobiiAdapter.disconnect());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-stage/objects') {
        return sendJson(response, 201, { object: interactiveStage.spawn(await readJson(request)), ...interactiveStage.status(runtime.baseUrl) });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-stage/layout') {
        await interactiveStage.configureLayout(await readJson(request));
        return sendJson(response, 200, interactiveStage.status(runtime.baseUrl));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-stage/preview') {
        return sendJson(response, 202, { object: interactiveStage.preview(), ...interactiveStage.status(runtime.baseUrl) });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/interactive-stage/clear') {
        const body = await readJson(request) as { reason?: unknown };
        const removed = interactiveStage.clear(typeof body.reason === 'string' ? body.reason.slice(0, 160) : 'operator');
        return sendJson(response, 200, { removed, ...interactiveStage.status(runtime.baseUrl) });
      }
      const stageMoveMatch = requestUrl.pathname.match(/^\/v1\/interactive-stage\/objects\/([^/]+)\/move$/);
      if (request.method === 'POST' && stageMoveMatch) {
        const body = await readJson(request) as { placement?: unknown };
        return sendJson(response, 200, { object: interactiveStage.move(decodeURIComponent(stageMoveMatch[1]), body.placement ?? body) });
      }
      const stageObjectMatch = requestUrl.pathname.match(/^\/v1\/interactive-stage\/objects\/([^/]+)$/);
      if (request.method === 'POST' && stageObjectMatch) {
        return sendJson(response, 200, { object: interactiveStage.update(decodeURIComponent(stageObjectMatch[1]), await readJson(request)) });
      }
      if (request.method === 'DELETE' && stageObjectMatch) {
        const id = decodeURIComponent(stageObjectMatch[1]);
        const removed = interactiveStage.dismiss(id);
        return sendJson(response, removed ? 200 : 404, removed ? { removed: true, id } : { error: 'The Stage object was not found.' });
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
      if (request.method === 'GET' && requestUrl.pathname === '/v1/dice-overlay') {
        return sendJson(response, 200, diceOverlay.status(`${runtime.baseUrl}/dice-overlay`));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/dice-overlay/settings') {
        const settings = await diceOverlay.update(await readJson(request));
        return sendJson(response, 200, { settings });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/dice-overlay/themes/refresh') {
        return sendJson(response, 200, { themes: await diceOverlay.refreshThemes() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/dice-overlay/roll') {
        const roll = await diceOverlay.roll(await readJson(request));
        workflowEngine!.recordExternalEvent('studio.dice.rolled', 'success', `${roll.rollerName} rolled ${roll.expression}: ${roll.total}.`, { roll });
        return sendJson(response, 200, { roll, ...diceOverlay.status(`${runtime.baseUrl}/dice-overlay`) });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/dice-overlay/audio/test') {
        return sendJson(response, 200, { audio: await diceOverlay.testAudio() });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/dice-overlay/clear') {
        diceOverlay.clear();
        workflowEngine!.recordExternalEvent('studio.dice.cleared', 'info', 'The operator cleared the 3D Dice Browser Source.', {});
        return sendJson(response, 200, diceOverlay.status(`${runtime.baseUrl}/dice-overlay`));
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
        const previewItem: TempestAlertQueueItem = { id: globalThis.crypto.randomUUID(), kind: 'twitch', alertId: alert.id, name: alert.name, source: 'studio.simulator', durationMs: alert.durationMs, state: 'playing', enqueuedAt: previewTime, startedAt: previewTime, diagnostics: { viewerName: 'Studio Operator', variantId: alert.selectedVariantId, variantName: alert.selectedVariantName, audioAssigned: Boolean(alert.audioUri), visualAssigned: Boolean(alert.visualUri), audioRoute: alert.audioUri ? 'browser-source' : 'none', browserClients: twitchAlertOverlay.status('').connectedAudioClients, preview: true } };
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
        const rawPlacement = body.placement;
        const placement = rawPlacement && typeof rawPlacement === 'object'
          ? { x: Number(rawPlacement.x), y: Number(rawPlacement.y) }
          : undefined;
        const result = await triggerSoundAlert(alertId, {
          source: body.source || 'api',
          eventId: body.eventId,
          viewerId: body.viewerId,
          viewerName: body.viewerName,
          intensity: body.intensity,
          ...(placement && Number.isFinite(placement.x) && placement.x >= 0 && placement.x <= 1 && Number.isFinite(placement.y) && placement.y >= 0 && placement.y <= 1 ? { placement } : {}),
          simulateMissing: body.simulateMissing,
          bypassCooldown: body.bypassCooldown
        });
        return sendJson(response, 202, result);
      }
      const soundAlertUpdateMatch = requestUrl.pathname.match(/^\/v1\/sound-alerts\/([^/]+)$/);
      if (request.method === 'POST' && soundAlertUpdateMatch) {
        const alert = await soundAlerts.update(decodeURIComponent(soundAlertUpdateMatch[1]), await readJson(request));
        extensionRelay?.refreshCatalog();
        broadcastSystemEvent('sound-alert.configuration.updated', { alert });
        return sendJson(response, 200, { alert });
      }
      if (request.method === 'DELETE' && soundAlertUpdateMatch) {
        const id = decodeURIComponent(soundAlertUpdateMatch[1]);
        const removed = await soundAlerts.remove(id);
        if (removed) extensionRelay?.refreshCatalog();
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
        const clearedStageObjects = interactiveStage.clear('emergency-stop');
        await interactiveWorld.emergencyStop();
        await options.soundAlertPlayback?.({ phase: 'stop-all' });
        broadcastSystemEvent('system.safety.disarmed', { stoppedRuns, clearedQueuedAlerts, clearedStageObjects });
        return sendJson(response, 200, { ...workflowEngine.safetyState(), stoppedRuns, clearedQueuedAlerts, clearedStageObjects });
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/safety/arm') {
        workflowEngine.arm();
        await interactiveWorld.updateSafety({ interactionsEnabled: true });
        broadcastSystemEvent('system.safety.armed', workflowEngine.safetyState());
        return sendJson(response, 200, workflowEngine.safetyState());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/integrations/twitch') {
        return sendJson(response, 200, twitchGateway.status());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/predictions/refresh') {
        return sendJson(response, 200, await twitchGateway.refreshPrediction());
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/predictions') {
        return sendJson(response, 201, await twitchGateway.createPrediction(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/predictions/end') {
        return sendJson(response, 200, await twitchGateway.endPrediction(await readJson(request)));
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
        return sendJson(response, 200, { ...chatbot.status(), pollOverlay: { state: 'ready', url: `${runtime.baseUrl}/poll-overlay` } });
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
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/poll/start') {
        return sendJson(response, 200, chatbot.startNumericPoll(await readJson(request)));
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chatbot/poll/stop') {
        return sendJson(response, 200, chatbot.stopNumericPoll());
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/chatbot/poll') {
        return sendJson(response, 200, chatbot.clearNumericPoll());
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
        const action = typeof event.payload.action === 'string' ? event.payload.action : undefined;
        const nativeWorldAction = action && interactiveWorldActionIds.has(action) ? action : undefined;
        const configuredAlert = nativeWorldAction ? undefined : typeof event.payload.alertId === 'string' ? soundAlerts.find(event.payload.alertId)
          : typeof event.payload.cue === 'string' ? soundAlerts.find(event.payload.cue)
            : action ? soundAlerts.find(action) : undefined;
        if (event.topic === 'viewer.interaction.requested' && action === 'tempest.poll.vote') {
          const pollId = String(event.payload.pollId || '').trim();
          const optionNumber = Number(event.payload.optionNumber);
          const vote = chatbot.recordNumericPollVote({
            pollId,
            optionNumber,
            voterId: String(event.viewer?.id || ''),
            source: 'twitch'
          });
          workflowEngine.recordExternalEvent(
            vote.accepted ? 'studio.poll.vote.accepted' : 'studio.poll.vote.ignored',
            vote.accepted ? 'success' : 'info',
            vote.accepted ? `Twitch viewer vote ${optionNumber} was recorded.` : `Twitch viewer poll vote was not recorded: ${vote.code}.`,
            { eventId: event.id, pollId, optionNumber, viewerId: event.viewer?.id, voteCode: vote.code }
          );
          const pollVoteErrors: Record<string, string> = {
            'poll-inactive': 'This poll is no longer accepting votes.',
            'stale-poll': 'The active poll changed before this vote arrived.',
            'invalid-option': 'That poll option is no longer available.',
            'identity-required': 'A verified Twitch identity is required to vote.',
            'already-voted': `This Twitch account already voted for option ${vote.optionNumber}.`
          };
          return sendJson(response, vote.accepted ? 202 : vote.duplicate ? 200 : 409, {
            accepted: vote.accepted,
            duplicate: vote.duplicate,
            code: vote.code.replaceAll('-', '_'),
            ...(!vote.accepted ? { error: pollVoteErrors[vote.code] || 'The poll vote was not accepted.' } : {}),
            optionNumber: vote.optionNumber,
            poll: vote.poll,
            eventId: event.id
          });
        }
        if (event.topic === 'viewer.interaction.requested') {
          const access = await chatbot.authorizeInteraction(event, configuredAlert);
          if (!access.allowed) {
            workflowEngine.recordExternalEvent('viewer.interaction.denied', 'warning', access.reason || 'Viewer interaction access was denied.', { eventId: event.id, viewerId: event.viewer?.id, accessCode: access.code });
            return sendJson(response, 403, { accepted: false, error: access.reason, code: access.code.replaceAll('-', '_'), eventId: event.id });
          }
        }
        const extensionDicePreset = event.topic === 'viewer.interaction.requested'
          ? extensionDicePresets.find((preset) => preset.id === action)
          : undefined;
        const extensionDiceMaximum = action === extensionDiceCustom.id ? Number(event.payload.maximum) : undefined;
        const extensionDiceExpression = extensionDicePreset?.expression || (Number.isInteger(extensionDiceMaximum) && extensionDiceMaximum! >= 2 && extensionDiceMaximum! <= 100 ? `1d${extensionDiceMaximum}` : undefined);
        if (action === extensionDiceCustom.id && !extensionDiceExpression) {
          return sendJson(response, 400, { accepted: false, error: 'Choose a custom dice maximum from 2 through 100.', code: 'dice_maximum_invalid', eventId: event.id });
        }
        if (extensionDiceExpression) {
          const now = Date.now();
          for (const [viewerId, usedAt] of extensionDiceViewerUses) {
            if (now - usedAt > extensionDiceViewerCooldownMs) extensionDiceViewerUses.delete(viewerId);
          }
          const viewerId = String(event.viewer?.id || 'anonymous');
          const retryAfterMs = Math.max(
            0,
            extensionDiceGlobalUse + extensionDiceGlobalCooldownMs - now,
            (extensionDiceViewerUses.get(viewerId) || 0) + extensionDiceViewerCooldownMs - now
          );
          if (retryAfterMs > 0) {
            return sendJson(response, 429, { accepted: false, error: `3D Dice is recharging for ${Math.ceil(retryAfterMs / 1000)} seconds.`, code: 'dice_cooldown', retryAfterMs, eventId: event.id });
          }
          const diceStatus = diceOverlay.status(`${runtime.baseUrl}/dice-overlay`) as { connectedClients?: number; rolling?: boolean; engine?: string; settings?: { enabled?: boolean }; clients?: Array<{ state?: string; error?: string }> };
          if (diceStatus.settings?.enabled !== true) return sendJson(response, 409, { accepted: false, error: 'The streamer has disabled 3D Dice.', code: 'dice_disabled', eventId: event.id });
          if (!diceStatus.connectedClients) return sendJson(response, 409, { accepted: false, error: 'The 3D Dice Browser Source is not connected.', code: 'dice_source_offline', eventId: event.id });
          if (diceStatus.clients?.some((client) => client.state === 'failed')) return sendJson(response, 409, { accepted: false, error: 'The 3D Dice Browser Source needs attention in Studio.', code: 'dice_source_failed', eventId: event.id });
          if (diceStatus.rolling) return sendJson(response, 409, { accepted: false, error: 'The 3D dice are already rolling. Try again when they settle.', code: 'dice_busy', retryAfterMs: extensionDiceGlobalCooldownMs, eventId: event.id });
          extensionDiceGlobalUse = now;
          extensionDiceViewerUses.set(viewerId, now);
          void diceOverlay.roll({ expression: extensionDiceExpression, rollerName: 'Twitch Viewer', reason: 'Viewer roll' }).then((roll) => {
            workflowEngine?.recordExternalEvent('studio.dice.extension-rolled', 'success', `A Twitch viewer rolled ${roll.expression} from Tempest Streaming Extension.`, { eventId: event.id, rollId: roll.id, expression: roll.expression, total: roll.total, viewerId });
          }).catch((error) => {
            workflowEngine?.recordExternalEvent('studio.dice.extension-failed', 'error', `A Tempest Streaming Extension dice roll failed: ${(error as Error).message}`, { eventId: event.id, expression: extensionDiceExpression, viewerId });
          });
          workflowEngine.recordExternalEvent('studio.dice.extension-started', 'success', `A Twitch viewer started ${extensionDiceExpression} from Tempest Streaming Extension.`, { eventId: event.id, expression: extensionDiceExpression, viewerId });
          return sendJson(response, 202, { accepted: true, expression: extensionDiceExpression, cooldownMs: extensionDiceViewerCooldownMs, eventId: event.id });
        }
        workflowEngine.recordExternalEvent(event.topic, 'info', `${event.topic} received from Twitch.`, { event });
        broadcastSystemEvent(event.topic, event);
        chatOverlay.push(event);
        emoteWall.push(event);
        twitchExperiences.ingest(event);
        const avatarRedemption = event.topic === 'viewer.reward.redeemed' ? await interactiveWorld.applyAvatarChannelPointRedemption(event) : undefined;
        if (event.topic === 'viewer.chat.message') {
          const observedViewer = await interactiveWorld.observeChat(event);
          const command = String(event.payload.text || '').trim().split(/\s+/)[0]?.toLowerCase();
          if (command?.startsWith('!')) {
            await interactionComposer.handle('chat-command', command, { source: 'twitch.chat', viewerKey: observedViewer?.key, viewerName: event.viewer?.displayName || event.viewer?.login, input: String(event.payload.text || ''), eventId: event.id });
            try { await interactiveWorld.handleGameChat(event); } catch (error) { workflowEngine.recordExternalEvent('interactive-world.chat-command.failed', 'warning', (error as Error).message, { eventId: event.id, command }); }
          }
        }
        const raidAutomation = event.topic === 'viewer.raid.received' ? await chatbot.processRaidEvent(event) : undefined;

        if (event.topic === 'viewer.interaction.requested' && action === diceExtensionCatalogItem.id) {
          const viewerName = String(event.viewer?.displayName || event.viewer?.login || 'Viewer').trim().slice(0, 80) || 'Viewer';
          const rollPromise = diceOverlay.roll({ expression: '1d20', reason: 'Viewer extension roll', rollerName: viewerName });
          const immediate = await Promise.race([
            rollPromise.then((roll) => ({ state: 'completed' as const, roll }), (error: Error) => ({ state: 'failed' as const, error })),
            new Promise<{ state: 'started' }>((resolve) => { const timer = setTimeout(() => resolve({ state: 'started' }), 25); timer.unref?.(); })
          ]);
          if (immediate.state === 'failed') throw immediate.error;
          if (immediate.state === 'started') {
            void rollPromise.then((roll) => {
              workflowEngine.recordExternalEvent('studio.dice.viewer-roll.completed', 'info', `${viewerName} rolled ${roll.total}.`, { eventId: event.id, roll });
            }, (error: Error) => {
              workflowEngine.recordExternalEvent('studio.dice.viewer-roll.failed', 'warning', error.message, { eventId: event.id, viewerName });
            });
          }
          workflowEngine.recordExternalEvent('studio.dice.viewer-roll.started', 'info', `${viewerName} started a d20 roll.`, { eventId: event.id });
          return sendJson(response, 202, {
            accepted: true,
            duplicate: false,
            eventId: event.id,
            action,
            rolling: immediate.state === 'started',
            ...(immediate.state === 'completed' ? { roll: immediate.roll } : {})
          });
        }

        if (event.topic === 'viewer.interaction.requested' && nativeWorldAction) {
          const canonicalAction = nativeWorldAction === 'tempest.pet-play' ? 'tempest.pet.play' : nativeWorldAction;
          const viewerId = String(event.viewer?.id || '').trim();
          const viewerName = String(event.viewer?.displayName || event.viewer?.login || 'Viewer').trim().slice(0, 80) || 'Viewer';
          const requireViewerIdentity = () => {
            if (!viewerId) throw new Error('This Interactive World action requires a shared Twitch viewer identity.');
            return viewerId;
          };
          const joinViewer = () => interactiveWorld.joinViewer({ platform: 'twitch', userId: requireViewerIdentity(), displayName: viewerName });
          if (canonicalAction === 'tempest.avatar.join') await joinViewer();
          else if (canonicalAction === 'tempest.avatar.equip') {
            await interactiveWorld.equipUnlockedAvatarRedeem(requireViewerIdentity(), event.payload.cosmeticRedeemId);
          }
          else if (canonicalAction.startsWith('tempest.avatar.') && canonicalAction !== 'tempest.avatar.join') {
            const viewer = await joinViewer();
            await interactiveWorld.controlViewer(viewer.key, { action: canonicalAction.slice('tempest.avatar.'.length) });
          } else if (canonicalAction.startsWith('tempest.pet.')) {
            await interactiveWorld.petAction(canonicalAction.slice('tempest.pet.'.length), viewerName);
          } else if (canonicalAction === 'tempest.viewer-attack') {
            const rawPlacement = event.payload.placement;
            const placement = rawPlacement && typeof rawPlacement === 'object' && !Array.isArray(rawPlacement) ? rawPlacement as Record<string, unknown> : {};
            await interactiveWorld.viewerAttack({
              platform: 'twitch', viewerId: viewerId || `anonymous-${event.id}`, viewerName,
              x: placement.x, y: placement.y, intensity: event.payload.intensity
            });
          } else if (canonicalAction === 'tempest.battle.attack') {
            const viewer = await joinViewer();
            const battle = interactiveWorld.status().battle;
            if (!battle || battle.state !== 'active') throw new Error('There is no active battle to attack.');
            const targetKey = battle.boss?.viewerKey || battle.participants.find((participant) => participant.viewerKey !== viewer.key && !participant.defeated)?.viewerKey;
            await interactiveWorld.battleAction({ action: 'attack', attackerKey: viewer.key, targetKey, amount: event.payload.intensity === undefined ? undefined : 8 + Math.round(Number(event.payload.intensity) * 12) });
          }
          workflowEngine.recordExternalEvent('interactive-world.action.accepted', 'info', `${viewerName} used ${canonicalAction}.`, { eventId: event.id, viewerId: viewerId || undefined, action: canonicalAction });
          return sendJson(response, 202, { accepted: true, duplicate: false, eventId: event.id, action: canonicalAction, world: interactiveWorld.status() });
        }

        if (event.topic === 'viewer.interaction.requested' && action) {
          const viewerId = String(event.viewer?.id || '').trim();
          const outcomes = await interactionComposer.handle('extension-action', action, {
            source: 'twitch.extension',
            viewerKey: viewerId ? `twitch:${viewerId}` : undefined,
            viewerName: event.viewer?.displayName || event.viewer?.login,
            input: typeof event.payload.input === 'string' ? event.payload.input : undefined,
            eventId: event.id
          });
          if (outcomes.length) return sendJson(response, 202, { accepted: true, duplicate: false, eventId: event.id, recipes: outcomes });
        }

        if ((event.topic === 'viewer.interaction.requested' || event.topic === 'viewer.reward.redeemed') && configuredAlert) {
          const rawPlacement = event.payload.placement;
          const placement = configuredAlert.placementMode === 'viewer' && rawPlacement && typeof rawPlacement === 'object' && !Array.isArray(rawPlacement)
            ? { x: Number((rawPlacement as Record<string, unknown>).x), y: Number((rawPlacement as Record<string, unknown>).y) }
            : undefined;
          const result = await triggerSoundAlert(configuredAlert.id, {
            source: event.topic === 'viewer.reward.redeemed' ? 'twitch.channel-points' : 'twitch.extension',
            eventId: event.id,
            viewerId: event.viewer?.id,
            viewerName: event.viewer?.displayName || event.viewer?.login,
            intensity: typeof event.payload.intensity === 'number' ? event.payload.intensity : undefined,
            ...(placement && Number.isFinite(placement.x) && placement.x >= 0 && placement.x <= 1 && Number.isFinite(placement.y) && placement.y >= 0 && placement.y <= 1 ? { placement } : {}),
            simulateMissing: false
          });
          return sendJson(response, 202, { accepted: true, duplicate: false, ...result, ...(avatarRedemption ? { avatarRedemption } : {}) });
        }
        const twitchVisual = twitchVisualAlerts.findForEvent(event);
        if (twitchVisual?.enabled) await queueTwitchAlert(twitchVisual, event, 'twitch.eventsub');
        const triggerType = event.topic === 'viewer.interaction.requested' ? 'viewer.interaction'
          : event.topic === 'viewer.reward.redeemed' ? 'twitch.channel-points'
            : event.topic === 'viewer.cheer.received' && action ? 'twitch.cheer' : undefined;
        const workflow = triggerType && action ? registry.listWorkflows().find((entry) => entry.enabled && entry.trigger.type === triggerType && entry.trigger.action === action) : undefined;
        if (!workflow) return sendJson(response, 202, { accepted: true, duplicate: false, eventId: event.id, ...(avatarRedemption ? { avatarRedemption } : {}), ...(raidAutomation ? { raidAutomation } : {}) });

        const run = await workflowEngine.trigger(workflow.id, {
          source: event.topic === 'viewer.reward.redeemed' ? 'twitch.channel-points' : event.topic === 'viewer.cheer.received' ? 'twitch.cheer' : 'twitch.extension',
          eventId: event.id,
          viewerId: event.viewer?.id,
          viewerName: event.viewer?.displayName || event.viewer?.login,
          payload: { ...event.payload, dedupeId: typeof event.payload.dedupeId === 'string' ? event.payload.dedupeId : event.id }
        });
        broadcastSystemEvent('workflow.started', run);
        return sendJson(response, 202, { accepted: true, duplicate: false, eventId: event.id, run, ...(avatarRedemption ? { avatarRedemption } : {}) });
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/connections') {
        return sendJson(response, 200, connectionsSnapshot());
      }
      return sendJson(response, 404, { error: 'Tempest Bridge route was not found.' });
    } catch (error) {
      logger.warn(error);
      return sendJson(response, 400, { error: (error as Error).message });
    }
  });

  const alertAudioServer = createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', `http://${host}`);
    try {
      const requestOrigin = request.headers.origin || '';
      const allowedOrigin = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(requestOrigin) ? requestOrigin : '';
      if (request.method === 'OPTIONS') {
        if (allowedOrigin) response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.statusCode = 204;
        return response.end();
      }
      if (request.method === 'POST' && requestUrl.pathname === '/visual-alerts/audio-status') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'Alert audio status is accepted only from this computer.' });
        const body = await readJson(request) as Record<string, unknown>;
        const runId = typeof body.runId === 'string' ? body.runId.trim().slice(0, 200) : '';
        const alertId = typeof body.alertId === 'string' ? body.alertId.trim().slice(0, 200) : '';
        const output = body.output === 'interaction' || body.output === 'twitch' ? body.output : undefined;
        const state = body.state === 'started' || body.state === 'failed' ? body.state : undefined;
        const method = ['direct', 'blob', 'web-audio', 'fetch'].includes(String(body.method)) ? body.method as BrowserAudioPlaybackMethod : undefined;
        if (!runId || !alertId || !output || !state || !method) return sendJson(response, 400, { error: 'Alert audio status is invalid.' });
        const expected = browserAudioPlaybackRecords.find((record) => record.runId === runId && record.output === output);
        if (!expected || expected.alertId !== alertId) return sendJson(response, 409, { error: 'This alert audio playback was not expected.' });
        const playback = recordBrowserAudioPlayback({ runId, alertId, output, state, method, ...(typeof body.error === 'string' ? { error: body.error } : {}) });
        if (state === 'failed') workflowEngine?.recordExternalEvent('alert.audio.browser.failed', 'error', `${output === 'twitch' ? 'Twitch' : 'Interaction'} Alert audio failed in the Browser Source.`, { playback });
        if (allowedOrigin) response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        response.setHeader('Cache-Control', 'no-store');
        response.statusCode = 204;
        return response.end();
      }
      if (await serveAlertAudio(request, response, requestUrl)) return;
      return sendJson(response, 404, { error: 'Tempest alert audio route was not found.' });
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

  const extensionFeatureDefinitions = (): TwitchExtensionFeatureDefinition[] => [
    ...interactiveWorldCatalog.map((item) => ({
      id: item.id,
      name: item.name,
      group: extensionFeatureDescriptions[item.id]?.group || 'Interactive World',
      description: extensionFeatureDescriptions[item.id]?.description || 'Interactive World viewer action.',
      defaultDestinations: [...item.destinations]
    })),
    {
      id: diceExtensionCatalogItem.id,
      name: diceExtensionCatalogItem.name,
      group: 'Stream Games',
      description: 'Roll one physical d20 on the Unified Stage.',
      defaultDestinations: [...diceExtensionCatalogItem.destinations]
    },
    ...soundAlerts.list().filter((alert) => !interactiveWorldActionIds.has(alert.id)).map((alert) => ({
      id: alert.id,
      name: alert.name,
      group: 'Viewer Alerts',
      description: alert.description || 'Viewer-triggered alert managed by Studio.',
      defaultDestinations: ['mainframe', 'streaming'] as Array<'mainframe' | 'streaming'>
    }))
  ];

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
      catalog: () => {
        const alerts = soundAlerts.list().filter((alert) => alert.enabled && !interactiveWorldActionIds.has(alert.id)).map((alert) => ({
          id: alert.id,
          name: alert.name,
          durationMs: alert.durationMs,
          cooldownMs: Math.max(alert.viewerCooldownMs, alert.globalCooldownMs, alert.durationMs),
          viewerCooldownMs: alert.viewerCooldownMs,
          globalCooldownMs: alert.globalCooldownMs,
          category: alert.interactionCategory || 'other',
          placementMode: alert.placementMode || 'fixed',
          access: {
            mode: alert.accessMode === 'viewer-group' ? 'specific-viewers' : alert.accessMode || 'everyone',
            allowedViewerIds: alert.accessMode === 'assigned-creators'
              ? chatbot.resolvedInteractionGroupViewerIds()
              : alert.accessMode === 'viewer-group'
                ? chatbot.resolvedViewerGroupIds(alert.viewerGroupId || '')
                : alert.allowedViewerIds || [],
            blockedViewerIds: alert.blockedViewerIds || [],
            hideWhenLocked: alert.hideWhenLocked === true
          },
          accent: alert.accent || '#54F2EB',
          glyph: alert.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'FX',
          kind: extensionCatalogKind(relayOptions.extensionEdition),
          destinations: extensionFeatures.destinations(alert.id, ['mainframe', 'streaming'])
        }));
        const diceStatus = diceOverlay.status('') as { settings?: { enabled?: boolean; durationMs?: number } };
        const interactionAccess = chatbot.status().interactionAccess;
        const legacyDiceItems = diceStatus.settings?.enabled !== true ? [] : [...extensionDicePresets, extensionDiceCustom].map((preset) => ({
          id: preset.id,
          name: preset.name,
          durationMs: Number(diceStatus.settings?.durationMs) || 5_200,
          cooldownMs: extensionDiceViewerCooldownMs,
          viewerCooldownMs: extensionDiceViewerCooldownMs,
          globalCooldownMs: extensionDiceGlobalCooldownMs,
          category: 'community' as const,
          placementMode: 'fixed' as const,
          access: {
            mode: interactionAccess.mode === 'assigned-creators' ? 'assigned-creators' as const : 'everyone' as const,
            allowedViewerIds: interactionAccess.mode === 'assigned-creators' ? chatbot.resolvedInteractionGroupViewerIds() : [],
            blockedViewerIds: [],
            hideWhenLocked: false
          },
          accent: '#A66BFF',
          glyph: preset.glyph,
          kind: 'interaction' as const,
          destinations: extensionFeatures.destinations(preset.id, ['mainframe'])
        }));
        return [
          ...interactiveWorldCatalog.map((item) => ({
            ...item,
            destinations: extensionFeatures.destinations(item.id, item.destinations)
          })),
          {
            ...diceExtensionCatalogItem,
            destinations: extensionFeatures.destinations(diceExtensionCatalogItem.id, diceExtensionCatalogItem.destinations)
          },
          ...alerts,
          ...legacyDiceItems
        ];
      },
      poll: () => {
        const poll = chatbot.pollStatus();
        if (poll.state === 'idle' || !poll.id || !poll.question || !poll.startedAt) return undefined;
        return {
          id: poll.id,
          state: poll.state,
          question: poll.question,
          options: poll.options,
          totalVotes: poll.totalVotes,
          startedAt: poll.startedAt,
          endedAt: poll.endedAt,
          lastVoteAt: poll.lastVoteAt
        };
      },
      counters: () => chatbot.publicCounters(),
      commands: () => chatbot.publicCommands(),
      goal: () => twitchExperiences.publicGoal(),
      nowPlaying: async () => {
        const status = await chatbot.radioStatus();
        if (!status) return undefined;
        return {
          stationName: status.name,
          state: status.state,
          artist: status.nowPlaying?.artist,
          title: status.nowPlaying?.title,
          text: status.nowPlaying?.text,
          album: status.nowPlaying?.album,
          publicPlayerUrl: status.publicPlayerUrl,
          checkedAt: status.checkedAt
        };
      },
      schedule: () => chatbot.publicSchedule(),
      stream: () => chatbot.publicStream(),
      onStatus(status: ExtensionRelayStatus) {
        twitchGateway.setExtensionRelayStatus(status);
      },
      async handler(event) {
        const response = await fetch(`${runtime.baseUrl}/v1/integrations/twitch/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tempest-Token': runtime.token },
          body: JSON.stringify(event)
        });
        return { status: response.status, body: await response.json().catch(() => ({})) };
      },
      async queryHandler(query) {
        if (query.kind !== 'avatar-closet') return { status: 404, body: { error: 'Viewer query was not recognized.' } };
        return { status: 200, body: { schemaVersion: 1, ...interactiveWorld.avatarCloset(query.viewerId) } };
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
    alertAudioServer.once('error', reject);
    alertAudioServer.listen(requestedPort > 0 ? requestedPort + 1 : 0, host, () => resolve());
  });
  const alertAudioAddress = alertAudioServer.address() as AddressInfo;
  alertAudioBaseUrl = `http://${host}:${alertAudioAddress.port}`;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(requestedPort, host, () => resolve());
    });
  } catch (error) {
    await new Promise<void>((resolve) => alertAudioServer.close(() => resolve()));
    throw error;
  }
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
      unifiedStage.close();
      chatOverlay.close();
      emoteWall.close();
      diceOverlay.close();
      await tobiiAdapter.close();
      interactiveWorld.close();
      interactiveStage.close();
      twitchExperiences.close();
      discordVoiceOverlay.close();
      twitchGateway.close();
      workflowEngine?.close();
      for (const timer of browserAudioPlaybackTimers.values()) clearTimeout(timer);
      browserAudioPlaybackTimers.clear();
      for (const client of clients.values()) client.socket.close(1001, 'Tempest Bridge shutting down');
      await new Promise<void>((resolve, reject) => webSockets.close((error) => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await new Promise<void>((resolve, reject) => alertAudioServer.close((error) => error ? reject(error) : resolve()));
    }
  };
  await syncChatbotConnection();
  await configureExtensionRelay(options.extensionRelay);
  logger.info(`Tempest Bridge ${TEMPEST_PROTOCOL_VERSION} listening on ${runtime.baseUrl}`);
  return runtime;
}
