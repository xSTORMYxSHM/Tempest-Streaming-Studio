import { randomUUID } from 'node:crypto';
import {
  TEMPEST_PROTOCOL_VERSION,
  TempestBridgeMessage,
  createBridgeMessage,
  validateBridgeMessage
} from '@tempest/contracts';
import { WebSocket } from 'ws';

const applicationId = 'com.tempestmainframe.vtube-studio';
const capabilities = ['avatar.performance.apply'];
const apiName = 'VTubeStudioPublicAPI';
const apiVersion = '1.0';
const pluginName = 'Tempest Studio';
const pluginDeveloper = 'Storm Horizon Media';

export interface VTubeStudioTokenStore {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface VTubeStudioHotkey {
  name: string;
  type: string;
  description: string;
  file: string;
  hotkeyID: string;
}

export interface StartVTubeStudioAdapterOptions {
  bridgeUrl?: string;
  bridgeToken: string;
  vtubeStudioUrl?: string;
  tokenStore: VTubeStudioTokenStore;
  reconnectMs?: number;
  requestTimeoutMs?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface VTubeStudioAdapterStatus {
  bridge: 'disconnected' | 'connecting' | 'connected';
  vtubeStudio: 'disconnected' | 'connecting' | 'connected';
  authorization: 'required' | 'pending' | 'authorized' | 'denied';
  endpoint: string;
  modelName?: string;
  modelLoaded?: boolean;
  hotkeyCount: number;
  lastHotkey?: string;
  lastError?: string;
}

export interface VTubeStudioAdapterRuntime {
  status(): VTubeStudioAdapterStatus;
  authorize(): Promise<VTubeStudioAdapterStatus>;
  refreshHotkeys(): Promise<VTubeStudioHotkey[]>;
  hotkeys(): VTubeStudioHotkey[];
  forgetAuthorization(): Promise<VTubeStudioAdapterStatus>;
  close(): Promise<void>;
}

interface VtsResponse {
  requestID?: string;
  messageType?: string;
  data?: Record<string, unknown>;
}

interface PendingRequest {
  resolve(value: VtsResponse): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

function localSocketUrl(value: string, name: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`${name} must be a local ws:// URL.`);
  }
  if (url.username || url.password || url.hash) throw new Error(`${name} must not contain embedded credentials or a fragment.`);
  return url;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function startVTubeStudioAdapter(options: StartVTubeStudioAdapterOptions): VTubeStudioAdapterRuntime {
  const bridgeUrl = localSocketUrl(options.bridgeUrl || 'ws://127.0.0.1:4765/v1/socket', 'bridgeUrl');
  bridgeUrl.searchParams.set('token', options.bridgeToken.trim());
  const vtsUrl = localSocketUrl(options.vtubeStudioUrl || 'ws://localhost:8001', 'vtubeStudioUrl');
  if (options.bridgeToken.trim().length < 32) throw new Error('Bridge token must contain at least 32 characters.');
  const reconnectMs = Math.max(250, Math.min(30_000, options.reconnectMs || 2_000));
  const requestTimeoutMs = Math.max(1_000, Math.min(60_000, options.requestTimeoutMs || 15_000));
  const logger = options.logger || console;
  let stopped = false;
  let bridge: WebSocket | null = null;
  let vts: WebSocket | null = null;
  let bridgeTimer: NodeJS.Timeout | null = null;
  let vtsTimer: NodeJS.Timeout | null = null;
  let availableHotkeys: VTubeStudioHotkey[] = [];
  const pending = new Map<string, PendingRequest>();
  let current: VTubeStudioAdapterStatus = {
    bridge: 'disconnected',
    vtubeStudio: 'disconnected',
    authorization: 'required',
    endpoint: vtsUrl.href.replace(/\/$/, ''),
    hotkeyCount: 0
  };

  const update = (patch: Partial<VTubeStudioAdapterStatus>): void => { current = { ...current, ...patch }; };
  const scheduleBridge = (): void => {
    if (stopped || bridgeTimer) return;
    bridgeTimer = setTimeout(() => { bridgeTimer = null; connectBridge(); }, reconnectMs);
    bridgeTimer.unref();
  };
  const scheduleVts = (): void => {
    if (stopped || vtsTimer) return;
    vtsTimer = setTimeout(() => { vtsTimer = null; connectVts(); }, reconnectMs);
    vtsTimer.unref();
  };

  const request = (messageType: string, data: Record<string, unknown> = {}, timeoutMs = requestTimeoutMs): Promise<VtsResponse> => {
    if (!vts || vts.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Open VTube Studio and enable Allow Plugin API access first.'));
    const requestID = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestID);
        reject(new Error(`VTube Studio did not answer ${messageType}.`));
      }, timeoutMs);
      timer.unref();
      pending.set(requestID, { resolve, reject, timer });
      vts!.send(JSON.stringify({ apiName, apiVersion, requestID, messageType, data }));
    });
  };

  const authenticate = async (token: string): Promise<boolean> => {
    const response = await request('AuthenticationRequest', { pluginName, pluginDeveloper, authenticationToken: token });
    const authenticated = response.data?.authenticated === true;
    update({ authorization: authenticated ? 'authorized' : 'required', lastError: authenticated ? undefined : text(response.data?.reason) || 'VTube Studio authorization was revoked.' });
    return authenticated;
  };

  const refreshHotkeys = async (): Promise<VTubeStudioHotkey[]> => {
    if (current.authorization !== 'authorized') throw new Error('Authorize Tempest Studio in VTube Studio first.');
    const response = await request('HotkeysInCurrentModelRequest');
    const raw = Array.isArray(response.data?.availableHotkeys) ? response.data.availableHotkeys : [];
    availableHotkeys = raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const value = entry as Record<string, unknown>;
      const hotkeyID = text(value.hotkeyID);
      const name = text(value.name);
      if (!hotkeyID || !name) return [];
      return [{ hotkeyID, name, type: text(value.type) || 'Unknown', description: text(value.description) || '', file: text(value.file) || '' }];
    });
    update({
      modelLoaded: response.data?.modelLoaded === true,
      modelName: text(response.data?.modelName),
      hotkeyCount: availableHotkeys.length,
      lastError: undefined
    });
    return availableHotkeys.map((entry) => ({ ...entry }));
  };

  const respond = (command: TempestBridgeMessage, success: boolean, detail: string): void => {
    if (!bridge || bridge.readyState !== WebSocket.OPEN) return;
    bridge.send(JSON.stringify(createBridgeMessage({
      kind: 'response', source: applicationId, target: command.source, topic: command.topic,
      correlationId: command.correlationId || command.id,
      payload: { commandId: command.id, success, detail }
    })));
  };

  const handleCommand = async (command: TempestBridgeMessage): Promise<void> => {
    if (command.kind !== 'command' || command.target !== applicationId || !capabilities.includes(String(command.topic || ''))) return;
    const payload = command.payload && typeof command.payload === 'object' && !Array.isArray(command.payload) ? command.payload as Record<string, unknown> : {};
    const args = payload.arguments && typeof payload.arguments === 'object' && !Array.isArray(payload.arguments) ? payload.arguments as Record<string, unknown> : {};
    const phase = payload.phase === 'release' ? 'release' : 'activate';
    const hotkey = text(args.vtubeStudioHotkey);
    if (!hotkey) return respond(command, false, 'No VTube Studio hotkey is assigned to this alert.');
    if (phase === 'release') return respond(command, true, 'VTube Studio hotkey timing is managed by VTube Studio.');
    if (current.authorization !== 'authorized') return respond(command, false, 'VTube Studio is not authorized.');
    try {
      await request('HotkeyTriggerRequest', { hotkeyID: hotkey });
      update({ lastHotkey: hotkey, lastError: undefined });
      respond(command, true, `Triggered VTube Studio hotkey ${hotkey}.`);
    } catch (error) {
      update({ lastError: (error as Error).message });
      respond(command, false, (error as Error).message);
    }
  };

  function connectBridge(): void {
    if (stopped || bridge) return;
    update({ bridge: 'connecting' });
    const socket = new WebSocket(bridgeUrl, { handshakeTimeout: 5_000, maxPayload: 256 * 1024 });
    bridge = socket;
    socket.on('open', () => {
      update({ bridge: 'connected' });
      socket.send(JSON.stringify(createBridgeMessage({ kind: 'hello', source: applicationId, payload: { applicationId, version: '1.0.1', protocolVersion: TEMPEST_PROTOCOL_VERSION, capabilities } })));
      logger.info('VTube Studio adapter connected to Tempest Bridge.');
    });
    socket.on('message', (raw) => {
      try {
        const validation = validateBridgeMessage(JSON.parse(raw.toString()));
        if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
        void handleCommand(validation.value);
      } catch (error) { update({ lastError: (error as Error).message }); logger.warn(error); }
    });
    socket.on('error', (error) => update({ lastError: error.message }));
    socket.on('close', () => { if (bridge === socket) bridge = null; update({ bridge: 'disconnected' }); scheduleBridge(); });
  }

  function connectVts(): void {
    if (stopped || vts) return;
    update({ vtubeStudio: 'connecting' });
    const socket = new WebSocket(vtsUrl, { handshakeTimeout: 5_000, maxPayload: 1024 * 1024 });
    vts = socket;
    socket.on('open', () => {
      update({ vtubeStudio: 'connected', lastError: undefined });
      logger.info(`Connected to VTube Studio at ${vtsUrl.origin}.`);
      void options.tokenStore.load().then(async (token) => {
        if (!token) return update({ authorization: 'required' });
        if (await authenticate(token)) await refreshHotkeys().catch((error) => update({ lastError: (error as Error).message }));
      }).catch((error) => update({ authorization: 'required', lastError: (error as Error).message }));
    });
    socket.on('message', (raw) => {
      try {
        const response = JSON.parse(raw.toString()) as VtsResponse;
        const requestID = text(response.requestID);
        if (!requestID) return;
        const waiting = pending.get(requestID);
        if (!waiting) return;
        pending.delete(requestID);
        clearTimeout(waiting.timer);
        if (response.messageType === 'APIError') waiting.reject(new Error(text(response.data?.message) || 'VTube Studio returned an API error.'));
        else waiting.resolve(response);
      } catch (error) { update({ lastError: (error as Error).message }); }
    });
    socket.on('error', (error) => update({ lastError: error.message }));
    socket.on('close', () => {
      if (vts === socket) vts = null;
      for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(new Error('VTube Studio disconnected.')); }
      pending.clear();
      availableHotkeys = [];
      update({ vtubeStudio: 'disconnected', authorization: 'required', modelName: undefined, modelLoaded: undefined, hotkeyCount: 0 });
      scheduleVts();
    });
  }

  connectBridge();
  connectVts();

  return {
    status: () => ({ ...current }),
    hotkeys: () => availableHotkeys.map((entry) => ({ ...entry })),
    refreshHotkeys,
    authorize: async () => {
      update({ authorization: 'pending', lastError: undefined });
      try {
        const response = await request('AuthenticationTokenRequest', { pluginName, pluginDeveloper }, 60_000);
        const token = text(response.data?.authenticationToken);
        if (!token) throw new Error('VTube Studio did not grant an authorization token.');
        await options.tokenStore.save(token);
        if (!await authenticate(token)) throw new Error('VTube Studio did not authorize Tempest Studio.');
        await refreshHotkeys();
      } catch (error) {
        update({ authorization: 'denied', lastError: (error as Error).message });
        throw error;
      }
      return { ...current };
    },
    forgetAuthorization: async () => {
      await options.tokenStore.clear();
      availableHotkeys = [];
      update({ authorization: 'required', modelName: undefined, modelLoaded: undefined, hotkeyCount: 0, lastHotkey: undefined, lastError: undefined });
      return { ...current };
    },
    close: async () => {
      stopped = true;
      if (bridgeTimer) clearTimeout(bridgeTimer);
      if (vtsTimer) clearTimeout(vtsTimer);
      for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(new Error('Adapter shutting down.')); }
      pending.clear();
      for (const socket of [bridge, vts]) if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Adapter shutting down');
      bridge = null;
      vts = null;
      update({ bridge: 'disconnected', vtubeStudio: 'disconnected', authorization: 'required' });
    }
  };
}
