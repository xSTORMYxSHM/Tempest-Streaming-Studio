import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { boundedFetch } from './bounded-fetch';
import { readResponseJson } from './bounded-response';

const hostedDiscordFetch = boundedFetch(fetch, 10_000);
export const OFFICIAL_HOSTED_DISCORD_URL = 'https://signal.tempestmainframe.com';
export const OFFICIAL_DISCORD_APPLICATION_ID = '1563649540182245446';

export interface HostedDiscordCredentials {
  schemaVersion: 1;
  baseUrl: string;
  bindingId: string;
  guildId: string;
  studioAlias: string;
  relayToken: string;
  pairedAt: string;
}

export interface HostedDiscordPairing {
  schemaVersion: 1;
  id: string;
  code: string;
  pollToken: string;
  expiresAt: string;
  installUrl: string;
  baseUrl: string;
}

export interface HostedDiscordStatus {
  state: 'unpaired' | 'pairing' | 'disconnected' | 'connecting' | 'connected' | 'error';
  paired: boolean;
  credentialStorage: 'windows-encrypted' | 'unavailable';
  guildId?: string;
  studioAlias?: string;
  participantCount: number;
  pairingCode?: string;
  pairingExpiresAt?: string;
  installUrl?: string;
  lastError?: string;
}

export function validateHostedDiscordBaseUrl(value: unknown): string {
  const parsed = new URL(String(value || OFFICIAL_HOSTED_DISCORD_URL).trim());
  const localDevelopment = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) && parsed.protocol === 'http:';
  if ((parsed.protocol !== 'https:' && !localDevelopment) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Tempest Signal must be a public HTTPS URL.');
  return parsed.toString().replace(/\/$/, '');
}

export function validateHostedDiscordCredentials(value: unknown): HostedDiscordCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Hosted Discord credentials are invalid.');
  const input = value as Record<string, unknown>;
  const relayToken = String(input.relayToken || '');
  const bindingId = String(input.bindingId || '');
  const guildId = String(input.guildId || '');
  const studioAlias = String(input.studioAlias || '').trim();
  if (relayToken.length < 32 || !/^[0-9a-f-]{36}$/i.test(bindingId) || !/^\d{17,20}$/.test(guildId) || !studioAlias || studioAlias.length > 60) throw new Error('Hosted Discord credentials are invalid.');
  return { schemaVersion: 1, baseUrl: validateHostedDiscordBaseUrl(input.baseUrl), bindingId, guildId, studioAlias, relayToken, pairedAt: new Date(String(input.pairedAt || '')).toISOString() };
}

function validateDiscordInstallUrl(value: unknown): string {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'discord.com' || parsed.pathname !== '/oauth2/authorize') throw new Error();
    return parsed.toString();
  } catch { throw new Error('Tempest Signal returned an invalid Discord install URL.'); }
}

export async function getHostedDiscordInstallUrl(baseUrlValue: unknown): Promise<string> {
  const baseUrl = validateHostedDiscordBaseUrl(baseUrlValue);
  if (baseUrl === OFFICIAL_HOSTED_DISCORD_URL) {
    const official = new URL('https://discord.com/oauth2/authorize');
    official.searchParams.set('client_id', OFFICIAL_DISCORD_APPLICATION_ID);
    official.searchParams.set('scope', 'bot applications.commands');
    official.searchParams.set('permissions', '3146752');
    official.searchParams.set('integration_type', '0');
    return official.toString();
  }
  const response = await hostedDiscordFetch(`${baseUrl}/v1/discord/install`);
  const body = await readResponseJson<Record<string, unknown>>(response, 64 * 1024);
  if (!response.ok) throw new Error(String(body.error || `Tempest Signal returned ${response.status}.`));
  return validateDiscordInstallUrl(body.installUrl);
}

export async function createHostedDiscordPairing(baseUrlValue: unknown, studioAliasValue: unknown, studioInstallationId: string = randomUUID()): Promise<HostedDiscordPairing> {
  const baseUrl = validateHostedDiscordBaseUrl(baseUrlValue);
  const studioAlias = String(studioAliasValue || '').trim();
  if (!studioAlias || studioAlias.length > 60 || /[\r\n\0]/.test(studioAlias)) throw new Error('Studio alias must contain 1–60 characters.');
  const response = await hostedDiscordFetch(`${baseUrl}/v1/discord/studio/pairings`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ studioInstallationId, studioAlias }) });
  const body = await readResponseJson<Record<string, unknown>>(response, 64 * 1024);
  if (!response.ok) throw new Error(String(body.error || `Tempest Signal returned ${response.status}.`));
  const id = String(body.id || '');
  const code = String(body.code || '');
  const pollToken = String(body.pollToken || '');
  const installUrl = validateDiscordInstallUrl(body.installUrl);
  const expiresAt = new Date(String(body.expiresAt || '')).toISOString();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[A-Z2-9]{8}$/.test(code) || pollToken.length < 32) throw new Error('Tempest Signal returned an invalid Discord pairing.');
  return { schemaVersion: 1, id, code, pollToken, expiresAt, installUrl, baseUrl };
}

export async function pollHostedDiscordPairing(pairing: HostedDiscordPairing): Promise<{ state: 'pending' } | { state: 'complete'; credentials: HostedDiscordCredentials }> {
  const response = await hostedDiscordFetch(`${pairing.baseUrl}/v1/discord/studio/pairings/${encodeURIComponent(pairing.id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pollToken: pairing.pollToken })
  });
  const body = await readResponseJson<Record<string, unknown>>(response, 64 * 1024);
  if (!response.ok) throw new Error(String(body.error || `Tempest Signal returned ${response.status}.`));
  if (body.state !== 'complete') return { state: 'pending' };
  return { state: 'complete', credentials: validateHostedDiscordCredentials({ schemaVersion: 1, baseUrl: pairing.baseUrl, bindingId: body.bindingId, guildId: body.guildId, studioAlias: body.studioAlias, relayToken: body.relayToken, pairedAt: new Date().toISOString() }) };
}

export async function updateHostedDiscordAlias(credentialsValue: unknown, studioAliasValue: unknown): Promise<HostedDiscordCredentials> {
  const credentials = validateHostedDiscordCredentials(credentialsValue);
  const studioAlias = String(studioAliasValue || '').trim();
  if (!studioAlias || studioAlias.length > 60 || /[\r\n\0]/.test(studioAlias)) throw new Error('Studio alias must contain 1–60 characters.');
  const response = await hostedDiscordFetch(`${credentials.baseUrl}/v1/discord/studio/current`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${credentials.relayToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ studioAlias })
  });
  const body = await readResponseJson<Record<string, unknown>>(response, 64 * 1024);
  if (!response.ok) throw new Error(String(body.error || `Tempest Signal returned ${response.status}.`));
  if (String(body.bindingId || '') !== credentials.bindingId || String(body.guildId || '') !== credentials.guildId || String(body.studioAlias || '') !== studioAlias) throw new Error('Tempest Signal returned an invalid Discord alias update.');
  return validateHostedDiscordCredentials({ ...credentials, studioAlias });
}

export interface HostedDiscordClientOptions {
  credentials: HostedDiscordCredentials;
  publishState(state: Record<string, unknown>): Promise<void>;
  onStatus?(status: HostedDiscordStatus): void;
  reconnectMs?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export class TempestHostedDiscordClient {
  private socket: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private phase: HostedDiscordStatus['state'] = 'disconnected';
  private participantCount = 0;
  private lastError = '';
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly options: HostedDiscordClientOptions) { this.logger = options.logger || console; }

  status(): HostedDiscordStatus {
    return { state: this.phase, paired: true, credentialStorage: 'windows-encrypted', guildId: this.options.credentials.guildId, studioAlias: this.options.credentials.studioAlias, participantCount: this.participantCount, ...(this.lastError ? { lastError: this.lastError } : {}) };
  }

  connect(): void {
    if (this.socket || this.stopped) return;
    this.phase = 'connecting';
    this.notify();
    const socketUrl = new URL(this.options.credentials.baseUrl);
    socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    socketUrl.pathname = '/v1/discord/studio';
    const socket = new WebSocket(socketUrl, { headers: { Authorization: `Bearer ${this.options.credentials.relayToken}` }, maxPayload: 256 * 1024 });
    this.socket = socket;
    socket.on('open', () => {
      this.phase = 'connected';
      this.lastError = '';
      this.heartbeatTimer = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: 'heartbeat' })), 25_000);
      this.notify();
    });
    socket.on('message', (raw) => void this.onMessage(raw.toString()));
    socket.on('error', (error) => { this.lastError = error.message; this.logger.warn(error); });
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      if (this.stopped) return;
      this.phase = this.lastError ? 'error' : 'disconnected';
      this.notify();
      this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, this.options.reconnectMs || 5_000);
    });
  }

  private async onMessage(raw: string): Promise<void> {
    try {
      const message = JSON.parse(raw) as Record<string, unknown>;
      if (message.type === 'voice.snapshot') {
        const participants = Array.isArray(message.participants) ? message.participants : [];
        this.participantCount = participants.length;
        await this.options.publishState({ connected: true, channelId: String(message.channelId || ''), channelName: String(message.channelName || 'Discord voice'), guildName: String(message.guildName || 'Discord server'), participants });
        this.notify();
      } else if (message.type === 'session.state' && (message.state === 'stopped' || message.state === 'failed')) {
        this.participantCount = 0;
        await this.options.publishState({ connected: false, participants: [], ...(message.state === 'failed' ? { error: String(message.reason || 'Discord voice session failed.') } : {}) });
        this.notify();
      }
    } catch (error) { this.logger.warn(error); }
  }

  private notify(): void { this.options.onStatus?.(this.status()); }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    const socket = this.socket;
    this.socket = null;
    this.phase = 'disconnected';
    await this.options.publishState({ connected: false, participants: [] }).catch(() => {});
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { socket.terminate(); resolve(); }, 2_000);
      socket.once('close', () => { clearTimeout(timer); resolve(); });
      socket.close(1000, 'Studio closing');
    });
  }
}
