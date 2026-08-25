import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { AddressInfo } from 'node:net';
import { URL } from 'node:url';
import { TempestNormalizedTwitchEvent } from '@tempest/contracts';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeTwitchSecrets, TwitchExtensionClaims, verifyTwitchExtensionJwt } from './jwt';

export { decodeTwitchSecrets, verifyTwitchExtensionJwt } from './jwt';

export interface StartTwitchEbsOptions {
  host?: string;
  port?: number;
  twitchExtensionSecrets: string[];
  relayToken: string;
  allowedChannelIds: string[];
  allowedActions?: string[];
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

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function bearerToken(request: IncomingMessage): string {
  const authorization = String(request.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function extensionToken(request: IncomingMessage): string {
  const direct = String(request.headers['x-extension-jwt'] || '').trim();
  return direct || bearerToken(request);
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
  const relayToken = options.relayToken.trim();
  if (relayToken.length < 32) throw new Error('TEMPEST_EBS_RELAY_TOKEN must contain at least 32 characters.');
  const allowedChannelIds = new Set(options.allowedChannelIds.map((value) => value.trim()).filter((value) => /^\d{1,30}$/.test(value)));
  if (!allowedChannelIds.size) throw new Error('At least one numeric Twitch channel ID must be allowlisted.');
  const allowedActions = new Set((options.allowedActions || []).map((value) => value.trim()).filter((value) => actionPattern.test(value)));
  const allowedOrigins = new Set((options.allowedOrigins || []).map((value) => value.trim().replace(/\/$/, '')).filter(Boolean));
  const viewerLimit = Math.max(1, options.viewerRequestsPerMinute || 20);
  const channelLimit = Math.max(viewerLimit, options.channelRequestsPerMinute || 240);
  const relayTimeoutMs = Math.max(1_000, Math.min(30_000, options.relayTimeoutMs || 10_000));
  const limiter = new SlidingWindowLimiter();
  const studioSockets = new Map<string, WebSocket>();
  const pending = new Map<string, PendingRelay>();
  const results = new Map<string, CachedResult>();
  const webSockets = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const socketChannels = new WeakMap<WebSocket, string>();

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

  const authenticateViewer = (request: IncomingMessage): TwitchExtensionClaims => {
    let claims: TwitchExtensionClaims;
    try {
      claims = verifyTwitchExtensionJwt(extensionToken(request), secrets);
    } catch (error) {
      throw new HttpError(401, (error as Error).message);
    }
    if (!allowedChannelIds.has(claims.channel_id)) throw new HttpError(403, 'This Twitch channel is not authorized for Tempest Streaming Studio.');
    if (!options.allowAnonymous && claims.opaque_user_id.startsWith('A')) throw new HttpError(403, 'Anonymous Twitch viewers cannot trigger interactions.');
    return claims;
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
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Extension-JWT, X-Request-ID, Authorization');
        response.setHeader('Access-Control-Max-Age', '600');
        response.setHeader('Vary', 'Origin');
        return response.end();
      }
      if (request.method === 'GET' && requestUrl.pathname === '/health') {
        return sendJson(response, 200, { service: 'tempest-twitch-ebs', status: 'online', studioConnections: studioSockets.size }, origin);
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/extension/status') {
        const claims = authenticateViewer(request);
        return sendJson(response, 200, { studioConnected: studioSockets.get(claims.channel_id)?.readyState === WebSocket.OPEN }, origin);
      }
      const alertMatch = requestUrl.pathname.match(/^\/v1\/extension\/alerts\/([^/]+)\/trigger$/);
      if (request.method === 'POST' && alertMatch) {
        const claims = authenticateViewer(request);
        const alertId = decodeURIComponent(alertMatch[1]);
        if (!soundAlertPattern.test(alertId)) throw new HttpError(404, 'Sound Alert was not recognized.');
        const result = await processInteraction(request, claims, (requestId) => normalizedEvent(claims, requestId, alertId, { alertId }));
        return sendJson(response, result.status, result.body, origin);
      }
      const interactionMatch = requestUrl.pathname.match(/^\/v1\/extension\/interactions\/([^/]+)\/trigger$/);
      if (request.method === 'POST' && interactionMatch) {
        const claims = authenticateViewer(request);
        const action = decodeURIComponent(interactionMatch[1]);
        if (!allowedActions.has(action)) throw new HttpError(403, 'This interaction is not allowlisted by the EBS.');
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
    const requestUrl = new URL(request.url || '/', `${options.tls ? 'https' : 'http'}://${request.headers.host || 'localhost'}`);
    const channelId = String(request.headers['x-tempest-channel-id'] || '');
    if (requestUrl.pathname !== '/v1/studio' || !safeEqual(bearerToken(request), relayToken) || !allowedChannelIds.has(channelId)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      socketChannels.set(webSocket, channelId);
      webSockets.emit('connection', webSocket, request);
    });
  });

  webSockets.on('connection', (socket) => {
    const channelId = socketChannels.get(socket) as string;
    const existing = studioSockets.get(channelId);
    if (existing && existing !== socket) existing.close(4001, 'Replaced by a newer Studio connection');
    studioSockets.set(channelId, socket);
    socket.send(JSON.stringify({ protocolVersion: 1, type: 'welcome', channelId, connectionId: randomUUID() }));
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as { protocolVersion?: unknown; type?: unknown; requestId?: unknown; status?: unknown; body?: unknown };
        if (message.type === 'heartbeat') return socket.send(JSON.stringify({ protocolVersion: 1, type: 'heartbeat' }));
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
    });
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
    }
  };
  logger.info(`Tempest Twitch EBS listening on ${runtime.baseUrl}`);
  return runtime;
}
