import {
  TEMPEST_PROTOCOL_VERSION,
  TempestBridgeMessage,
  createBridgeMessage,
  validateBridgeMessage
} from '@tempest/contracts';
import { WebSocket } from 'ws';

const applicationId = 'com.tempestmainframe.warudo';
const capabilities = ['avatar.expression.apply', 'avatar.performance.apply', 'avatar.reaction.apply'];

export interface StartWarudoAdapterOptions {
  bridgeUrl?: string;
  bridgeToken: string;
  warudoUrl?: string;
  reconnectMs?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface WarudoAdapterStatus {
  bridge: 'disconnected' | 'connecting' | 'connected';
  warudo: 'disconnected' | 'connecting' | 'connected';
  lastCue?: string;
  lastError?: string;
}

export interface WarudoAdapterRuntime {
  status(): WarudoAdapterStatus;
  close(): Promise<void>;
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

export function startWarudoAdapter(options: StartWarudoAdapterOptions): WarudoAdapterRuntime {
  const bridgeUrl = localSocketUrl(options.bridgeUrl || 'ws://127.0.0.1:4765/v1/socket', 'bridgeUrl');
  bridgeUrl.searchParams.set('token', options.bridgeToken.trim());
  const warudoUrl = localSocketUrl(options.warudoUrl || 'ws://localhost:4770/', 'warudoUrl');
  if (options.bridgeToken.trim().length < 32) throw new Error('Bridge token must contain at least 32 characters.');
  const reconnectMs = Math.max(250, Math.min(30_000, options.reconnectMs || 2_000));
  const logger = options.logger || console;
  let stopped = false;
  let bridge: WebSocket | null = null;
  let warudo: WebSocket | null = null;
  let bridgeTimer: NodeJS.Timeout | null = null;
  let warudoTimer: NodeJS.Timeout | null = null;
  let current: WarudoAdapterStatus = { bridge: 'disconnected', warudo: 'disconnected' };

  const update = (patch: Partial<WarudoAdapterStatus>): void => { current = { ...current, ...patch }; };
  const scheduleBridge = (): void => {
    if (stopped || bridgeTimer) return;
    bridgeTimer = setTimeout(() => { bridgeTimer = null; connectBridge(); }, reconnectMs);
    bridgeTimer.unref();
  };
  const scheduleWarudo = (): void => {
    if (stopped || warudoTimer) return;
    warudoTimer = setTimeout(() => { warudoTimer = null; connectWarudo(); }, reconnectMs);
    warudoTimer.unref();
  };

  const respond = (command: TempestBridgeMessage, success: boolean, detail: string): void => {
    if (!bridge || bridge.readyState !== WebSocket.OPEN) return;
    bridge.send(JSON.stringify(createBridgeMessage({
      kind: 'response',
      source: applicationId,
      target: command.source,
      topic: command.topic,
      correlationId: command.correlationId || command.id,
      payload: { commandId: command.id, success, detail }
    })));
  };

  const handleCommand = (command: TempestBridgeMessage): void => {
    if (command.kind !== 'command' || command.target !== applicationId || !capabilities.includes(String(command.topic || ''))) return;
    const payload = command.payload && typeof command.payload === 'object' && !Array.isArray(command.payload)
      ? command.payload as Record<string, unknown> : {};
    const args = payload.arguments && typeof payload.arguments === 'object' && !Array.isArray(payload.arguments)
      ? payload.arguments as Record<string, unknown> : {};
    const phase = payload.phase === 'release' ? 'release' : 'activate';
    const cue = text(args.cue) || text(args.reactionId) || text(args.expression) || 'tempest.default';
    const data = {
      phase,
      cue,
      name: text(args.name) || cue,
      durationMs: Math.max(0, Math.round(Number(args.durationMs) || Number((payload.lease as Record<string, unknown> | undefined)?.durationMs) || 0)),
      intensity: Math.max(0, Math.min(1, Number(args.intensity) || Number(args.strength) || 1)),
      dedupeId: text(args.dedupeId) || text(payload.runId),
      runId: text(payload.runId),
      actionId: text(payload.actionId),
      capability: command.topic
    };
    if (!warudo || warudo.readyState !== WebSocket.OPEN) {
      update({ lastError: 'Warudo blueprint socket is offline.' });
      respond(command, false, 'Warudo blueprint socket is offline.');
      return;
    }
    warudo.send(JSON.stringify({ action: 'tempestPerformance', data }));
    update({ lastCue: cue, lastError: undefined });
    respond(command, true, `${phase} cue forwarded to Warudo.`);
  };

  function connectBridge(): void {
    if (stopped || bridge) return;
    update({ bridge: 'connecting' });
    const socket = new WebSocket(bridgeUrl, { handshakeTimeout: 5_000, maxPayload: 256 * 1024 });
    bridge = socket;
    socket.on('open', () => {
      update({ bridge: 'connected', lastError: undefined });
      socket.send(JSON.stringify(createBridgeMessage({
        kind: 'hello',
        source: applicationId,
        payload: { applicationId, version: '0.20.0', protocolVersion: TEMPEST_PROTOCOL_VERSION, capabilities }
      })));
      logger.info('Warudo adapter connected to Tempest Bridge.');
    });
    socket.on('message', (raw) => {
      try {
        const validation = validateBridgeMessage(JSON.parse(raw.toString()));
        if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
        handleCommand(validation.value);
      } catch (error) {
        update({ lastError: (error as Error).message });
        logger.warn(error);
      }
    });
    socket.on('error', (error) => update({ lastError: error.message }));
    socket.on('close', () => {
      if (bridge === socket) bridge = null;
      update({ bridge: 'disconnected' });
      scheduleBridge();
    });
  }

  function connectWarudo(): void {
    if (stopped || warudo) return;
    update({ warudo: 'connecting' });
    const socket = new WebSocket(warudoUrl, { handshakeTimeout: 5_000, maxPayload: 256 * 1024 });
    warudo = socket;
    socket.on('open', () => {
      update({ warudo: 'connected', lastError: undefined });
      logger.info(`Warudo adapter connected to the blueprint socket at ${warudoUrl.origin}.`);
    });
    socket.on('error', (error) => update({ lastError: error.message }));
    socket.on('close', () => {
      if (warudo === socket) warudo = null;
      update({ warudo: 'disconnected' });
      scheduleWarudo();
    });
  }

  connectBridge();
  connectWarudo();

  return {
    status: () => ({ ...current }),
    close: async () => {
      stopped = true;
      if (bridgeTimer) clearTimeout(bridgeTimer);
      if (warudoTimer) clearTimeout(warudoTimer);
      for (const socket of [bridge, warudo]) {
        if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Adapter shutting down');
      }
      bridge = null;
      warudo = null;
      update({ bridge: 'disconnected', warudo: 'disconnected' });
    }
  };
}
