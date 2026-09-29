import { createHash, randomBytes, randomUUID, verify as verifySignature } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { AddressInfo } from 'node:net';
import { URL } from 'node:url';
import { TempestNormalizedTwitchEvent } from '@tempest/contracts';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeTwitchSecrets, TwitchExtensionClaims, verifyTwitchBitsTransactionReceipt, verifyTwitchExtensionJwt } from './jwt';
import {
  MemoryTwitchEbsInstallationStore,
  PublicExtensionCatalog,
  PublicExtensionCatalogItem,
  PublicExtensionCounter,
  PublicExtensionGoal,
  PublicExtensionNowPlaying,
  PublicExtensionSchedule,
  PublicExtensionPanelDesign,
  PublicExtensionPoll,
  TwitchEbsInstallation,
  TwitchEbsInstallationStore
} from './installation-store';

export { decodeTwitchSecrets, verifyTwitchBitsTransactionReceipt, verifyTwitchExtensionJwt } from './jwt';
export {
  MemoryTwitchEbsInstallationStore,
  PostgresTwitchEbsInstallationStore
} from './installation-store';
export type {
  PublicExtensionCatalog,
  PublicExtensionCatalogItem,
  PublicExtensionGoal,
  PublicExtensionNowPlaying,
  PublicExtensionSchedule,
  PublicExtensionPanelDesign,
  PublicExtensionPoll,
  TwitchEbsInstallation,
  TwitchEbsInstallationStore
} from './installation-store';

export interface TwitchOAuthIdentity {
  clientId: string;
  userId: string;
  login: string;
  scopes: string[];
  expiresIn: number;
}

export interface KickOAuthIdentity {
  userId: string;
  username: string;
}

export interface StartTwitchEbsOptions {
  host?: string;
  port?: number;
  twitchExtensionSecrets: string[];
  relayToken?: string;
  allowedChannelIds?: string[];
  allowedActions?: string[];
  installationStore?: TwitchEbsInstallationStore;
  allowedTwitchClientIds?: string[];
  validateTwitchOAuthToken?: (accessToken: string) => Promise<TwitchOAuthIdentity>;
  validateKickOAuthToken?: (accessToken: string) => Promise<KickOAuthIdentity>;
  verifyKickWebhook?: (messageId: string, timestamp: string, rawBody: Buffer, signature: string) => boolean;
  allowedOrigins?: string[];
  allowAnonymous?: boolean;
  viewerRequestsPerMinute?: number;
  channelRequestsPerMinute?: number;
  relayTimeoutMs?: number;
  bitsExtension?: {
    clientId: string;
    secrets: string[];
    products: Record<string, { action: string; bits: number }>;
  };
  discordOAuth?: {
    clientId: string;
    clientSecret: string;
    redirectUri?: string;
    exchange?: (body: URLSearchParams) => Promise<Response>;
  };
  tls?: {
    pfx: Buffer;
    passphrase?: string;
  };
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface TwitchEbsRuntime {
  host: string;
  port: number;
  baseUrl: string;
  websocketUrl: string;
  close(): Promise<void>;
}

interface RelayResult {
  status: number;
  body: unknown;
}

interface PendingRelay {
  channelId: string;
  timer: NodeJS.Timeout;
  resolve(result: RelayResult): void;
  reject(error: Error): void;
}

interface CachedResult extends RelayResult {
  storedAt: number;
}

interface BitsReservation {
  token: string;
  channelId: string;
  viewerId: string;
  sku: string;
  action: string;
  expiresAt: number;
  placement?: { x: number; y: number };
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}

export class SlidingWindowLimiter {
  private readonly entries = new Map<string, number[]>();
  private lastPrunedAt = 0;

  constructor(private readonly maxEntries = 50_000, private readonly pruneIntervalMs = 60_000) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) throw new Error('Rate limiter capacity must be a positive integer.');
    if (!Number.isInteger(pruneIntervalMs) || pruneIntervalMs < 1) throw new Error('Rate limiter prune interval must be a positive integer.');
  }

  get entryCount(): number {
    return this.entries.size;
  }

  private prune(now: number, reserveForNewKey: boolean): void {
    const cutoff = now - 60_000;
    for (const [key, timestamps] of this.entries) {
      const active = timestamps.filter((timestamp) => timestamp > cutoff);
      if (active.length) this.entries.set(key, active);
      else this.entries.delete(key);
    }
    const targetSize = Math.max(0, this.maxEntries - (reserveForNewKey ? 1 : 0));
    while (this.entries.size > targetSize) this.entries.delete(this.entries.keys().next().value as string);
    this.lastPrunedAt = now;
  }

  consume(key: string, limit: number, now = Date.now()): number {
    const isNewKey = !this.entries.has(key);
    if (now - this.lastPrunedAt >= this.pruneIntervalMs || (isNewKey && this.entries.size >= this.maxEntries)) this.prune(now, isNewKey);
    const cutoff = now - 60_000;
    const timestamps = (this.entries.get(key) || []).filter((timestamp) => timestamp > cutoff);
    this.entries.delete(key);
    if (timestamps.length >= limit) {
      this.entries.set(key, timestamps);
      return Math.max(1, timestamps[0] + 60_000 - now);
    }
    timestamps.push(now);
    this.entries.set(key, timestamps);
    return 0;
  }
}

const maximumBodyBytes = 16 * 1024;
const requestIdPattern = /^[A-Za-z0-9_-]{16,128}$/;
const actionPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/;
const soundAlertPattern = /^sound-alert\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const glyphPattern = /^[A-Z0-9]{1,4}$/;
const kickPublicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAq/+l1WnlRrGSolDMA+A8
6rAhMbQGmQ2SapVcGM3zq8ANXjnhDWocMqfWcTd95btDydITa10kDvHzw9WQOqp2
MZI7ZyrfzJuz5nhTPCiJwTwnEtWft7nV14BYRDHvlfqPUaZ+1KR4OCaO/wWIk/rQ
L/TjY0M70gse8rlBkbo2a8rKhu69RQTRsoaf4DVhDPEeSeI5jVrRDGAMGL3cGuyY
6CLKGdjVEM78g3JfYOvDU/RvfqD7L89TZ3iN94jrmWdGz34JNlEI5hqK8dd7C5EF
BEbZ5jgB8s8ReQV8H+MkuffjdAj3ajDDX3DOJMIut1lBrUVD1AaSrGCKHooWoL2e
twIDAQAB
-----END PUBLIC KEY-----`;

function relayTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function bearerToken(request: IncomingMessage): string {
  const authorization = String(request.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function extensionToken(request: IncomingMessage): string {
  const direct = String(request.headers['x-extension-jwt'] || '').trim();
  return direct || bearerToken(request);
}

function twitchOAuthToken(request: IncomingMessage): string {
  return String(request.headers['x-twitch-oauth'] || '').trim() || bearerToken(request);
}

function kickOAuthToken(request: IncomingMessage): string {
  return String(request.headers['x-kick-oauth'] || '').trim() || bearerToken(request);
}

async function validateKickOAuthToken(accessToken: string): Promise<KickOAuthIdentity> {
  if (!accessToken || accessToken.length > 4096 || /[\r\n\0]/.test(accessToken)) throw new HttpError(401, 'A valid Kick OAuth token is required.');
  const response = await fetch('https://api.kick.com/public/v1/users', { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({})) as { data?: Array<{ user_id?: number | string; name?: string }>; message?: unknown; error?: unknown };
  const user = body.data?.[0];
  if (!response.ok || !user?.user_id || !user.name) throw new HttpError(401, String(body.message || body.error || 'Kick OAuth validation failed.'));
  return { userId: String(user.user_id), username: user.name };
}

function verifyKickWebhook(messageId: string, timestamp: string, rawBody: Buffer, signature: string): boolean {
  if (!messageId || !timestamp || !signature || !Number.isFinite(Date.parse(timestamp))) return false;
  if (Math.abs(Date.now() - Date.parse(timestamp)) > 10 * 60_000) return false;
  try {
    return verifySignature('RSA-SHA256', Buffer.from(`${messageId}.${timestamp}.${rawBody.toString('utf8')}`), kickPublicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

async function validateTwitchOAuthToken(accessToken: string): Promise<TwitchOAuthIdentity> {
  if (!accessToken || accessToken.length > 2048 || /[\r\n\0]/.test(accessToken)) throw new HttpError(401, 'A valid Twitch OAuth token is required.');
  const response = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${accessToken}` } });
  const body = await response.json().catch(() => ({})) as { client_id?: unknown; user_id?: unknown; login?: unknown; scopes?: unknown; expires_in?: unknown; message?: unknown };
  if (!response.ok || typeof body.client_id !== 'string' || typeof body.user_id !== 'string' || typeof body.login !== 'string') {
    throw new HttpError(401, typeof body.message === 'string' ? body.message : 'Twitch OAuth validation failed.');
  }
  if (!/^\d{1,30}$/.test(body.user_id) || !/^[a-z0-9_]{1,80}$/i.test(body.login)) throw new HttpError(401, 'Twitch OAuth identity is invalid.');
  return {
    clientId: body.client_id,
    userId: body.user_id,
    login: body.login,
    scopes: Array.isArray(body.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === 'string') : [],
    expiresIn: Math.max(0, Number(body.expires_in) || 0)
  };
}

function validatePublicCatalog(value: unknown): PublicExtensionCatalog {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Catalog sync must be an object.');
  const source = value as { extensionEdition?: unknown; items?: unknown; poll?: unknown; counters?: unknown; goal?: unknown; nowPlaying?: unknown; schedule?: unknown };
  if (source.extensionEdition !== undefined && !['free', 'bits'].includes(String(source.extensionEdition))) throw new Error('Catalog sync has an invalid Extension edition.');
  const extensionEdition = source.extensionEdition === 'bits' ? 'bits' : 'free';
  if (!Array.isArray(source.items) || source.items.length > 200) throw new Error('Catalog sync supports at most 200 items.');
  const seen = new Set<string>();
  const items: PublicExtensionCatalogItem[] = source.items.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Catalog item ${index + 1} is invalid.`);
    const item = entry as Record<string, unknown>;
    const id = String(item.id || '').trim();
    const name = String(item.name || '').trim();
    const kind = item.kind === 'interaction' ? 'interaction' : item.kind === 'sound-alert' ? 'sound-alert' : '';
    const durationMs = Number(item.durationMs);
    const cooldownMs = item.cooldownMs === undefined ? undefined : Number(item.cooldownMs);
    const viewerCooldownMs = item.viewerCooldownMs === undefined ? undefined : Number(item.viewerCooldownMs);
    const globalCooldownMs = item.globalCooldownMs === undefined ? undefined : Number(item.globalCooldownMs);
    const accent = String(item.accent || '').toUpperCase();
    const glyph = String(item.glyph || '').toUpperCase();
    const category = ['sticker', 'gif', 'jumpscare', 'screen-effect', 'sound', 'counter', 'community', 'other'].includes(String(item.category)) ? item.category as PublicExtensionCatalogItem['category'] : 'other';
    const placementMode = item.placementMode === 'viewer' ? 'viewer' : 'fixed';
    const accessSource = item.access && typeof item.access === 'object' && !Array.isArray(item.access) ? item.access as Record<string, unknown> : {};
    const accessMode = ['everyone', 'staff', 'assigned-creators', 'specific-viewers'].includes(String(accessSource.mode)) ? accessSource.mode as NonNullable<PublicExtensionCatalogItem['access']>['mode'] : 'everyone';
    const normalizeIds = (raw: unknown): string[] => [...new Set((Array.isArray(raw) ? raw : []).map((entry) => String(entry || '').trim()).filter((entry) => /^\d{1,30}$/.test(entry)))].slice(0, 100);
    const access = { mode: accessMode, allowedViewerIds: normalizeIds(accessSource.allowedViewerIds), blockedViewerIds: normalizeIds(accessSource.blockedViewerIds), hideWhenLocked: accessSource.hideWhenLocked === true };
    if (!actionPattern.test(id) || seen.has(id)) throw new Error(`Catalog item ${index + 1} has an invalid or duplicate ID.`);
    if (!name || name.length > 80 || /[\r\n\0]/.test(name)) throw new Error(`Catalog item ${index + 1} has an invalid name.`);
    if (!kind || !Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 300_000) throw new Error(`Catalog item ${index + 1} has invalid timing or kind.`);
    if (cooldownMs !== undefined && (!Number.isInteger(cooldownMs) || cooldownMs < 0 || cooldownMs > 86_400_000)) throw new Error(`Catalog item ${index + 1} has an invalid cooldown.`);
    if (viewerCooldownMs !== undefined && (!Number.isInteger(viewerCooldownMs) || viewerCooldownMs < 0 || viewerCooldownMs > 86_400_000)) throw new Error(`Catalog item ${index + 1} has an invalid viewer cooldown.`);
    if (globalCooldownMs !== undefined && (!Number.isInteger(globalCooldownMs) || globalCooldownMs < 0 || globalCooldownMs > 86_400_000)) throw new Error(`Catalog item ${index + 1} has an invalid global cooldown.`);
    if (!/^#[0-9A-F]{6}$/.test(accent) || !glyphPattern.test(glyph)) throw new Error(`Catalog item ${index + 1} has invalid display data.`);
    seen.add(id);
    return { id, name, kind, durationMs, ...(cooldownMs === undefined ? {} : { cooldownMs }), ...(viewerCooldownMs === undefined ? {} : { viewerCooldownMs }), ...(globalCooldownMs === undefined ? {} : { globalCooldownMs }), category, placementMode, access, accent, glyph };
  });
  let poll: PublicExtensionPoll | undefined;
  if (source.poll !== undefined) {
    if (extensionEdition !== 'free') throw new Error('Polls are published only to the free Extension edition.');
    if (!source.poll || typeof source.poll !== 'object' || Array.isArray(source.poll)) throw new Error('Catalog poll is invalid.');
    const candidate = source.poll as Record<string, unknown>;
    const id = String(candidate.id || '').trim();
    const state = candidate.state === 'active' ? 'active' : candidate.state === 'closed' ? 'closed' : '';
    const question = String(candidate.question || '').trim();
    const startedAt = String(candidate.startedAt || '');
    const endedAt = candidate.endedAt === undefined ? undefined : String(candidate.endedAt);
    const lastVoteAt = candidate.lastVoteAt === undefined ? undefined : String(candidate.lastVoteAt);
    if (!/^[A-Za-z0-9-]{16,80}$/.test(id) || !state || !question || question.length > 160 || /[\r\n\0]/.test(question)) throw new Error('Catalog poll identity is invalid.');
    if (!Number.isFinite(Date.parse(startedAt)) || (endedAt && !Number.isFinite(Date.parse(endedAt))) || (lastVoteAt && !Number.isFinite(Date.parse(lastVoteAt)))) throw new Error('Catalog poll timestamps are invalid.');
    if (!Array.isArray(candidate.options) || candidate.options.length < 2 || candidate.options.length > 10) throw new Error('Catalog poll must contain 2 to 10 options.');
    const options = candidate.options.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Catalog poll option ${index + 1} is invalid.`);
      const option = entry as Record<string, unknown>;
      const number = Number(option.number);
      const label = String(option.label || '').trim();
      const votes = Number(option.votes);
      if (number !== index + 1 || !label || label.length > 80 || /[\r\n\0]/.test(label) || !Number.isSafeInteger(votes) || votes < 0 || votes > 1_000_000_000) throw new Error(`Catalog poll option ${index + 1} is invalid.`);
      return { number, label, votes, percentage: 0 };
    });
    if (new Set(options.map((option) => option.label.toLocaleLowerCase())).size !== options.length) throw new Error('Catalog poll option names must be unique.');
    const totalVotes = options.reduce((total, option) => total + option.votes, 0);
    poll = {
      id, state, question,
      options: options.map((option) => ({ ...option, percentage: totalVotes ? Math.round((option.votes / totalVotes) * 1000) / 10 : 0 })),
      totalVotes, startedAt,
      ...(endedAt ? { endedAt } : {}),
      ...(lastVoteAt ? { lastVoteAt } : {})
    };
  }
  let counters: PublicExtensionCounter[] | undefined;
  if (source.counters !== undefined) {
    if (extensionEdition !== 'free') throw new Error('Counters are published only to the free Extension edition.');
    if (!Array.isArray(source.counters) || source.counters.length > 12) throw new Error('Catalog counters must be a list of at most 12 entries.');
    const counterIds = new Set<string>();
    counters = source.counters.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Catalog counter ${index + 1} is invalid.`);
      const counter = entry as Record<string, unknown>;
      const id = String(counter.id || '').trim();
      const command = String(counter.command || '').trim().toLowerCase();
      const label = String(counter.label || '').trim();
      const counterValue = Number(counter.value);
      if (!/^[A-Za-z0-9._-]{1,80}$/.test(id) || counterIds.has(id)) throw new Error(`Catalog counter ${index + 1} has an invalid or duplicate ID.`);
      if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(command) || !label || label.length > 80 || /[\r\n\0]/.test(label)) throw new Error(`Catalog counter ${index + 1} has invalid display data.`);
      if (!Number.isSafeInteger(counterValue) || Math.abs(counterValue) > 1_000_000_000) throw new Error(`Catalog counter ${index + 1} has an invalid value.`);
      counterIds.add(id);
      return { id, command, label, value: counterValue };
    });
  }
  let goal: PublicExtensionGoal | undefined;
  if (source.goal !== undefined) {
    if (extensionEdition !== 'free') throw new Error('Goals are published only to the free Extension edition.');
    if (!source.goal || typeof source.goal !== 'object' || Array.isArray(source.goal)) throw new Error('Catalog goal is invalid.');
    const candidate = source.goal as Record<string, unknown>;
    const goalSource = candidate.source === 'twitch' ? 'twitch' : candidate.source === 'studio' ? 'studio' : '';
    const kind = ['subscriptions', 'followers', 'bits', 'donations', 'custom'].includes(String(candidate.kind)) ? candidate.kind as PublicExtensionGoal['kind'] : '';
    const title = String(candidate.title || '').trim();
    const currentAmount = Number(candidate.currentAmount);
    const targetAmount = Number(candidate.targetAmount);
    const unit = String(candidate.unit || '').trim();
    const accent = String(candidate.accent || '').toUpperCase();
    if (!goalSource || !kind || !title || title.length > 100 || /[\r\n\0]/.test(title)) throw new Error('Catalog goal identity is invalid.');
    if (!Number.isFinite(currentAmount) || currentAmount < 0 || currentAmount > 1_000_000_000 || !Number.isFinite(targetAmount) || targetAmount <= 0 || targetAmount > 1_000_000_000) throw new Error('Catalog goal progress is invalid.');
    if (unit.length > 24 || /[\r\n\0]/.test(unit) || !/^#[0-9A-F]{6}$/.test(accent)) throw new Error('Catalog goal display data is invalid.');
    goal = { source: goalSource, kind, title, currentAmount, targetAmount, percentage: Math.round(Math.min(100, currentAmount / targetAmount * 100) * 10) / 10, unit, accent };
  }
  let nowPlaying: PublicExtensionNowPlaying | undefined;
  if (source.nowPlaying !== undefined) {
    if (extensionEdition !== 'free') throw new Error('Now Playing is published only to the free Extension edition.');
    if (!source.nowPlaying || typeof source.nowPlaying !== 'object' || Array.isArray(source.nowPlaying)) throw new Error('Catalog Now Playing state is invalid.');
    const candidate = source.nowPlaying as Record<string, unknown>;
    const stationName = String(candidate.stationName || '').trim();
    const state = ['online', 'offline', 'unavailable'].includes(String(candidate.state)) ? candidate.state as PublicExtensionNowPlaying['state'] : '';
    const cleanOptional = (key: 'artist' | 'title' | 'text' | 'album', maximum: number): string | undefined => {
      if (candidate[key] === undefined || candidate[key] === null || candidate[key] === '') return undefined;
      const result = String(candidate[key]).trim();
      if (!result || result.length > maximum || /[\r\n\0]/.test(result)) throw new Error(`Catalog Now Playing ${key} is invalid.`);
      return result;
    };
    const publicPlayerUrl = String(candidate.publicPlayerUrl || '').trim();
    const checkedAt = String(candidate.checkedAt || '');
    let parsedPlayerUrl: URL;
    try { parsedPlayerUrl = new URL(publicPlayerUrl); } catch { throw new Error('Catalog Now Playing listen URL is invalid.'); }
    if (!stationName || stationName.length > 80 || /[\r\n\0]/.test(stationName) || !state) throw new Error('Catalog Now Playing identity is invalid.');
    if (parsedPlayerUrl.protocol !== 'https:' || parsedPlayerUrl.username || parsedPlayerUrl.password || publicPlayerUrl.length > 2048 || !Number.isFinite(Date.parse(checkedAt))) throw new Error('Catalog Now Playing source is invalid.');
    nowPlaying = { stationName, state, artist: cleanOptional('artist', 120), title: cleanOptional('title', 160), text: cleanOptional('text', 240), album: cleanOptional('album', 160), publicPlayerUrl: parsedPlayerUrl.href, checkedAt };
  }
  let schedule: PublicExtensionSchedule | undefined;
  if (source.schedule !== undefined) {
    if (extensionEdition !== 'free') throw new Error('Schedule is published only to the free Extension edition.');
    if (!source.schedule || typeof source.schedule !== 'object' || Array.isArray(source.schedule)) throw new Error('Catalog schedule is invalid.');
    const candidate = source.schedule as Record<string, unknown>;
    const title = candidate.title === undefined || candidate.title === null || candidate.title === '' ? undefined : String(candidate.title).trim();
    const startTime = String(candidate.startTime || '');
    if ((title !== undefined && (!title || title.length > 160 || /[\r\n\0]/.test(title))) || !Number.isFinite(Date.parse(startTime))) throw new Error('Catalog schedule is invalid.');
    schedule = { ...(title ? { title } : {}), startTime: new Date(startTime).toISOString() };
  }
  return { schemaVersion: 1, extensionEdition, updatedAt: new Date().toISOString(), items, ...(poll ? { poll } : {}), ...(counters?.length ? { counters } : {}), ...(goal ? { goal } : {}), ...(nowPlaying ? { nowPlaying } : {}), ...(schedule ? { schedule } : {}) };
}

const defaultPublicPanelDesign: PublicExtensionPanelDesign = {
  schemaVersion: 1,
  preset: 'tempest',
  brandName: 'TEMPEST STREAMING STUDIO',
  eyebrow: 'VIEWER CONTROL NODE',
  title: 'Signal deck',
  accent: '#54F2EB',
  background: '#05090E',
  surface: '#09131B',
  text: '#ECF9FF',
  muted: '#79919D',
  font: 'inter',
  cardLayout: 'grid',
  density: 'comfortable',
  cornerRadius: 10,
  showLogo: true,
  showStatus: true,
  showSearch: true,
  showFilters: true,
  showPattern: true,
  uppercaseLabels: true
};

function validatePublicPanelDesign(value: unknown): PublicExtensionPanelDesign {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const choice = <T extends string>(candidate: unknown, choices: readonly T[], fallback: T): T => choices.includes(candidate as T) ? candidate as T : fallback;
  const text = (candidate: unknown, fallback: string, maximum: number): string => String(candidate ?? '').trim().replace(/[\r\n\0]+/g, ' ').slice(0, maximum) || fallback;
  const color = (candidate: unknown, fallback: string): string => {
    const normalized = String(candidate || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
  };
  const requestedRadius = Number(source.cornerRadius);
  return {
    schemaVersion: 1,
    preset: choice(source.preset, ['tempest', 'minimal', 'neon', 'soft'] as const, defaultPublicPanelDesign.preset),
    brandName: text(source.brandName, defaultPublicPanelDesign.brandName, 36),
    eyebrow: text(source.eyebrow, defaultPublicPanelDesign.eyebrow, 48),
    title: text(source.title, defaultPublicPanelDesign.title, 48),
    accent: color(source.accent, defaultPublicPanelDesign.accent),
    background: color(source.background, defaultPublicPanelDesign.background),
    surface: color(source.surface, defaultPublicPanelDesign.surface),
    text: color(source.text, defaultPublicPanelDesign.text),
    muted: color(source.muted, defaultPublicPanelDesign.muted),
    font: choice(source.font, ['inter', 'system', 'condensed', 'serif'] as const, defaultPublicPanelDesign.font),
    cardLayout: choice(source.cardLayout, ['grid', 'list'] as const, defaultPublicPanelDesign.cardLayout),
    density: choice(source.density, ['comfortable', 'compact'] as const, defaultPublicPanelDesign.density),
    cornerRadius: Number.isFinite(requestedRadius) ? Math.min(24, Math.max(0, Math.round(requestedRadius))) : defaultPublicPanelDesign.cornerRadius,
    showLogo: source.showLogo !== false,
    showStatus: source.showStatus !== false,
    showSearch: source.showSearch !== false,
    showFilters: source.showFilters !== false,
    showPattern: source.showPattern !== false,
    uppercaseLabels: source.uppercaseLabels !== false
  };
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumBodyBytes) throw new HttpError(413, 'Request body exceeds the 16 KB limit.');
    chunks.push(bytes);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
}

async function readRawJson(request: IncomingMessage): Promise<{ raw: Buffer; value: Record<string, unknown> }> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximumBodyBytes) throw new HttpError(413, 'Request body exceeds the 16 KB limit.');
    chunks.push(bytes);
  }
  const raw = Buffer.concat(chunks);
  const value = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Request body must be a JSON object.');
  return { raw, value };
}

function validOrigin(origin: string, configured: Set<string>): boolean {
  if (configured.has(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && /^[a-z0-9]+\.ext-twitch\.tv$/i.test(url.hostname) && !url.port;
  } catch {
    return false;
  }
}

function sendJson(response: ServerResponse, status: number, body: unknown, origin?: string): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Vary', 'Origin');
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Expose-Headers', 'ETag');
  }
  response.end(JSON.stringify(body));
}

function sendNotModified(response: ServerResponse, origin?: string): void {
  response.statusCode = 304;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Vary', 'Origin');
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Expose-Headers', 'ETag');
  }
  response.end();
}

function normalizedEvent(claims: TwitchExtensionClaims, requestId: string, action: string, extra: Record<string, unknown> = {}, viewerId?: string): TempestNormalizedTwitchEvent {
  return {
    schemaVersion: 1,
    id: `${claims.channel_id}:${requestId}`,
    topic: 'viewer.interaction.requested',
    occurredAt: new Date().toISOString(),
    source: 'twitch',
    channel: { id: claims.channel_id },
    viewer: {
      id: viewerId || claims.user_id || claims.opaque_user_id,
      roles: [claims.role]
    },
    payload: { action, ...extra }
  };
}

function withCooldown(result: RelayResult): RelayResult {
  if (!result.body || typeof result.body !== 'object' || Array.isArray(result.body)) return result;
  const body = result.body as Record<string, unknown>;
  const alert = body.alert;
  if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return result;
  const source = alert as Record<string, unknown>;
  const cooldownMs = Math.max(Number(source.viewerCooldownMs) || 0, Number(source.globalCooldownMs) || 0, Number(source.durationMs) || 0);
  return { ...result, body: { ...body, cooldownMs } };
}

export async function startTwitchEbs(options: StartTwitchEbsOptions): Promise<TwitchEbsRuntime> {
  const host = options.host || '0.0.0.0';
  const requestedPort = options.port ?? 8080;
  const logger = options.logger || console;
  const secrets = decodeTwitchSecrets(options.twitchExtensionSecrets);
  const bitsClientId = String(options.bitsExtension?.clientId || '').trim();
  if (options.bitsExtension && !/^[a-z0-9]{8,80}$/i.test(bitsClientId)) throw new Error('The Twitch Bits Extension client ID is invalid.');
  const bitsSecrets = options.bitsExtension ? decodeTwitchSecrets(options.bitsExtension.secrets) : [];
  const bitsProducts = new Map<string, { action: string; bits: number }>();
  for (const [sku, product] of Object.entries(options.bitsExtension?.products || {})) {
    if (!/^[A-Za-z0-9._-]{1,255}$/.test(sku) || !actionPattern.test(product.action) || !Number.isInteger(product.bits) || product.bits < 1 || product.bits > 10_000) {
      throw new Error(`The Twitch Bits product mapping for ${sku || '(empty SKU)'} is invalid.`);
    }
    bitsProducts.set(sku, product);
  }
  const installationStore = options.installationStore || new MemoryTwitchEbsInstallationStore();
  await installationStore.initialize();
  const legacyRelayToken = String(options.relayToken || '').trim();
  const allowedChannelIds = new Set((options.allowedChannelIds || []).map((value) => value.trim()).filter((value) => /^\d{1,30}$/.test(value)));
  if ((legacyRelayToken && legacyRelayToken.length < 32) || (!legacyRelayToken && allowedChannelIds.size)) throw new Error('Legacy relay token and channel IDs must be configured together, and the token must contain at least 32 characters.');
  for (const channelId of allowedChannelIds) await installationStore.install(channelId, `channel-${channelId}`, relayTokenHash(legacyRelayToken));
  const allowedActions = new Set((options.allowedActions || []).map((value) => value.trim()).filter((value) => actionPattern.test(value)));
  const allowedTwitchClientIds = new Set((options.allowedTwitchClientIds || []).map((value) => value.trim()).filter((value) => /^[a-z0-9]{8,80}$/i.test(value)));
  const oauthValidator = options.validateTwitchOAuthToken || validateTwitchOAuthToken;
  const kickOauthValidator = options.validateKickOAuthToken || validateKickOAuthToken;
  const kickWebhookVerifier = options.verifyKickWebhook || verifyKickWebhook;
  const allowedOrigins = new Set((options.allowedOrigins || []).map((value) => value.trim().replace(/\/$/, '')).filter(Boolean));
  const viewerLimit = Math.max(1, options.viewerRequestsPerMinute || 20);
  const channelLimit = Math.max(viewerLimit, options.channelRequestsPerMinute || 240);
  const relayTimeoutMs = Math.max(1_000, Math.min(30_000, options.relayTimeoutMs || 10_000));
  const limiter = new SlidingWindowLimiter();
  const studioSockets = new Map<string, WebSocket>();
  const pending = new Map<string, PendingRelay>();
  const results = new Map<string, CachedResult>();
  const bitsReservations = new Map<string, BitsReservation>();
  const lastBitsGlobalUse = new Map<string, number>();
  const lastBitsViewerUse = new Map<string, number>();
  const maximumBitsStateEntries = 50_000;
  let lastBitsCooldownPrunedAt = 0;
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const socketInstallations = new WeakMap<WebSocket, TwitchEbsInstallation>();

  const expireResults = (now = Date.now()): void => {
    for (const [key, value] of results) if (now - value.storedAt > 10 * 60_000) results.delete(key);
    while (results.size > 5_000) results.delete(results.keys().next().value as string);
  };

  const rejectChannelPending = (channelId: string, message: string): void => {
    for (const [key, item] of pending) {
      if (item.channelId !== channelId) continue;
      clearTimeout(item.timer);
      pending.delete(key);
      item.reject(new HttpError(503, message));
    }
  };

  const forward = async (channelId: string, requestId: string, event: unknown, type: 'interaction' | 'kick.event' = 'interaction'): Promise<RelayResult> => {
    const socket = studioSockets.get(channelId);
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new HttpError(503, 'Tempest Streaming Studio is offline.');
    const key = `${channelId}:${requestId}`;
    return new Promise<RelayResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new HttpError(504, 'Tempest Streaming Studio did not acknowledge the interaction in time.'));
      }, relayTimeoutMs);
      pending.set(key, { channelId, timer, resolve, reject });
      socket.send(JSON.stringify({ protocolVersion: 1, type, requestId, event }), (error) => {
        if (!error) return;
        clearTimeout(timer);
        pending.delete(key);
        reject(new HttpError(503, 'The Studio relay connection could not accept the interaction.'));
      });
    });
  };

  const requireExtensionEdition = (installation: TwitchEbsInstallation, expected: 'free' | 'bits'): void => {
    const activeEdition = installation.catalog.extensionEdition === 'bits' ? 'bits' : 'free';
    if (activeEdition !== expected) {
      throw new HttpError(409, `${expected === 'bits' ? 'Tempest Streaming (Bits)' : 'Tempest Mainframe (Free)'} is not the active Extension for this channel.`, {
        code: 'EXTENSION_EDITION_INACTIVE',
        activeEdition
      });
    }
  };

  const expireBitsReservations = (now = Date.now()): void => {
    for (const [token, reservation] of bitsReservations) if (reservation.expiresAt <= now) bitsReservations.delete(token);
  };

  const expireBitsCooldowns = (now = Date.now()): void => {
    if (now - lastBitsCooldownPrunedAt < 60_000 && lastBitsGlobalUse.size <= maximumBitsStateEntries && lastBitsViewerUse.size <= maximumBitsStateEntries) return;
    const cutoff = now - 86_400_000;
    for (const [key, usedAt] of lastBitsGlobalUse) if (usedAt <= cutoff) lastBitsGlobalUse.delete(key);
    for (const [key, usedAt] of lastBitsViewerUse) if (usedAt <= cutoff) lastBitsViewerUse.delete(key);
    while (lastBitsGlobalUse.size > maximumBitsStateEntries) lastBitsGlobalUse.delete(lastBitsGlobalUse.keys().next().value as string);
    while (lastBitsViewerUse.size > maximumBitsStateEntries) lastBitsViewerUse.delete(lastBitsViewerUse.keys().next().value as string);
    lastBitsCooldownPrunedAt = now;
  };

  const accessEligibility = (item: PublicExtensionCatalogItem, claims: TwitchExtensionClaims): { allowed: boolean; reason?: string; code?: string } => {
    const viewerId = String(claims.user_id || '');
    const access = item.access;
    if (viewerId && access?.blockedViewerIds.includes(viewerId)) return { allowed: false, reason: 'Unavailable for this viewer', code: 'interaction_locked' };
    const staff = claims.role === 'broadcaster' || claims.role === 'moderator';
    if (staff) return { allowed: true };
    if (access?.mode === 'staff') return { allowed: false, reason: 'Broadcaster and moderators only', code: 'interaction_locked' };
    if (access?.mode === 'assigned-creators' || access?.mode === 'specific-viewers') {
      if (!viewerId) return { allowed: false, reason: 'Share your Twitch identity to use this interaction', code: 'identity_required' };
      if (!access.allowedViewerIds.includes(viewerId)) return { allowed: false, reason: access.mode === 'assigned-creators' ? 'Assigned creator group only' : 'Locked to selected viewers', code: 'interaction_locked' };
    }
    return { allowed: true };
  };

  const bitsEligibility = (item: PublicExtensionCatalogItem, claims: TwitchExtensionClaims, now = Date.now()): { allowed: boolean; reason?: string; retryAfterMs: number } => {
    const accessDecision = accessEligibility(item, claims);
    if (!accessDecision.allowed) return { ...accessDecision, retryAfterMs: 0 };
    const viewerId = String(claims.user_id || '');
    expireBitsCooldowns(now);
    const globalKey = `${claims.channel_id}:${item.id}`;
    const viewerKey = `${globalKey}:${viewerId}`;
    const globalRemaining = Math.max(0, (lastBitsGlobalUse.get(globalKey) || 0) + (item.globalCooldownMs ?? item.cooldownMs ?? 0) - now);
    const viewerRemaining = Math.max(0, (lastBitsViewerUse.get(viewerKey) || 0) + (item.viewerCooldownMs ?? item.cooldownMs ?? 0) - now);
    const reservationRemaining = [...bitsReservations.values()].filter((entry) => entry.channelId === claims.channel_id && entry.action === item.id).reduce((maximum, entry) => Math.max(maximum, entry.expiresAt - now), 0);
    const retryAfterMs = Math.max(globalRemaining, viewerRemaining, reservationRemaining);
    return retryAfterMs > 0 ? { allowed: false, reason: `Available again in ${Math.ceil(retryAfterMs / 1000)} seconds`, retryAfterMs } : { allowed: true, retryAfterMs: 0 };
  };

  const authenticateViewer = async (request: IncomingMessage): Promise<{ claims: TwitchExtensionClaims; installation: TwitchEbsInstallation }> => {
    let claims: TwitchExtensionClaims;
    try {
      claims = verifyTwitchExtensionJwt(extensionToken(request), secrets);
    } catch (error) {
      throw new HttpError(401, (error as Error).message);
    }
    const installation = await installationStore.findActiveByChannelId(claims.channel_id);
    if (!installation) throw new HttpError(403, 'This Twitch channel has not paired Tempest Streaming Studio.');
    requireExtensionEdition(installation, 'free');
    if (!options.allowAnonymous && claims.opaque_user_id.startsWith('A')) throw new HttpError(403, 'Anonymous Twitch viewers cannot trigger interactions.');
    return { claims, installation };
  };

  const authenticateBitsViewer = async (request: IncomingMessage): Promise<{ claims: TwitchExtensionClaims; installation: TwitchEbsInstallation }> => {
    if (!options.bitsExtension) throw new HttpError(503, 'Twitch Bits interactions are not configured.');
    let claims: TwitchExtensionClaims;
    try {
      claims = verifyTwitchExtensionJwt(extensionToken(request), bitsSecrets);
    } catch (error) {
      throw new HttpError(401, (error as Error).message);
    }
    const installation = await installationStore.findActiveByChannelId(claims.channel_id);
    if (!installation) throw new HttpError(403, 'This Twitch channel has not paired Tempest Streaming Studio.');
    requireExtensionEdition(installation, 'bits');
    if (!claims.user_id || claims.opaque_user_id.startsWith('A')) throw new HttpError(403, 'A linked Twitch identity is required to use Bits interactions.', { code: 'identity_required' });
    return { claims, installation };
  };

  const dispatchInteraction = async (claims: TwitchExtensionClaims, requestId: string, eventFactory: (requestId: string) => TempestNormalizedTwitchEvent, viewerId = claims.user_id || claims.opaque_user_id): Promise<RelayResult> => {
    if (!requestIdPattern.test(requestId)) throw new HttpError(400, 'requestId must contain 16 to 128 URL-safe characters.');
    const resultKey = `${claims.channel_id}:${requestId}`;
    expireResults();
    const cached = results.get(resultKey);
    if (cached) return { status: cached.status, body: cached.body };
    if (pending.has(resultKey)) throw new HttpError(409, 'This interaction request is already being processed.');
    const viewerRetry = limiter.consume(`viewer:${claims.channel_id}:${viewerId}`, viewerLimit);
    const channelRetry = limiter.consume(`channel:${claims.channel_id}`, channelLimit);
    const retryAfterMs = Math.max(viewerRetry, channelRetry);
    if (retryAfterMs) throw new HttpError(429, 'Too many extension interactions. Please wait and try again.', { retryAfterMs });
    const result = withCooldown(await forward(claims.channel_id, requestId, eventFactory(requestId)));
    results.set(resultKey, { ...result, storedAt: Date.now() });
    return result;
  };

  const processInteraction = async (request: IncomingMessage, claims: TwitchExtensionClaims, eventFactory: (requestId: string, body: Record<string, unknown>) => TempestNormalizedTwitchEvent): Promise<RelayResult> => {
    const body = await readJson(request);
    const requestId = String(body.requestId || request.headers['x-request-id'] || '').trim();
    return dispatchInteraction(claims, requestId, (id) => eventFactory(id, body));
  };

  const requestHandler = async (request: IncomingMessage, response: ServerResponse) => {
    const requestUrl = new URL(request.url || '/', `${options.tls ? 'https' : 'http'}://${request.headers.host || 'localhost'}`);
    const originHeader = String(request.headers.origin || '').replace(/\/$/, '');
    const origin = originHeader && validOrigin(originHeader, allowedOrigins) ? originHeader : undefined;
    try {
      if (originHeader && !origin) throw new HttpError(403, 'Request origin is not permitted.');
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.setHeader('Access-Control-Allow-Origin', origin || 'null');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, X-Extension-JWT, X-Request-ID, X-Kick-OAuth, Authorization');
        response.setHeader('Access-Control-Expose-Headers', 'ETag');
        response.setHeader('Access-Control-Max-Age', '600');
        response.setHeader('Vary', 'Origin');
        return response.end();
      }
      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        return sendJson(response, 200, { service: 'tempest-twitch-ebs', status: 'online', installations: await installationStore.countActive(), studioConnections: studioSockets.size, discordOAuth: options.discordOAuth ? 'configured' : 'disabled' }, origin);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/discord/oauth/exchange') {
        if (!options.discordOAuth) throw new HttpError(503, 'Discord authorization is not configured on this service.');
        const remoteAddress = request.socket.remoteAddress || 'unknown';
        const retryAfterMs = limiter.consume(`discord-oauth:${remoteAddress}`, 10);
        if (retryAfterMs) throw new HttpError(429, 'Too many Discord authorization attempts. Please wait and try again.', { retryAfterMs });
        const body = await readJson(request);
        const clientId = String(body.clientId || '').trim();
        const grantType = body.grantType === 'refresh_token' ? 'refresh_token' : body.grantType === 'authorization_code' ? 'authorization_code' : '';
        if (!grantType || clientId !== options.discordOAuth.clientId) throw new HttpError(400, 'Discord authorization request is invalid.');
        const credentialName = grantType === 'authorization_code' ? 'code' : 'refreshToken';
        const credential = String(body[credentialName] || '').trim();
        if (!credential || credential.length > 2048 || /[\r\n\0]/.test(credential)) throw new HttpError(400, `Discord ${grantType === 'authorization_code' ? 'authorization code' : 'refresh token'} is invalid.`);
        const form = new URLSearchParams({ client_id: options.discordOAuth.clientId, client_secret: options.discordOAuth.clientSecret, grant_type: grantType, [grantType === 'authorization_code' ? 'code' : 'refresh_token']: credential });
        if (grantType === 'authorization_code' && options.discordOAuth.redirectUri) form.set('redirect_uri', options.discordOAuth.redirectUri);
        const discordResponse = await (options.discordOAuth.exchange || ((payload) => fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload })))(form);
        const tokens = await discordResponse.json().catch(() => ({})) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; token_type?: unknown; error_description?: unknown; message?: unknown };
        if (!discordResponse.ok || typeof tokens.access_token !== 'string') throw new HttpError(502, typeof tokens.error_description === 'string' ? tokens.error_description : typeof tokens.message === 'string' ? tokens.message : 'Discord authorization exchange failed.');
        return sendJson(response, 200, { accessToken: tokens.access_token, ...(typeof tokens.refresh_token === 'string' ? { refreshToken: tokens.refresh_token } : {}), ...(Number.isFinite(Number(tokens.expires_in)) ? { expiresIn: Number(tokens.expires_in) } : {}), ...(typeof tokens.scope === 'string' ? { scope: tokens.scope } : {}), ...(typeof tokens.token_type === 'string' ? { tokenType: tokens.token_type } : {}) }, origin);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/installations/pair') {
        const remoteAddress = request.socket.remoteAddress || 'unknown';
        const retryAfterMs = limiter.consume(`pair:${remoteAddress}`, 10);
        if (retryAfterMs) throw new HttpError(429, 'Too many pairing attempts. Please wait and try again.', { retryAfterMs });
        const identity = await oauthValidator(twitchOAuthToken(request));
        if (allowedTwitchClientIds.size && !allowedTwitchClientIds.has(identity.clientId)) {
          throw new HttpError(403, 'This Twitch sign-in was created by an application this Extension service does not accept. Reconnect through the Twitch application required by this service.', { code: 'TWITCH_CLIENT_NOT_ALLOWED' });
        }
        const relayToken = randomBytes(32).toString('base64url');
        const installation = await installationStore.install(identity.userId, identity.login, relayTokenHash(relayToken));
        studioSockets.get(installation.channelId)?.close(4001, 'Installation paired again');
        return sendJson(response, 201, {
          schemaVersion: 1,
          installationId: installation.id,
          channel: { id: installation.channelId, login: installation.channelLogin },
          relayToken,
          relayPath: '/v1/studio',
          pairedAt: installation.updatedAt
        }, origin);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/installations/current') {
        const installation = await installationStore.findActiveByRelayTokenHash(relayTokenHash(bearerToken(request)));
        if (!installation) throw new HttpError(401, 'Installation relay credential is invalid or revoked.');
        return sendJson(response, 200, { schemaVersion: 1, installationId: installation.id, extensionEdition: installation.catalog.extensionEdition === 'bits' ? 'bits' : 'free', channel: { id: installation.channelId, login: installation.channelLogin }, ...(installation.kickUserId ? { kick: { userId: installation.kickUserId, username: installation.kickUsername } } : {}), updatedAt: installation.updatedAt }, origin);
      }
      if (request.method === 'PUT' && requestUrl.pathname === '/v1/installations/current/panel-design') {
        const installation = await installationStore.findActiveByRelayTokenHash(relayTokenHash(bearerToken(request)));
        if (!installation) throw new HttpError(401, 'Installation relay credential is invalid or revoked.');
        const body = await readJson(request);
        const panelDesign = validatePublicPanelDesign(body.panelDesign);
        await installationStore.updatePanelDesign(installation.id, panelDesign);
        return sendJson(response, 200, { schemaVersion: 1, panelDesign }, origin);
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/installations/current') {
        const installation = await installationStore.findActiveByRelayTokenHash(relayTokenHash(bearerToken(request)));
        if (!installation) throw new HttpError(401, 'Installation relay credential is invalid or revoked.');
        await installationStore.revoke(installation.id);
        studioSockets.get(installation.channelId)?.close(4003, 'Installation revoked');
        return sendJson(response, 200, { revoked: true }, origin);
      }
      if (request.method === 'PUT' && requestUrl.pathname === '/v1/installations/current/kick') {
        const installation = await installationStore.findActiveByRelayTokenHash(relayTokenHash(bearerToken(request)));
        if (!installation) throw new HttpError(401, 'Installation relay credential is invalid or revoked.');
        const identity = await kickOauthValidator(kickOAuthToken(request));
        if (!/^\d{1,30}$/.test(identity.userId) || !identity.username || identity.username.length > 120) throw new HttpError(401, 'Kick OAuth identity is invalid.');
        const linked = await installationStore.linkKick(installation.id, identity.userId, identity.username);
        return sendJson(response, 200, { linked: true, kick: { userId: linked.kickUserId, username: linked.kickUsername } }, origin);
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/installations/current/kick') {
        const installation = await installationStore.findActiveByRelayTokenHash(relayTokenHash(bearerToken(request)));
        if (!installation) throw new HttpError(401, 'Installation relay credential is invalid or revoked.');
        await installationStore.unlinkKick(installation.id);
        return sendJson(response, 200, { unlinked: true }, origin);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/kick/events') {
        const messageId = String(request.headers['kick-event-message-id'] || '').trim();
        const timestamp = String(request.headers['kick-event-message-timestamp'] || '').trim();
        const signature = String(request.headers['kick-event-signature'] || '').trim();
        const eventType = String(request.headers['kick-event-type'] || '').trim();
        const eventVersion = String(request.headers['kick-event-version'] || '').trim();
        const { raw, value } = await readRawJson(request);
        if (eventType !== 'chat.message.sent' || eventVersion !== '1') throw new HttpError(400, 'Kick webhook event type or version is not supported.');
        if (!requestIdPattern.test(messageId) || !kickWebhookVerifier(messageId, timestamp, raw, signature)) throw new HttpError(401, 'Kick webhook signature is invalid or expired.');
        const broadcaster = value.broadcaster as Record<string, unknown> | undefined;
        const installation = await installationStore.findActiveByKickUserId(String(broadcaster?.user_id || ''));
        if (!installation) throw new HttpError(404, 'This Kick broadcaster has not linked Tempest Streaming Studio.');
        const resultKey = `kick:${messageId}`;
        expireResults();
        const cached = results.get(resultKey);
        if (cached) return sendJson(response, cached.status, cached.body, origin);
        const result = await forward(installation.channelId, messageId, { event: value, eventId: messageId, occurredAt: timestamp }, 'kick.event');
        results.set(resultKey, { ...result, storedAt: Date.now() });
        return sendJson(response, result.status, result.body, origin);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/extension/status') {
        const { claims } = await authenticateViewer(request);
        return sendJson(response, 200, { studioConnected: studioSockets.get(claims.channel_id)?.readyState === WebSocket.OPEN }, origin);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/extension/catalog') {
        const { claims, installation } = await authenticateViewer(request);
        const studioConnected = studioSockets.get(claims.channel_id)?.readyState === WebSocket.OPEN;
        const items = installation.catalog.items.flatMap((item) => {
          const eligibility = accessEligibility(item, claims);
          if (!eligibility.allowed && item.access?.hideWhenLocked) return [];
          const { access: _privateAccess, ...publicItem } = item;
          return [{ ...publicItem, eligibility }];
        });
        const viewerAccessKey = `${claims.user_id || claims.opaque_user_id}:${claims.role}`;
        const etag = `"${createHash('sha256').update(`${installation.id}:${installation.catalog.updatedAt}:${studioConnected ? 1 : 0}:${viewerAccessKey}`).digest('base64url')}"`;
        response.setHeader('ETag', etag);
        if (String(request.headers['if-none-match'] || '') === etag) return sendNotModified(response, origin);
        return sendJson(response, 200, { ...installation.catalog, items, studioConnected }, origin);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/extension/bits/catalog') {
        const { claims, installation } = await authenticateBitsViewer(request);
        expireBitsReservations();
        const products = [...bitsProducts.entries()].flatMap(([sku, mapping]) => {
          const interaction = installation.catalog.items.find((item) => item.kind === 'interaction' && item.id === mapping.action);
          if (!interaction) return [];
          const eligibility = bitsEligibility(interaction, claims);
          if (!eligibility.allowed && interaction.access?.hideWhenLocked && eligibility.retryAfterMs === 0) return [];
          const { access: _privateAccess, ...publicInteraction } = interaction;
          return [{ sku, bits: mapping.bits, interaction: publicInteraction, eligibility }];
        });
        const body = { schemaVersion: 1, products, studioConnected: studioSockets.get(claims.channel_id)?.readyState === WebSocket.OPEN };
        const etag = `"${createHash('sha256').update(JSON.stringify(body)).digest('base64url')}"`;
        response.setHeader('ETag', etag);
        if (String(request.headers['if-none-match'] || '') === etag) return sendNotModified(response, origin);
        return sendJson(response, 200, body, origin);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/extension/bits/reservations') {
        const { claims, installation } = await authenticateBitsViewer(request);
        const viewerRetry = limiter.consume(`bits-reservation:viewer:${claims.channel_id}:${claims.user_id}`, viewerLimit);
        const channelRetry = limiter.consume(`bits-reservation:channel:${claims.channel_id}`, channelLimit);
        const retryAfterMs = Math.max(viewerRetry, channelRetry);
        if (retryAfterMs) throw new HttpError(429, 'Too many Bits reservation requests. Please wait and try again.', { retryAfterMs });
        if (studioSockets.get(claims.channel_id)?.readyState !== WebSocket.OPEN) throw new HttpError(503, 'Tempest Streaming Studio must be online before a Bits interaction can start.');
        const body = await readJson(request);
        const sku = String(body.sku || '').trim();
        const mapping = bitsProducts.get(sku);
        const interaction = mapping && installation.catalog.items.find((item) => item.kind === 'interaction' && item.id === mapping.action);
        if (!mapping || !interaction) throw new HttpError(404, 'This Bits interaction is not currently published by Studio.');
        const eligibility = bitsEligibility(interaction, claims);
        if (!eligibility.allowed) throw new HttpError(eligibility.retryAfterMs ? 409 : 403, eligibility.reason || 'This interaction is unavailable.', { code: eligibility.retryAfterMs ? 'interaction_cooldown' : 'interaction_locked', retryAfterMs: eligibility.retryAfterMs });
        const placementSource = body.placement && typeof body.placement === 'object' && !Array.isArray(body.placement) ? body.placement as Record<string, unknown> : undefined;
        const placement = interaction.placementMode === 'viewer' && placementSource ? { x: Number(placementSource.x), y: Number(placementSource.y) } : undefined;
        if (interaction.placementMode === 'viewer' && (!placement || !Number.isFinite(placement.x) || placement.x < 0 || placement.x > 1 || !Number.isFinite(placement.y) || placement.y < 0 || placement.y > 1)) {
          throw new HttpError(400, 'Choose a valid on-stream placement before activating this interaction.');
        }
        expireBitsReservations();
        if (bitsReservations.size >= maximumBitsStateEntries) throw new HttpError(503, 'The Bits reservation service is temporarily at capacity. Please try again shortly.');
        const token = randomBytes(24).toString('base64url');
        const reservation: BitsReservation = { token, channelId: claims.channel_id, viewerId: claims.user_id!, sku, action: mapping.action, expiresAt: Date.now() + 120_000, ...(placement ? { placement } : {}) };
        bitsReservations.set(token, reservation);
        return sendJson(response, 201, { schemaVersion: 1, reservationToken: token, expiresAt: new Date(reservation.expiresAt).toISOString() }, origin);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/extension/bits/transactions') {
        const { claims, installation } = await authenticateBitsViewer(request);
        const viewerRetry = limiter.consume(`bits-transaction:viewer:${claims.channel_id}:${claims.user_id}`, viewerLimit);
        const channelRetry = limiter.consume(`bits-transaction:channel:${claims.channel_id}`, channelLimit);
        const retryAfterMs = Math.max(viewerRetry, channelRetry);
        if (retryAfterMs) throw new HttpError(429, 'Too many Bits transaction requests. Please wait and try again.', { retryAfterMs });
        const body = await readJson(request);
        const transactionReceipt = String(body.transactionReceipt || '').trim();
        const reservationToken = String(body.reservationToken || '').trim();
        let receipt;
        try {
          receipt = verifyTwitchBitsTransactionReceipt(transactionReceipt, bitsSecrets, bitsClientId);
        } catch (error) {
          throw new HttpError(401, (error as Error).message);
        }
        if (receipt.data.userId !== claims.user_id) throw new HttpError(403, 'Twitch Bits transaction user does not match the authorized viewer.');
        const mapping = bitsProducts.get(receipt.data.product.sku);
        if (!mapping) throw new HttpError(403, 'This Twitch Bits product is not enabled by Tempest Streaming Studio.');
        if (mapping.bits !== receipt.data.product.cost.amount) throw new HttpError(403, 'Twitch Bits transaction amount does not match the configured product.');
        const interaction = installation.catalog.items.find((item) => item.kind === 'interaction' && item.id === mapping.action);
        if (!interaction) {
          throw new HttpError(403, 'This Twitch Bits product is not mapped to a published Studio interaction.');
        }
        const requestId = `bits-${createHash('sha256').update(receipt.data.transactionId).digest('hex').slice(0, 48)}`;
        const cached = results.get(`${claims.channel_id}:${requestId}`);
        if (cached) return sendJson(response, cached.status, cached.body, origin);
        expireBitsReservations();
        const reservation = bitsReservations.get(reservationToken);
        if (!reservation || reservation.channelId !== claims.channel_id || reservation.viewerId !== receipt.data.userId || reservation.sku !== receipt.data.product.sku || reservation.action !== mapping.action) {
          throw new HttpError(409, 'This Bits transaction does not have a valid pre-purchase interaction reservation.', { code: 'reservation_required' });
        }
        bitsReservations.delete(reservationToken);
        const result = await dispatchInteraction(claims, requestId, (id) => normalizedEvent(claims, id, mapping.action, {
          bits: mapping.bits,
          sku: receipt.data.product.sku,
          transactionId: receipt.data.transactionId,
          paymentSource: 'twitch.bits-extension',
          ...(reservation.placement ? { placement: reservation.placement } : {})
        }, receipt.data.userId), receipt.data.userId);
        if (result.status >= 200 && result.status < 300) {
          const now = Date.now();
          lastBitsGlobalUse.set(`${claims.channel_id}:${interaction.id}`, now);
          lastBitsViewerUse.set(`${claims.channel_id}:${interaction.id}:${receipt.data.userId}`, now);
          expireBitsCooldowns(now);
        }
        return sendJson(response, result.status, result.body, origin);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/extension/poll/vote') {
        const { claims, installation } = await authenticateViewer(request);
        if (!claims.user_id || claims.opaque_user_id.startsWith('A')) throw new HttpError(403, 'Share your Twitch identity to vote in this poll.', { code: 'identity_required' });
        const body = await readJson(request);
        const requestId = String(body.requestId || request.headers['x-request-id'] || '').trim();
        const pollId = String(body.pollId || '').trim();
        const optionNumber = Number(body.optionNumber);
        const poll = installation.catalog.poll;
        if (!poll || poll.state !== 'active') throw new HttpError(409, 'This poll is no longer accepting votes.', { code: 'poll_inactive' });
        if (poll.id !== pollId) throw new HttpError(409, 'The active poll changed before this vote arrived.', { code: 'stale_poll' });
        if (!poll.options.some((option) => option.number === optionNumber)) throw new HttpError(400, 'Choose one of the available poll options.', { code: 'invalid_option' });
        const result = await dispatchInteraction(claims, requestId, (id) => normalizedEvent(claims, id, 'tempest.poll.vote', { pollId, optionNumber }, claims.user_id), claims.user_id);
        return sendJson(response, result.status, result.body, origin);
      }
      const alertMatch = requestUrl.pathname.match(/^\/v1\/extension\/alerts\/([^/]+)\/trigger$/);
      if (request.method === 'POST' && alertMatch) {
        const { claims, installation } = await authenticateViewer(request);
        const alertId = decodeURIComponent(alertMatch[1]);
        if (!soundAlertPattern.test(alertId)) throw new HttpError(404, 'Sound Alert was not recognized.');
        const alert = installation.catalog.items.find((item) => item.kind === 'sound-alert' && item.id === alertId);
        if (!alert && !allowedChannelIds.has(claims.channel_id)) throw new HttpError(404, 'Sound Alert is not published by this Studio installation.');
        const alertEligibility = alert && accessEligibility(alert, claims);
        if (alertEligibility && !alertEligibility.allowed) throw new HttpError(403, alertEligibility.reason || 'This interaction is unavailable.', { code: alertEligibility.code || 'interaction_locked' });
        const result = await processInteraction(request, claims, (requestId) => normalizedEvent(claims, requestId, alertId, { alertId }));
        return sendJson(response, result.status, result.body, origin);
      }
      const interactionMatch = requestUrl.pathname.match(/^\/v1\/extension\/interactions\/([^/]+)\/trigger$/);
      if (request.method === 'POST' && interactionMatch) {
        const { claims, installation } = await authenticateViewer(request);
        const action = decodeURIComponent(interactionMatch[1]);
        const interaction = installation.catalog.items.find((item) => item.kind === 'interaction' && item.id === action);
        if (!interaction && !allowedActions.has(action)) throw new HttpError(403, 'This interaction is not published by this Studio installation.');
        const interactionEligibility = interaction && accessEligibility(interaction, claims);
        if (interactionEligibility && !interactionEligibility.allowed) throw new HttpError(403, interactionEligibility.reason || 'This interaction is unavailable.', { code: interactionEligibility.code || 'interaction_locked' });
        const result = await processInteraction(request, claims, (requestId, body) => {
          if (action !== 'tempest.dice.custom') return normalizedEvent(claims, requestId, action);
          const maximum = Number(body.maximum);
          if (!Number.isInteger(maximum) || maximum < 2 || maximum > 100) throw new HttpError(400, 'Choose a custom dice maximum from 2 through 100.', { code: 'dice_maximum_invalid' });
          return normalizedEvent(claims, requestId, action, { maximum });
        });
        return sendJson(response, result.status, result.body, origin);
      }
      return sendJson(response, 404, { error: 'EBS route was not found.' }, origin);
    } catch (error) {
      const failure = error instanceof HttpError ? error : new HttpError(500, 'The EBS could not process this request.');
      if (!(error instanceof HttpError)) logger.error(error);
      return sendJson(response, failure.status, { error: failure.message, ...failure.details }, origin);
    }
  };
  const server = options.tls
    ? createHttpsServer({ pfx: options.tls.pfx, passphrase: options.tls.passphrase }, requestHandler)
    : createServer(requestHandler);

  server.on('upgrade', (request, socket, head) => {
    void (async () => {
      try {
        const requestUrl = new URL(request.url || '/', `${options.tls ? 'https' : 'http'}://${request.headers.host || 'localhost'}`);
        const channelId = String(request.headers['x-tempest-channel-id'] || '');
        const installation = await installationStore.findActiveByRelayTokenHash(relayTokenHash(bearerToken(request)));
        if (requestUrl.pathname !== '/v1/studio' || !installation || (channelId && channelId !== installation.channelId)) throw new Error('Unauthorized');
        webSockets.handleUpgrade(request, socket, head, (webSocket) => {
          socketInstallations.set(webSocket, installation);
          webSockets.emit('connection', webSocket, request);
        });
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
      }
    })();
  });

  webSockets.on('connection', (socket) => {
    const installation = socketInstallations.get(socket) as TwitchEbsInstallation;
    const channelId = installation.channelId;
    const existing = studioSockets.get(channelId);
    if (existing && existing !== socket) existing.close(4001, 'Replaced by a newer Studio connection');
    studioSockets.set(channelId, socket);
    socket.send(JSON.stringify({ protocolVersion: 1, type: 'welcome', channelId, connectionId: randomUUID() }));
    socket.on('message', (raw) => void (async () => {
      try {
        const message = JSON.parse(raw.toString()) as { protocolVersion?: unknown; type?: unknown; requestId?: unknown; status?: unknown; body?: unknown; catalog?: unknown };
        if (message.type === 'heartbeat') return socket.send(JSON.stringify({ protocolVersion: 1, type: 'heartbeat' }));
        if (message.protocolVersion === 1 && message.type === 'catalog.sync') {
          const catalog = validatePublicCatalog(message.catalog);
          await installationStore.updateCatalog(installation.id, catalog);
          return socket.send(JSON.stringify({ protocolVersion: 1, type: 'catalog.ack', extensionEdition: catalog.extensionEdition, updatedAt: catalog.updatedAt, itemCount: catalog.items.length }));
        }
        if (message.protocolVersion !== 1 || message.type !== 'result' || typeof message.requestId !== 'string') throw new Error('Studio sent an invalid relay message.');
        const key = `${channelId}:${message.requestId}`;
        const item = pending.get(key);
        if (!item) return;
        const status = Number(message.status);
        if (!Number.isInteger(status) || status < 100 || status > 599) throw new Error('Studio relay result status is invalid.');
        clearTimeout(item.timer);
        pending.delete(key);
        item.resolve({ status, body: message.body });
      } catch (error) {
        logger.warn(error);
      }
    })());
    socket.on('close', () => {
      if (studioSockets.get(channelId) === socket) {
        studioSockets.delete(channelId);
        rejectChannelPending(channelId, 'Tempest Streaming Studio disconnected before acknowledging the interaction.');
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => resolve());
  });
  const address = server.address() as AddressInfo;
  const clientHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const httpProtocol = options.tls ? 'https' : 'http';
  const socketProtocol = options.tls ? 'wss' : 'ws';
  const runtime: TwitchEbsRuntime = {
    host,
    port: address.port,
    baseUrl: `${httpProtocol}://${clientHost}:${address.port}`,
    websocketUrl: `${socketProtocol}://${clientHost}:${address.port}/v1/studio`,
    close: async () => {
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(new Error('EBS is shutting down.'));
      }
      pending.clear();
      for (const socket of studioSockets.values()) socket.close(1001, 'EBS shutting down');
      await new Promise<void>((resolve) => webSockets.close(() => resolve()));
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await installationStore.close();
    }
  };
  logger.info(`Tempest Twitch EBS listening on ${runtime.baseUrl}`);
  return runtime;
}
