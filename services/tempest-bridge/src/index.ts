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
  TempestInteractionRequest,
  TempestNormalizedTwitchEvent,
  TempestSoundAlertPlaybackCommand,
  TempestSoundAlertTriggerRequest,
  TempestTwitchVisualAlertDefinition,
  createBridgeMessage,
  validateBridgeMessage
} from '@tempest/contracts';
import { TempestRegistry } from './registry';
import { blackHoleWorkflow, soundAlertPerformanceWorkflow, twitchAlertReactionWorkflow, TempestWorkflowEngine } from './workflow-engine';
import { TwitchIntegrationGateway, type TwitchCredentialStore } from './twitch-integration';
import { TempestSoundAlertCatalog } from './sound-alerts';
import { TempestVisualAlertOverlay } from './visual-alerts';
import { TempestTwitchVisualAlertCatalog } from './twitch-visual-alerts';
import { TempestChatOverlay } from './chat-overlay';
import { TempestAlertQueue } from './alert-queue';
import {
  ExtensionRelayOptions,
  ExtensionRelayStatus,
  TempestExtensionRelayClient
} from './extension-relay';
import { ChatbotDispatch, TwitchChatbot } from './chatbot';

export type { TwitchCredentialStore, TwitchTokenSet } from './twitch-integration';
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
  chatbotFetchImplementation?: typeof fetch;
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
  connectedAt: string;
  lastSeenAt: string;
  subscriptions: Set<string>;
  socket: WebSocket;
}

const maximumBodyBytes = 2 * 1024 * 1024;

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
  const twitchGateway = new TwitchIntegrationGateway({ dataDirectory: options.dataDirectory, credentialStore: options.twitchCredentialStore });
  await twitchGateway.initialize();
  let ingestChatEvent: (event: TempestNormalizedTwitchEvent) => Promise<void> = async () => {};
  let dispatchChatCommand: (dispatch: ChatbotDispatch) => Promise<void> = async () => {};
  const chatbot = new TwitchChatbot({
    dataDirectory: options.dataDirectory,
    credentialStore: options.chatbotCredentialStore,
    fetchImplementation: options.chatbotFetchImplementation,
    onEvent: (event) => ingestChatEvent(event),
    onCommand: (dispatch) => dispatchChatCommand(dispatch),
    onConnectionState(eventSub, chat) { twitchGateway.setChatConnectionState(eventSub, chat); }
  });
  await chatbot.initialize(twitchGateway.status().clientId || '');
  const soundAlerts = new TempestSoundAlertCatalog(options.dataDirectory);
  await soundAlerts.initialize();
  const visualAlerts = new TempestVisualAlertOverlay();
  const twitchAlertOverlay = new TempestVisualAlertOverlay();
  const twitchVisualAlerts = new TempestTwitchVisualAlertCatalog(options.dataDirectory);
  await twitchVisualAlerts.initialize();
  const chatOverlay = new TempestChatOverlay(options.dataDirectory);
  await chatOverlay.initialize();
  let alertQueue: TempestAlertQueue | undefined;
  let extensionRelay: TempestExtensionRelayClient | null = null;
  let runtime!: TempestBridgeRuntime;

  let workflowEngine: TempestWorkflowEngine | null = null;

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
      ...(alertQueue ? { queue: alertQueue.status() } : {})
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
      workflowEngine!.recordExternalEvent('alert-queue.item.failed', 'error', `${item.name} could not start from the Alert Queue: ${error.message}`, { queueItem: item });
    }
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
      execute: async () => {
        const reactionRun = await triggerTwitchAlertReaction(alert, event, source);
        const activeAlert = twitchAlertOverlay.showTwitch(alert, event);
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
    const ingestion = twitchGateway.ingest(event);
    if (ingestion.duplicate) {
      workflowEngine!.recordExternalEvent('integration.event.duplicate', 'info', `Duplicate Twitch event ${event.id} was ignored.`, { eventId: event.id, topic: event.topic });
      return;
    }
    workflowEngine!.recordExternalEvent(event.topic, 'info', `${event.topic} received from Twitch.`, { event });
    broadcastSystemEvent(event.topic, event);
    chatOverlay.push(event);
    const twitchVisual = twitchVisualAlerts.findForEvent(event);
    if (twitchVisual?.enabled) await queueTwitchAlert(twitchVisual, event, 'twitch.chat');
  };

  dispatchChatCommand = async ({ command, event, arguments: commandArguments, simulated }) => {
    if (!command.workflowId) return;
    const workflow = registry.listWorkflows().find((entry) => entry.id === command.workflowId && entry.enabled);
    if (!workflow) throw new Error(`Workflow ${command.workflowId} is not available.`);
    const run = await workflowEngine!.trigger(workflow.id, {
      source: simulated ? 'studio.simulator' : 'twitch.chat',
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
    await chatbot.connectChannel(twitchGateway.connectionAuthorization());
  };

  const triggerSoundAlert = async (idOrCue: string, request: TempestSoundAlertTriggerRequest) => {
    const prepared = soundAlerts.prepare(idOrCue, request);
    if (!workflowEngine!.safetyState().armed) throw new Error('Viewer interactions are disarmed. Arm Studio before adding an Interaction Alert to the queue.');
    const accepted = await alertQueue!.enqueue({
      kind: 'interaction',
      alertId: prepared.alert.id,
      name: prepared.alert.name,
      source: request.source,
      durationMs: Math.max(prepared.alert.durationMs, prepared.alert.visualDurationMs),
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
        const activeVisualAlert = visualAlerts.show(prepared.alert, request.viewerName, run.id, true);
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
        response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self';");
        response.setHeader('X-Content-Type-Options', 'nosniff');
        return response.end(chatOverlay.page());
      }
      if (request.method === 'GET' && requestUrl.pathname === '/chat-overlay/events') {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Chat Overlay is available only on this computer.' });
        chatOverlay.connect(response);
        return;
      }
      const visualMediaMatch = requestUrl.pathname.match(/^\/visual-alerts\/media\/([^/]+)$/);
      if (request.method === 'GET' && visualMediaMatch) {
        if (!isLoopbackRequest(request)) return sendJson(response, 403, { error: 'The Visual Alerts overlay is available only on this computer.' });
        const mediaId = decodeURIComponent(visualMediaMatch[1]);
        const alert = soundAlerts.find(mediaId) || twitchVisualAlerts.find(mediaId);
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
        const alert = soundAlerts.find(audioId) || twitchVisualAlerts.find(audioId);
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
      const twitchVisualPreviewMatch = requestUrl.pathname.match(/^\/v1\/visual-alerts\/twitch\/([^/]+)\/preview$/);
      if (request.method === 'POST' && twitchVisualPreviewMatch) {
        const alert = twitchVisualAlerts.find(decodeURIComponent(twitchVisualPreviewMatch[1]));
        if (!alert) return sendJson(response, 404, { error: 'The Twitch Visual Alert was not found.' });
        const previewEvent: TempestNormalizedTwitchEvent = {
          schemaVersion: 1,
          id: globalThis.crypto.randomUUID(),
          topic: alert.topic,
          occurredAt: new Date().toISOString(),
          source: 'twitch',
          channel: { id: 'studio-preview', displayName: 'Studio Preview' },
          viewer: { id: 'studio-operator', displayName: 'Studio Operator' },
          payload: alert.topic === 'viewer.cheer.received' ? { bits: 100 }
            : alert.topic === 'viewer.raid.received' ? { fromBroadcasterId: 'studio-preview', fromBroadcasterName: 'Storm Horizon', viewers: 42 }
              : alert.topic === 'viewer.reward.redeemed' ? { rewardTitle: 'Channel Point Reward' }
                : alert.topic === 'viewer.subscription.started' ? { isGift: alert.variant === 'gift', tier: '1000' }
                  : {}
        };
        const activeAlert = twitchAlertOverlay.showTwitch(alert, previewEvent);
        const reactionRun = await triggerTwitchAlertReaction(alert, previewEvent, 'studio.simulator');
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
        const activeAlert = visualAlerts.show(alert, viewerName, globalThis.crypto.randomUUID());
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
      if (request.method === 'GET' && requestUrl.pathname === '/v1/integrations/storm-horizon-radio') {
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
      if (request.method === 'POST' && requestUrl.pathname === '/v1/integrations/twitch/events') {
        const ingestion = twitchGateway.ingest(await readJson(request));
        const event = ingestion.event;
        if (ingestion.duplicate) {
          workflowEngine.recordExternalEvent('integration.event.duplicate', 'info', `Duplicate Twitch event ${event.id} was ignored.`, { eventId: event.id, topic: event.topic });
          return sendJson(response, 200, { accepted: false, duplicate: true, eventId: event.id });
        }
        workflowEngine.recordExternalEvent(event.topic, 'info', `${event.topic} received from Twitch.`, { event });
        broadcastSystemEvent(event.topic, event);
        chatOverlay.push(event);

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
        if (!workflow) return sendJson(response, 202, { accepted: true, duplicate: false, eventId: event.id });

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
      visualAlerts.close();
      twitchAlertOverlay.close();
      chatOverlay.close();
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
