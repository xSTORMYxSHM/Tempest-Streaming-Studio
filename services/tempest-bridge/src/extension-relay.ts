import { createHash } from 'node:crypto';
import { TempestNormalizedTwitchEvent, validateNormalizedTwitchEvent } from '@tempest/contracts';
import { WebSocket } from 'ws';

export type ExtensionRelayState = 'not-configured' | 'disconnected' | 'connecting' | 'connected' | 'error';
export type TwitchExtensionCompanion = 'mainframe' | 'streaming';
export interface TwitchExtensionCompanionSettings {
  schemaVersion: 1;
  mainframe: boolean;
  streaming: boolean;
}

export interface ExtensionRelayOptions {
  url: string;
  token: string;
  channelId: string;
  companions?: TwitchExtensionCompanionSettings;
  /** @deprecated Compatibility hint for pre-1.5.1 EBS deployments. */
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
  catalogSync?: {
    state: 'pending' | 'synced';
    companions: TwitchExtensionCompanionSettings;
    /** @deprecated Compatibility hint for pre-1.5.1 EBS deployments. */
    edition: 'free' | 'bits';
    revision: string;
    itemCount: number;
    sentAt: string;
    acknowledgedAt?: string;
  };
}

export function extensionCatalogKind(edition: ExtensionRelayOptions['extensionEdition']): 'sound-alert' | 'interaction' {
  return edition === 'bits' ? 'interaction' : 'sound-alert';
}

export function extensionCompanions(options: Pick<ExtensionRelayOptions, 'companions' | 'extensionEdition'>): TwitchExtensionCompanionSettings {
  if (options.companions) return { schemaVersion: 1, mainframe: options.companions.mainframe === true, streaming: options.companions.streaming === true };
  return options.extensionEdition === 'bits'
    ? { schemaVersion: 1, mainframe: false, streaming: true }
    : { schemaVersion: 1, mainframe: true, streaming: false };
}

export interface ExtensionRelayClientOptions extends ExtensionRelayOptions {
  handler(event: TempestNormalizedTwitchEvent): Promise<ExtensionRelayResult>;
  queryHandler?(query: { kind: string; viewerId: string }): Promise<ExtensionRelayResult>;
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
    destinations?: TwitchExtensionCompanion[];
  }>;
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
  private lastCatalogPayload = '';
  private lastCatalogRevision = '';
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
    if (options.extensionEdition !== undefined && !['free', 'bits'].includes(options.extensionEdition)) throw new Error('Extension relay edition must be free or bits.');
    if (options.companions && !options.companions.mainframe && !options.companions.streaming) throw new Error('At least one Twitch companion Extension must be enabled.');
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

  refreshCatalog(): void {
    if (this.socket) this.sendCatalog(this.socket, true);
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.catalogTimer) clearInterval(this.catalogTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.catalogTimer = null;
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
      if (this.catalogTimer) clearInterval(this.catalogTimer);
      this.catalogTimer = setInterval(() => this.sendCatalog(socket), 5_000);
      this.catalogTimer.unref();
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
      this.heartbeatTimer = null;
      this.catalogTimer = null;
      if (this.stopped) return this.update({ state: 'disconnected' });
      this.update({ state: 'disconnected' });
      this.scheduleReconnect();
    });
  }

  private sendCatalog(socket: WebSocket, force = false): void {
    if (!this.options.catalog || socket.readyState !== WebSocket.OPEN) return;
    try {
      const companions = extensionCompanions(this.options);
      const extensionEdition = this.options.extensionEdition || (companions.streaming && !companions.mainframe ? 'bits' : 'free');
      const catalog = { schemaVersion: 1, companions, extensionEdition, items: this.options.catalog() };
      const catalogPayload = JSON.stringify(catalog);
      if (!force && catalogPayload === this.lastCatalogPayload && this.currentStatus.catalogSync?.state === 'synced') return;
      const revision = createHash('sha256').update(catalogPayload).digest('hex').slice(0, 24);
      this.lastCatalogPayload = catalogPayload;
      this.lastCatalogRevision = revision;
      const sentAt = new Date().toISOString();
      this.update({ ...this.currentStatus, lastError: undefined, catalogSync: { state: 'pending', companions, edition: catalog.extensionEdition, revision, itemCount: catalog.items.length, sentAt } });
      socket.send(JSON.stringify({ protocolVersion: 1, type: 'catalog.sync', revision, catalog }));
    } catch (error) {
      this.logger.warn(error);
    }
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    let requestId = '';
    try {
      const message = JSON.parse(raw) as { protocolVersion?: unknown; type?: unknown; requestId?: unknown; event?: unknown; revision?: unknown; companions?: unknown; extensionEdition?: unknown; itemCount?: unknown };
      if (message.type === 'welcome' || message.type === 'heartbeat') return;
      if (message.protocolVersion === 1 && message.type === 'catalog.ack') {
        if (typeof message.revision !== 'string' || message.revision !== this.lastCatalogRevision || !this.currentStatus.catalogSync) return;
        const edition = message.extensionEdition === 'bits' ? 'bits' : 'free';
        const hasCompanionAcknowledgement = Boolean(message.companions && typeof message.companions === 'object');
        const acknowledgedCompanions = hasCompanionAcknowledgement
          ? extensionCompanions({ companions: message.companions as TwitchExtensionCompanionSettings })
          : extensionCompanions({ extensionEdition: edition });
        const itemCount = Number(message.itemCount);
        const expected = this.currentStatus.catalogSync.companions;
        const companionMismatch = hasCompanionAcknowledgement
          ? acknowledgedCompanions.mainframe !== expected.mainframe || acknowledgedCompanions.streaming !== expected.streaming
          : edition !== this.currentStatus.catalogSync.edition;
        if (companionMismatch || !Number.isInteger(itemCount) || itemCount !== this.currentStatus.catalogSync.itemCount) throw new Error('EBS acknowledged a different Extension catalog than Studio published.');
        this.update({ ...this.currentStatus, lastError: undefined, catalogSync: { ...this.currentStatus.catalogSync, state: 'synced', acknowledgedAt: new Date().toISOString() } });
        return;
      }
      if (message.protocolVersion !== 1 || !['interaction', 'kick.event', 'viewer.query'].includes(String(message.type)) || typeof message.requestId !== 'string') throw new Error('EBS sent an invalid relay message.');
      requestId = message.requestId;
      if (message.type === 'viewer.query') {
        if (!this.options.queryHandler || !message.event || typeof message.event !== 'object' || Array.isArray(message.event)) throw new Error('EBS sent an invalid viewer query.');
        const query = message.event as { kind?: unknown; viewerId?: unknown };
        const kind = String(query.kind || '').trim();
        const viewerId = String(query.viewerId || '').trim();
        if (!/^[a-z][a-z0-9.-]{2,63}$/.test(kind) || !/^\d{1,30}$/.test(viewerId)) throw new Error('EBS viewer query fields are invalid.');
        const result = await this.options.queryHandler({ kind, viewerId });
        if (!Number.isInteger(result.status) || result.status < 100 || result.status > 599) throw new Error('Studio viewer query handler returned an invalid HTTP status.');
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ protocolVersion: 1, type: 'result', requestId, status: result.status, body: result.body }));
        return;
      }
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
