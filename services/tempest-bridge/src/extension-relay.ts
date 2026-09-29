import { TempestNormalizedTwitchEvent, validateNormalizedTwitchEvent } from '@tempest/contracts';
import { WebSocket } from 'ws';

export type ExtensionRelayState = 'not-configured' | 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ExtensionRelayOptions {
  url: string;
  token: string;
  channelId: string;
  extensionEdition?: 'free' | 'bits';
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

export interface ExtensionRelayPoll {
  id: string;
  state: 'active' | 'closed';
  question: string;
  options: Array<{ number: number; label: string; votes: number; percentage: number }>;
  totalVotes: number;
  startedAt: string;
  endedAt?: string;
  lastVoteAt?: string;
}

export interface ExtensionRelayCounter {
  id: string;
  command: string;
  trigger: string;
  label: string;
  value: number;
}

export interface ExtensionRelayCommand {
  trigger: string;
  aliases: string[];
  permission: 'everyone' | 'subscriber' | 'moderator' | 'broadcaster';
  allowSharedChat: boolean;
}

export interface ExtensionRelayGoal {
  source: 'twitch' | 'studio';
  kind: 'subscriptions' | 'followers' | 'bits' | 'donations' | 'custom';
  title: string;
  currentAmount: number;
  targetAmount: number;
  unit: string;
  accent: string;
}

export interface ExtensionRelayNowPlaying {
  stationName: string;
  state: 'online' | 'offline' | 'unavailable';
  artist?: string;
  title?: string;
  text?: string;
  album?: string;
  publicPlayerUrl: string;
  checkedAt: string;
}

export interface ExtensionRelaySchedule {
  title?: string;
  startTime: string;
}

export interface ExtensionRelayStream {
  live: boolean;
  title: string;
  category?: string;
  startedAt?: string;
  viewerCount?: number;
  checkedAt: string;
}

export function extensionCatalogKind(edition: ExtensionRelayOptions['extensionEdition']): 'sound-alert' | 'interaction' {
  return edition === 'bits' ? 'interaction' : 'sound-alert';
}

export interface ExtensionRelayClientOptions extends ExtensionRelayOptions {
  handler(event: TempestNormalizedTwitchEvent): Promise<ExtensionRelayResult>;
  kickEventHandler?(event: { event: unknown; eventId?: string; occurredAt?: string }): Promise<ExtensionRelayResult>;
  catalog?(): Array<{
    id: string;
    name: string;
    durationMs: number;
    cooldownMs?: number;
    viewerCooldownMs?: number;
    globalCooldownMs?: number;
    category?: 'sticker' | 'gif' | 'jumpscare' | 'screen-effect' | 'sound' | 'counter' | 'community' | 'other';
    placementMode?: 'fixed' | 'viewer';
    access?: {
      mode: 'everyone' | 'staff' | 'assigned-creators' | 'specific-viewers';
      allowedViewerIds: string[];
      blockedViewerIds: string[];
      hideWhenLocked: boolean;
    };
    accent: string;
    glyph: string;
    kind: 'sound-alert' | 'interaction';
  }>;
  poll?(): ExtensionRelayPoll | undefined;
  counters?(): ExtensionRelayCounter[];
  commands?(): ExtensionRelayCommand[];
  goal?(): ExtensionRelayGoal | undefined;
  nowPlaying?(): Promise<ExtensionRelayNowPlaying | undefined>;
  schedule?(): Promise<ExtensionRelaySchedule | undefined>;
  stream?(): Promise<ExtensionRelayStream | undefined>;
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
  private catalogTimer: NodeJS.Timeout | null = null;
  private catalogSyncTimer: NodeJS.Timeout | null = null;
  private dynamicCatalogTimer: NodeJS.Timeout | null = null;
  private dynamicCatalogSyncTimer: NodeJS.Timeout | null = null;
  private nowPlaying: ExtensionRelayNowPlaying | undefined;
  private schedule: ExtensionRelaySchedule | undefined;
  private stream: ExtensionRelayStream | undefined;
  private refreshingDynamicCatalog = false;
  private dynamicCatalogRefreshRequested = false;
  private lastDynamicCatalogRefreshAt = 0;
  private lastCatalogPayload = '';
  private reconnectAttempt = 0;
  private lastCatalogSentAt = 0;
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
    if (options.extensionEdition !== undefined && !['free', 'bits'].includes(options.extensionEdition)) throw new Error('Extension relay edition must be free or bits.');
    this.logger = options.logger || console;
  }

  status(): ExtensionRelayStatus {
    return { ...this.currentStatus };
  }

  syncCatalog(): void {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN) return;
    const delay = Math.max(0, 100 - (Date.now() - this.lastCatalogSentAt));
    if (!delay) this.sendCatalog(socket);
    else if (!this.catalogSyncTimer) {
      this.catalogSyncTimer = setTimeout(() => {
        this.catalogSyncTimer = null;
        if (this.socket === socket && socket.readyState === WebSocket.OPEN) this.sendCatalog(socket);
      }, delay);
      this.catalogSyncTimer.unref?.();
    }
    void this.refreshDynamicCatalog(socket);
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
    if (this.catalogTimer) clearInterval(this.catalogTimer);
    if (this.catalogSyncTimer) clearTimeout(this.catalogSyncTimer);
    if (this.dynamicCatalogTimer) clearInterval(this.dynamicCatalogTimer);
    if (this.dynamicCatalogSyncTimer) clearTimeout(this.dynamicCatalogSyncTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.catalogTimer = null;
    this.catalogSyncTimer = null;
    this.dynamicCatalogTimer = null;
    this.dynamicCatalogSyncTimer = null;
    this.dynamicCatalogRefreshRequested = false;
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
      this.sendCatalog(socket, true);
      void this.refreshDynamicCatalog(socket);
      if (this.catalogTimer) clearInterval(this.catalogTimer);
      if (this.catalogSyncTimer) clearTimeout(this.catalogSyncTimer);
      this.catalogTimer = setInterval(() => this.sendCatalog(socket), 30_000);
      this.catalogTimer.unref();
      if (this.dynamicCatalogTimer) clearInterval(this.dynamicCatalogTimer);
      if (this.dynamicCatalogSyncTimer) clearTimeout(this.dynamicCatalogSyncTimer);
      this.dynamicCatalogTimer = setInterval(() => void this.refreshDynamicCatalog(socket), 15_000);
      this.dynamicCatalogTimer.unref();
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
      if (this.catalogTimer) clearInterval(this.catalogTimer);
      if (this.dynamicCatalogTimer) clearInterval(this.dynamicCatalogTimer);
      this.heartbeatTimer = null;
      this.catalogTimer = null;
      this.catalogSyncTimer = null;
      this.dynamicCatalogTimer = null;
      this.dynamicCatalogSyncTimer = null;
      if (this.stopped) return this.update({ state: 'disconnected' });
      this.update({ state: 'disconnected' });
      this.scheduleReconnect();
    });
  }

  private sendCatalog(socket: WebSocket, force = false): void {
    if (!this.options.catalog || socket.readyState !== WebSocket.OPEN) return;
    try {
      const poll = this.options.extensionEdition === 'bits' ? undefined : this.options.poll?.();
      const counters = this.options.extensionEdition === 'bits' ? [] : this.options.counters?.() || [];
      const commands = this.options.extensionEdition === 'bits' ? [] : this.options.commands?.() || [];
      const goal = this.options.extensionEdition === 'bits' ? undefined : this.options.goal?.();
      const nowPlaying = this.options.extensionEdition === 'bits' ? undefined : this.nowPlaying;
      const schedule = this.options.extensionEdition === 'bits' ? undefined : this.schedule;
      const stream = this.options.extensionEdition === 'bits' ? undefined : this.stream;
      const catalog = { schemaVersion: 1, extensionEdition: this.options.extensionEdition || 'free', items: this.options.catalog(), ...(poll ? { poll } : {}), ...(counters.length ? { counters } : {}), ...(commands.length ? { commands } : {}), ...(goal ? { goal } : {}), ...(nowPlaying ? { nowPlaying } : {}), ...(schedule ? { schedule } : {}), ...(stream ? { stream } : {}) };
      const payload = JSON.stringify({ protocolVersion: 1, type: 'catalog.sync', catalog });
      if (!force && payload === this.lastCatalogPayload) return;
      this.lastCatalogPayload = payload;
      socket.send(payload);
      this.lastCatalogSentAt = Date.now();
    } catch (error) {
      this.logger.warn(error);
    }
  }

  private async refreshDynamicCatalog(socket: WebSocket): Promise<void> {
    if ((!this.options.nowPlaying && !this.options.schedule && !this.options.stream) || socket.readyState !== WebSocket.OPEN) return;
    const delay = Math.max(0, 1_000 - (Date.now() - this.lastDynamicCatalogRefreshAt));
    if (delay) {
      if (!this.dynamicCatalogSyncTimer) {
        this.dynamicCatalogSyncTimer = setTimeout(() => {
          this.dynamicCatalogSyncTimer = null;
          if (this.socket === socket && socket.readyState === WebSocket.OPEN) void this.refreshDynamicCatalog(socket);
        }, delay);
        this.dynamicCatalogSyncTimer.unref?.();
      }
      return;
    }
    if (this.refreshingDynamicCatalog) {
      this.dynamicCatalogRefreshRequested = true;
      return;
    }
    this.refreshingDynamicCatalog = true;
    this.lastDynamicCatalogRefreshAt = Date.now();
    try {
      const [nowPlaying, schedule, stream] = await Promise.allSettled([
        this.options.nowPlaying?.() || Promise.resolve(undefined),
        this.options.schedule?.() || Promise.resolve(undefined),
        this.options.stream?.() || Promise.resolve(undefined)
      ]);
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (nowPlaying.status === 'fulfilled') this.nowPlaying = nowPlaying.value;
      else this.logger.warn(nowPlaying.reason);
      if (schedule.status === 'fulfilled') this.schedule = schedule.value;
      else this.logger.warn(schedule.reason);
      if (stream.status === 'fulfilled') this.stream = stream.value;
      else this.logger.warn(stream.reason);
      this.sendCatalog(socket);
    } catch (error) {
      this.logger.warn(error);
    } finally {
      this.refreshingDynamicCatalog = false;
      if (this.dynamicCatalogRefreshRequested) {
        this.dynamicCatalogRefreshRequested = false;
        if (this.socket === socket && socket.readyState === WebSocket.OPEN) void this.refreshDynamicCatalog(socket);
      }
    }
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    let requestId = '';
    try {
      const message = JSON.parse(raw) as { protocolVersion?: unknown; type?: unknown; requestId?: unknown; event?: unknown };
      if (message.type === 'welcome' || message.type === 'heartbeat' || message.type === 'catalog.ack') return;
      if (message.protocolVersion !== 1 || !['interaction', 'kick.event'].includes(String(message.type)) || typeof message.requestId !== 'string') throw new Error('EBS sent an invalid relay message.');
      requestId = message.requestId;
      if (message.type === 'kick.event') {
        if (!this.options.kickEventHandler || !message.event || typeof message.event !== 'object' || Array.isArray(message.event)) throw new Error('EBS sent an invalid Kick relay event.');
        const envelope = message.event as { event?: unknown; eventId?: unknown; occurredAt?: unknown };
        const result = await this.options.kickEventHandler({ event: envelope.event, eventId: typeof envelope.eventId === 'string' ? envelope.eventId : undefined, occurredAt: typeof envelope.occurredAt === 'string' ? envelope.occurredAt : undefined });
        if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599) throw new Error('Studio Kick relay handler returned an invalid HTTP status.');
        this.update({ ...this.currentStatus, lastInteractionAt: new Date().toISOString(), lastError: undefined });
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId, status: result.status, body: result.body }));
        return;
      }
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
