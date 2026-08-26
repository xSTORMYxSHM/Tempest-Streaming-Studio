import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { AddressInfo } from 'node:net';
import { URL } from 'node:url';
import { TempestNormalizedTwitchEvent } from '@tempest/contracts';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeTwitchSecrets, TwitchExtensionClaims, verifyTwitchExtensionJwt } from './jwt';
import {
  MemoryTwitchEbsInstallationStore,
  PublicExtensionCatalog,
  PublicExtensionCatalogItem,
  TwitchEbsInstallation,
  TwitchEbsInstallationStore
} from './installation-store';

export { decodeTwitchSecrets, verifyTwitchExtensionJwt } from './jwt';
export {
  MemoryTwitchEbsInstallationStore,
  PostgresTwitchEbsInstallationStore
} from './installation-store';
export type {
  PublicExtensionCatalog,
  PublicExtensionCatalogItem,
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
  allowedOrigins?: string[];
  allowAnonymous?: boolean;
  viewerRequestsPerMinute?: number;
  channelRequestsPerMinute?: number;
  relayTimeoutMs?: number;
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

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
  }
}

class SlidingWindowLimiter {
  private readonly entries = new Map<string, number[]>();

  consume(key: string, limit: number, now = Date.now()): number {
    const cutoff = now - 60_000;
    const timestamps = (this.entries.get(key) || []).filter((timestamp) => timestamp > cutoff);
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
  const source = value as { items?: unknown };
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
    const accent = String(item.accent || '').toUpperCase();
    const glyph = String(item.glyph || '').toUpperCase();
    if (!actionPattern.test(id) || seen.has(id)) throw new Error(`Catalog item ${index + 1} has an invalid or duplicate ID.`);
    if (!name || name.length > 80 || /[\r\n\0]/.test(name)) throw new Error(`Catalog item ${index + 1} has an invalid name.`);
    if (!kind || !Number.isInteger(durationMs) || durationMs < 1_000 || durationMs > 300_000) throw new Error(`Catalog item ${index + 1} has invalid timing or kind.`);
    if (cooldownMs !== undefined && (!Number.isInteger(cooldownMs) || cooldownMs < 0 || cooldownMs > 86_400_000)) throw new Error(`Catalog item ${index + 1} has an invalid cooldown.`);
    if (!/^#[0-9A-F]{6}$/.test(accent) || !glyphPattern.test(glyph)) throw new Error(`Catalog item ${index + 1} has invalid display data.`);
    seen.add(id);
    return { id, name, kind, durationMs, ...(cooldownMs === undefined ? {} : { cooldownMs }), accent, glyph };
  });
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), items };
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
  if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
  response.end(JSON.stringify(body));
}

function normalizedEvent(claims: TwitchExtensionClaims, requestId: string, action: string, extra: Record<string, unknown> = {}): TempestNormalizedTwitchEvent {
  return {
    schemaVersion: 1,
    id: `${claims.channel_id}:${requestId}`,
    topic: 'viewer.interaction.requested',
    occurredAt: new Date().toISOString(),
    source: 'twitch',
    channel: { id: claims.channel_id },
    viewer: {
      id: claims.user_id || claims.opaque_user_id,
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
  const installationStore = options.installationStore || new MemoryTwitchEbsInstallationStore();
  await installationStore.initialize();
  const legacyRelayToken = String(options.relayToken || '').trim();
  const allowedChannelIds = new Set((options.allowedChannelIds || []).map((value) => value.trim()).filter((value) => /^\d{1,30}$/.test(value)));
  if ((legacyRelayToken && legacyRelayToken.length < 32) || (!legacyRelayToken && allowedChannelIds.size)) throw new Error('Legacy relay token and channel IDs must be configured together, and the token must contain at least 32 characters.');
  for (const channelId of allowedChannelIds) await installationStore.install(channelId, `channel-${channelId}`, relayTokenHash(legacyRelayToken));
  const allowedActions = new Set((options.allowedActions || []).map((value) => value.trim()).filter((value) => actionPattern.test(value)));
  const allowedTwitchClientIds = new Set((options.allowedTwitchClientIds || []).map((value) => value.trim()).filter((value) => /^[a-z0-9]{8,80}$/i.test(value)));
  const oauthValidator = options.validateTwitchOAuthToken || validateTwitchOAuthToken;
  const allowedOrigins = new Set((options.allowedOrigins || []).map((value) => value.trim().replace(/\/$/, '')).filter(Boolean));
  const viewerLimit = Math.max(1, options.viewerRequestsPerMinute || 20);
  const channelLimit = Math.max(viewerLimit, options.channelRequestsPerMinute || 240);
  const relayTimeoutMs = Math.max(1_000, Math.min(30_000, options.relayTimeoutMs || 10_000));
  const limiter = new SlidingWindowLimiter();
  const studioSockets = new Map<string, WebSocket>();
  const pending = new Map<string, PendingRelay>();
  const results = new Map<string, CachedResult>();
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

  const forward = async (channelId: string, requestId: string, event: TempestNormalizedTwitchEvent): Promise<RelayResult> => {
    const socket = studioSockets.get(channelId);
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new HttpError(503, 'Tempest Streaming Studio is offline.');
    const key = `${channelId}:${requestId}`;
    return new Promise<RelayResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new HttpError(504, 'Tempest Streaming Studio did not acknowledge the interaction in time.'));
      }, relayTimeoutMs);
      pending.set(key, { channelId, timer, resolve, reject });
      socket.send(JSON.stringify({ protocolVersion: 1, type: 'interaction', requestId, event }), (error) => {
        if (!error) return;
        clearTimeout(timer);
        pending.delete(key);
        reject(new HttpError(503, 'The Studio relay connection could not accept the interaction.'));
      });
    });
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
    if (!options.allowAnonymous && claims.opaque_user_id.startsWith('A')) throw new HttpError(403, 'Anonymous Twitch viewers cannot trigger interactions.');
    return { claims, installation };
  };

  const processInteraction = async (request: IncomingMessage, claims: TwitchExtensionClaims, eventFactory: (requestId: string) => TempestNormalizedTwitchEvent): Promise<RelayResult> => {
    const body = await readJson(request);
    const requestId = String(body.requestId || request.headers['x-request-id'] || '').trim();
    if (!requestIdPattern.test(requestId)) throw new HttpError(400, 'requestId must contain 16 to 128 URL-safe characters.');
    const viewerId = claims.user_id || claims.opaque_user_id;
    const resultKey = `${claims.channel_id}:${requestId}`;
    expireResults();
    const cached = results.get(resultKey);
    if (cached) return { status: cached.status, body: cached.body };
    if (pending.has(`${claims.channel_id}:${requestId}`)) throw new HttpError(409, 'This interaction request is already being processed.');
    const viewerRetry = limiter.consume(`viewer:${claims.channel_id}:${viewerId}`, viewerLimit);
    const channelRetry = limiter.consume(`channel:${claims.channel_id}`, channelLimit);
    const retryAfterMs = Math.max(viewerRetry, channelRetry);
    if (retryAfterMs) throw new HttpError(429, 'Too many extension interactions. Please wait and try again.', { retryAfterMs });
    const result = withCooldown(await forward(claims.channel_id, requestId, eventFactory(requestId)));
    results.set(resultKey, { ...result, storedAt: Date.now() });
    return result;
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
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Extension-JWT, X-Request-ID, Authorization');
        response.setHeader('Access-Control-Max-Age', '600');
        response.setHeader('Vary', 'Origin');
        return response.end();
      }
      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        return sendJson(response, 200, { service: 'tempest-twitch-ebs', status: 'online', installations: await installationStore.countActive(), studioConnections: studioSockets.size }, origin);
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/installations/pair') {
        const remoteAddress = request.socket.remoteAddress || 'unknown';
        const retryAfterMs = limiter.consume(`pair:${remoteAddress}`, 10);
        if (retryAfterMs) throw new HttpError(429, 'Too many pairing attempts. Please wait and try again.', { retryAfterMs });
        const identity = await oauthValidator(twitchOAuthToken(request));
        if (allowedTwitchClientIds.size && !allowedTwitchClientIds.has(identity.clientId)) throw new HttpError(403, 'This Twitch authorization was not issued to Tempest Streaming Studio.');
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
        return sendJson(response, 200, { schemaVersion: 1, installationId: installation.id, channel: { id: installation.channelId, login: installation.channelLogin }, updatedAt: installation.updatedAt }, origin);
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/installations/current') {
        const installation = await installationStore.findActiveByRelayTokenHash(relayTokenHash(bearerToken(request)));
        if (!installation) throw new HttpError(401, 'Installation relay credential is invalid or revoked.');
        await installationStore.revoke(installation.id);
        studioSockets.get(installation.channelId)?.close(4003, 'Installation revoked');
        return sendJson(response, 200, { revoked: true }, origin);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/extension/status') {
        const { claims } = await authenticateViewer(request);
        return sendJson(response, 200, { studioConnected: studioSockets.get(claims.channel_id)?.readyState === WebSocket.OPEN }, origin);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/extension/catalog') {
        const { claims, installation } = await authenticateViewer(request);
        return sendJson(response, 200, { ...installation.catalog, studioConnected: studioSockets.get(claims.channel_id)?.readyState === WebSocket.OPEN }, origin);
      }
      const alertMatch = requestUrl.pathname.match(/^\/v1\/extension\/alerts\/([^/]+)\/trigger$/);
      if (request.method === 'POST' && alertMatch) {
        const { claims, installation } = await authenticateViewer(request);
        const alertId = decodeURIComponent(alertMatch[1]);
        if (!soundAlertPattern.test(alertId)) throw new HttpError(404, 'Sound Alert was not recognized.');
        if (!installation.catalog.items.some((item) => item.kind === 'sound-alert' && item.id === alertId) && !allowedChannelIds.has(claims.channel_id)) throw new HttpError(404, 'Sound Alert is not published by this Studio installation.');
        const result = await processInteraction(request, claims, (requestId) => normalizedEvent(claims, requestId, alertId, { alertId }));
        return sendJson(response, result.status, result.body, origin);
      }
      const interactionMatch = requestUrl.pathname.match(/^\/v1\/extension\/interactions\/([^/]+)\/trigger$/);
      if (request.method === 'POST' && interactionMatch) {
        const { claims, installation } = await authenticateViewer(request);
        const action = decodeURIComponent(interactionMatch[1]);
        const catalogAllowed = installation.catalog.items.some((item) => item.kind === 'interaction' && item.id === action);
        if (!catalogAllowed && !allowedActions.has(action)) throw new HttpError(403, 'This interaction is not published by this Studio installation.');
        const result = await processInteraction(request, claims, (requestId) => normalizedEvent(claims, requestId, action));
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
          return socket.send(JSON.stringify({ protocolVersion: 1, type: 'catalog.ack', updatedAt: catalog.updatedAt, itemCount: catalog.items.length }));
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
