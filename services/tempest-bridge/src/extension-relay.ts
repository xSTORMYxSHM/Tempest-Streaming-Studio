import { TempestNormalizedTwitchEvent, validateNormalizedTwitchEvent } from '@tempest/contracts';
import { WebSocket } from 'ws';

export type ExtensionRelayState = 'not-configured' | 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ExtensionRelayOptions {
  url: string;
  token: string;
  channelId: string;
  allowUnauthorizedLocalTls?: boolean;
}

export interface ExtensionRelayResult {
  status: number;
  body: unknown;
}

export interface ExtensionRelayStatus {
  state: ExtensionRelayState;
  lastConnectedAt?: string;
  lastInteractionAt?: string;
  lastError?: string;
}

export interface ExtensionRelayClientOptions extends ExtensionRelayOptions {
  handler(event: TempestNormalizedTwitchEvent): Promise<ExtensionRelayResult>;
  onStatus?(status: ExtensionRelayStatus): void;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

function validRelayUrl(value: string): URL {
  const url = new URL(value);
  const localDevelopment = url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'wss:' && !localDevelopment) throw new Error('Extension relay URL must use wss://, except for localhost development.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Extension relay credentials must not be embedded in its URL.');
  if (url.pathname === '/' || !url.pathname) url.pathname = '/v1/studio';
  return url;
}

export function extensionRelayOptionsFromEnvironment(environment: NodeJS.ProcessEnv = process.env): ExtensionRelayOptions | undefined {
  const url = String(environment.TEMPEST_EXTENSION_RELAY_URL || '').trim();
  const token = String(environment.TEMPEST_EXTENSION_RELAY_TOKEN || '').trim();
  const channelId = String(environment.TEMPEST_EXTENSION_CHANNEL_ID || '').trim();
  if (!url && !token && !channelId) return undefined;
  if (!url || !token || !channelId) throw new Error('TEMPEST_EXTENSION_RELAY_URL, TEMPEST_EXTENSION_RELAY_TOKEN, and TEMPEST_EXTENSION_CHANNEL_ID must be configured together.');
  return { url, token, channelId, allowUnauthorizedLocalTls: environment.TEMPEST_EXTENSION_RELAY_ALLOW_SELF_SIGNED === '1' };
}

export class TempestExtensionRelayClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private stopped = true;
  private currentStatus: ExtensionRelayStatus = { state: 'disconnected' };
  private readonly url: URL;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly options: ExtensionRelayClientOptions) {
    this.url = validRelayUrl(options.url);
    if (options.allowUnauthorizedLocalTls && !['127.0.0.1', 'localhost', '::1'].includes(this.url.hostname)) {
      throw new Error('Self-signed relay TLS can only be enabled for a loopback address.');
    }
    if (options.token.trim().length < 32) throw new Error('Extension relay token must contain at least 32 characters.');
    if (!/^\d{1,30}$/.test(options.channelId)) throw new Error('Extension relay channelId must be a numeric Twitch channel ID.');
    this.logger = options.logger || console;
  }

  status(): ExtensionRelayStatus {
    return { ...this.currentStatus };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) {
      await new Promise<void>((resolve) => {
        socket.once('close', () => resolve());
        socket.close(1000, 'Studio shutting down');
        setTimeout(resolve, 1_000).unref();
      });
    }
    this.update({ state: 'disconnected' });
  }

  private connect(): void {
    if (this.stopped) return;
    this.update({ state: 'connecting', lastError: undefined });
    const socket = new WebSocket(this.url, {
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        'X-Tempest-Channel-Id': this.options.channelId
      },
      handshakeTimeout: 10_000,
      maxPayload: 128 * 1024,
      rejectUnauthorized: !this.options.allowUnauthorizedLocalTls
    });
    this.socket = socket;

    socket.on('open', () => {
      if (this.socket !== socket) return socket.close();
      this.reconnectAttempt = 0;
      this.update({ state: 'connected', lastConnectedAt: new Date().toISOString(), lastError: undefined });
      this.logger.info(`Studio connected to the Twitch Extension relay for channel ${this.options.channelId}.`);
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ protocolVersion: 1, type: 'heartbeat' }));
      }, 25_000);
      this.heartbeatTimer.unref();
    });

    socket.on('message', (raw) => void this.handleMessage(socket, raw.toString()));
    socket.on('error', (error) => {
      if (this.socket !== socket) return;
      this.update({ state: 'error', lastError: error.message });
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (this.stopped) return this.update({ state: 'disconnected' });
      this.update({ state: 'disconnected' });
      this.scheduleReconnect();
    });
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    let requestId = '';
    try {
      const message = JSON.parse(raw) as { protocolVersion?: unknown; type?: unknown; requestId?: unknown; event?: unknown };
      if (message.type === 'welcome' || message.type === 'heartbeat') return;
      if (message.protocolVersion !== 1 || message.type !== 'interaction' || typeof message.requestId !== 'string') throw new Error('EBS sent an invalid relay message.');
      requestId = message.requestId;
      const validation = validateNormalizedTwitchEvent(message.event);
      if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
      if (validation.value.channel.id !== this.options.channelId) throw new Error('EBS interaction channel does not match this Studio relay.');
      const result = await this.options.handler(validation.value);
      if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599) throw new Error('Studio relay handler returned an invalid HTTP status.');
      this.update({ ...this.currentStatus, lastInteractionAt: new Date().toISOString(), lastError: undefined });
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId, status: result.status, body: result.body }));
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(error);
      this.update({ ...this.currentStatus, lastError: message });
      if (requestId && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId, status: 400, body: { error: message } }));
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(5, this.reconnectAttempt++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    this.reconnectTimer.unref();
  }

  private update(status: ExtensionRelayStatus): void {
    this.currentStatus = { ...status };
    this.options.onStatus?.(this.status());
  }
}
