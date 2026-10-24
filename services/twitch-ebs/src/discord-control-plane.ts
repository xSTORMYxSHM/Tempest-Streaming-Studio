import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import { Pool } from 'pg';
import { WebSocket, WebSocketServer } from 'ws';

const maximumBodyBytes = 16 * 1024;
const snowflakePattern = /^\d{17,20}$/;
const identifierPattern = /^[A-Za-z0-9_-]{8,128}$/;
const pairingCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface DiscordControlPlaneOptions {
  applicationId: string;
  workerToken: string;
  databaseUrl: string;
  databaseSsl?: boolean;
  installUrl?: string;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface DiscordControlPlane {
  handleHttp(request: IncomingMessage, response: ServerResponse, requestUrl: URL): Promise<boolean>;
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, requestUrl: URL): Promise<boolean>;
  health(): { workerConnected: boolean; studioConnections: number; activeSessions: number; guilds: number };
  close(): Promise<void>;
}

interface DiscordBinding {
  id: string;
  guildId: string;
  studioInstallationId: string;
  studioAlias: string;
  streamerUserId?: string;
  operatorRoleId?: string;
}

interface ActiveSession {
  guildId: string;
  channelId: string;
  bindingId: string;
  sessionId: string;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function bearerToken(request: IncomingMessage): string {
  const authorization = String(request.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftHash = Buffer.from(hash(left));
  const rightHash = Buffer.from(hash(right));
  return timingSafeEqual(leftHash, rightHash);
}

function pairingCode(): string {
  const bytes = randomBytes(8);
  return [...bytes].map((value) => pairingCodeAlphabet[value % pairingCodeAlphabet.length]).join('');
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBodyBytes) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Request body must be an object.');
  return parsed as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

function installUrl(applicationId: string, configured?: string): string {
  if (configured) {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'https:') throw new Error('Discord install URL must use HTTPS.');
    return parsed.toString();
  }
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', applicationId);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('permissions', '3146752');
  url.searchParams.set('integration_type', '0');
  return url.toString();
}

class DiscordStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string, databaseSsl = false) {
    this.pool = new Pool({ connectionString: databaseUrl, ssl: databaseSsl ? { rejectUnauthorized: false } : undefined, max: 5 });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tempest_discord_pairings (
        id UUID PRIMARY KEY,
        code_hash CHAR(64) NOT NULL UNIQUE,
        poll_token_hash CHAR(64) NOT NULL,
        studio_installation_id UUID NOT NULL,
        studio_alias VARCHAR(60) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        guild_id VARCHAR(20),
        binding_id UUID,
        relay_token TEXT,
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS tempest_discord_pairings_expiry_idx ON tempest_discord_pairings (expires_at);
      CREATE TABLE IF NOT EXISTS tempest_discord_bindings (
        id UUID PRIMARY KEY,
        guild_id VARCHAR(20) NOT NULL,
        studio_installation_id UUID NOT NULL,
        studio_alias VARCHAR(60) NOT NULL,
        relay_token_hash CHAR(64) NOT NULL UNIQUE,
        streamer_user_id VARCHAR(20),
        operator_role_id VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        revoked_at TIMESTAMPTZ,
        UNIQUE (guild_id, studio_installation_id)
      );
      CREATE INDEX IF NOT EXISTS tempest_discord_bindings_guild_idx ON tempest_discord_bindings (guild_id) WHERE revoked_at IS NULL;
      CREATE TABLE IF NOT EXISTS tempest_discord_privacy (
        guild_id VARCHAR(20) NOT NULL,
        user_id VARCHAR(20) NOT NULL,
        hidden BOOLEAN NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, user_id)
      );
    `);
  }

  async createPairing(studioInstallationId: string, studioAlias: string): Promise<{ id: string; code: string; pollToken: string; expiresAt: string }> {
    await this.pool.query('DELETE FROM tempest_discord_pairings WHERE expires_at < NOW() OR completed_at < NOW() - INTERVAL \'10 minutes\'');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = randomUUID();
      const code = pairingCode();
      const pollToken = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      try {
        await this.pool.query('INSERT INTO tempest_discord_pairings (id, code_hash, poll_token_hash, studio_installation_id, studio_alias, expires_at) VALUES ($1, $2, $3, $4, $5, $6)', [id, hash(code), hash(pollToken), studioInstallationId, studioAlias, expiresAt]);
        return { id, code, pollToken, expiresAt };
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') throw error;
      }
    }
    throw new Error('Could not allocate a unique Discord pairing code.');
  }

  async pollPairing(id: string, pollToken: string): Promise<{ state: 'pending'; expiresAt: string } | { state: 'complete'; binding: DiscordBinding; relayToken: string } | null> {
    const result = await this.pool.query('SELECT id, poll_token_hash, studio_installation_id, studio_alias, expires_at, guild_id, binding_id, relay_token, completed_at FROM tempest_discord_pairings WHERE id = $1', [id]);
    const row = result.rows[0];
    if (!row || !constantTimeEqual(pollToken, String(row.poll_token_hash)) || new Date(row.expires_at).getTime() < Date.now()) return null;
    if (!row.completed_at || !row.binding_id || !row.guild_id || !row.relay_token) return { state: 'pending', expiresAt: new Date(row.expires_at).toISOString() };
    const binding: DiscordBinding = { id: row.binding_id, guildId: row.guild_id, studioInstallationId: row.studio_installation_id, studioAlias: row.studio_alias };
    return { state: 'complete', binding, relayToken: row.relay_token };
  }

  async completePairing(code: string, guildId: string, streamerUserId: string): Promise<DiscordBinding | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT id, studio_installation_id, studio_alias FROM tempest_discord_pairings WHERE code_hash = $1 AND completed_at IS NULL AND expires_at > NOW() FOR UPDATE', [hash(code.toUpperCase())]);
      const pairing = result.rows[0];
      if (!pairing) { await client.query('ROLLBACK'); return null; }
      const bindingId = randomUUID();
      const relayToken = randomBytes(32).toString('base64url');
      const existing = await client.query('SELECT id FROM tempest_discord_bindings WHERE guild_id = $1 AND studio_installation_id = $2', [guildId, pairing.studio_installation_id]);
      const savedId = existing.rows[0]?.id || bindingId;
      if (existing.rows[0]) {
        await client.query('UPDATE tempest_discord_bindings SET studio_alias = $2, relay_token_hash = $3, streamer_user_id = $4, revoked_at = NULL, updated_at = NOW() WHERE id = $1', [savedId, pairing.studio_alias, hash(relayToken), streamerUserId]);
      } else {
        await client.query('INSERT INTO tempest_discord_bindings (id, guild_id, studio_installation_id, studio_alias, relay_token_hash, streamer_user_id) VALUES ($1, $2, $3, $4, $5, $6)', [savedId, guildId, pairing.studio_installation_id, pairing.studio_alias, hash(relayToken), streamerUserId]);
      }
      await client.query('UPDATE tempest_discord_pairings SET guild_id = $2, binding_id = $3, relay_token = $4, completed_at = NOW() WHERE id = $1', [pairing.id, guildId, savedId, relayToken]);
      await client.query('COMMIT');
      return { id: savedId, guildId, studioInstallationId: pairing.studio_installation_id, studioAlias: pairing.studio_alias, streamerUserId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async bindingsForGuild(guildId: string): Promise<DiscordBinding[]> {
    const result = await this.pool.query('SELECT id, guild_id, studio_installation_id, studio_alias, streamer_user_id, operator_role_id FROM tempest_discord_bindings WHERE guild_id = $1 AND revoked_at IS NULL ORDER BY studio_alias', [guildId]);
    return result.rows.map((row) => ({ id: row.id, guildId: row.guild_id, studioInstallationId: row.studio_installation_id, studioAlias: row.studio_alias, ...(row.streamer_user_id ? { streamerUserId: row.streamer_user_id } : {}), ...(row.operator_role_id ? { operatorRoleId: row.operator_role_id } : {}) }));
  }

  async bindingByToken(token: string): Promise<DiscordBinding | null> {
    const result = await this.pool.query('SELECT id, guild_id, studio_installation_id, studio_alias, streamer_user_id, operator_role_id FROM tempest_discord_bindings WHERE relay_token_hash = $1 AND revoked_at IS NULL', [hash(token)]);
    const row = result.rows[0];
    return row ? { id: row.id, guildId: row.guild_id, studioInstallationId: row.studio_installation_id, studioAlias: row.studio_alias, ...(row.streamer_user_id ? { streamerUserId: row.streamer_user_id } : {}), ...(row.operator_role_id ? { operatorRoleId: row.operator_role_id } : {}) } : null;
  }

  async revoke(bindingId: string): Promise<void> {
    await this.pool.query('UPDATE tempest_discord_bindings SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1', [bindingId]);
  }

  async updateAlias(bindingId: string, studioAlias: string): Promise<void> {
    await this.pool.query('UPDATE tempest_discord_bindings SET studio_alias = $2, updated_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [bindingId, studioAlias]);
  }

  async setPrivacy(guildId: string, userId: string, hidden: boolean): Promise<void> {
    await this.pool.query('INSERT INTO tempest_discord_privacy (guild_id, user_id, hidden) VALUES ($1, $2, $3) ON CONFLICT (guild_id, user_id) DO UPDATE SET hidden = EXCLUDED.hidden, updated_at = NOW()', [guildId, userId, hidden]);
  }

  async hiddenUsers(guildId: string): Promise<string[]> {
    const result = await this.pool.query('SELECT user_id FROM tempest_discord_privacy WHERE guild_id = $1 AND hidden = TRUE', [guildId]);
    return result.rows.map((row) => String(row.user_id));
  }

  async close(): Promise<void> { await this.pool.end(); }
}

export async function startDiscordControlPlane(options: DiscordControlPlaneOptions): Promise<DiscordControlPlane> {
  if (!snowflakePattern.test(options.applicationId)) throw new Error('Discord Companion application ID is invalid.');
  if (options.workerToken.length < 32) throw new Error('Discord Companion worker token must contain at least 32 characters.');
  const logger = options.logger || console;
  const store = new DiscordStore(options.databaseUrl, options.databaseSsl);
  await store.initialize();
  const publicInstallUrl = installUrl(options.applicationId, options.installUrl);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  let workerSocket: WebSocket | null = null;
  const studioSockets = new Map<string, WebSocket>();
  const socketBindings = new WeakMap<WebSocket, DiscordBinding>();
  const activeSessions = new Map<string, ActiveSession>();
  const guildIds = new Set<string>();

  const sendWorker = (message: unknown): boolean => {
    if (!workerSocket || workerSocket.readyState !== WebSocket.OPEN) return false;
    workerSocket.send(JSON.stringify(message));
    return true;
  };
  const sendStudio = (bindingId: string, message: unknown): boolean => {
    const socket = studioSockets.get(bindingId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };

  const commandResponse = (requestId: string, ok: boolean, message: string) => sendWorker({ type: 'command.response', requestId, ok, message });
  const handleCommand = async (message: Record<string, unknown>): Promise<void> => {
    const requestId = String(message.requestId || '');
    const command = String(message.command || '');
    const guildId = String(message.guildId || '');
    const userId = String(message.userId || '');
    const manageGuild = message.manageGuild === true;
    const roleIds = Array.isArray(message.roleIds) ? message.roleIds.map(String) : [];
    const commandOptions = message.options && typeof message.options === 'object' && !Array.isArray(message.options) ? message.options as Record<string, unknown> : {};
    if (!identifierPattern.test(requestId) || !snowflakePattern.test(guildId) || !snowflakePattern.test(userId)) return;
    if (command === 'setup') {
      if (!manageGuild) return void commandResponse(requestId, false, 'You need Manage Server to connect Tempest Studio.');
      const code = String(commandOptions.code || '').trim().toUpperCase();
      if (!/^[A-Z2-9]{8}$/.test(code)) return void commandResponse(requestId, false, 'Create a pairing code in Tempest Studio, then run `/tempest setup code:YOURCODE`.');
      const binding = await store.completePairing(code, guildId, userId);
      return void commandResponse(requestId, Boolean(binding), binding ? `Connected **${binding.studioAlias}** to this server. Return to Tempest Studio to finish.` : 'That pairing code is invalid or expired. Create a new code in Tempest Studio.');
    }
    const bindings = await store.bindingsForGuild(guildId);
    if (command === 'status') {
      const session = activeSessions.get(guildId);
      const names = bindings.map((binding) => `**${binding.studioAlias}**${studioSockets.has(binding.id) ? ' online' : ' offline'}`).join(', ');
      return void commandResponse(requestId, true, bindings.length ? `Tempest bindings: ${names}.${session ? ` Active voice session: <#${session.channelId}>.` : ' No active voice session.'}` : 'This server is not linked. Create a pairing code in Tempest Studio and use `/tempest setup`.');
    }
    if (command === 'privacy') {
      const visible = commandOptions.visible === true;
      await store.setPrivacy(guildId, userId, !visible);
      sendWorker({ type: 'privacy.changed', guildId, userId, hidden: !visible });
      return void commandResponse(requestId, true, visible ? 'Your Discord profile may appear in active Tempest guest overlays.' : 'Your Discord profile is now hidden from Tempest guest overlays in this server.');
    }
    const alias = String(commandOptions.studio || '').trim().toLowerCase();
    const binding = alias ? bindings.find((entry) => entry.studioAlias.toLowerCase() === alias) : bindings.length === 1 ? bindings[0] : undefined;
    if (command === 'unlink') {
      if (!manageGuild) return void commandResponse(requestId, false, 'You need Manage Server to unlink Tempest Studio.');
      if (!binding) return void commandResponse(requestId, false, 'Choose a valid Studio alias to unlink.');
      await store.revoke(binding.id);
      studioSockets.get(binding.id)?.close(4003, 'Studio binding revoked');
      if (activeSessions.get(guildId)?.bindingId === binding.id) {
        sendWorker({ type: 'session.stop', guildId, reason: 'Studio binding unlinked.' });
        activeSessions.delete(guildId);
      }
      return void commandResponse(requestId, true, `Unlinked **${binding.studioAlias}** from this server.`);
    }
    const authorized = manageGuild || Boolean(binding?.operatorRoleId && roleIds.includes(binding.operatorRoleId));
    if (!authorized) return void commandResponse(requestId, false, 'You need Manage Server or the configured Tempest operator role to control sessions.');
    if (command === 'session.start') {
      const channelId = String(commandOptions.voiceChannelId || '');
      if (!binding) return void commandResponse(requestId, false, bindings.length > 1 ? 'This server has multiple Studios. Supply the Studio alias.' : 'Link this server to Tempest Studio first.');
      if (!snowflakePattern.test(channelId)) return void commandResponse(requestId, false, 'Choose a valid voice channel.');
      if (!studioSockets.has(binding.id)) return void commandResponse(requestId, false, `**${binding.studioAlias}** is offline. Open Tempest Studio and try again.`);
      if (!workerSocket || workerSocket.readyState !== WebSocket.OPEN) return void commandResponse(requestId, false, 'The Tempest Discord worker is restarting. Try again shortly.');
      const existing = activeSessions.get(guildId);
      if (existing) sendWorker({ type: 'session.stop', guildId, sessionId: existing.sessionId, reason: 'Replaced by a new session.' });
      const session: ActiveSession = { guildId, channelId, bindingId: binding.id, sessionId: randomUUID() };
      activeSessions.set(guildId, session);
      const hiddenUserIds = await store.hiddenUsers(guildId);
      sendWorker({ type: 'session.start', ...session, streamerUserId: binding.streamerUserId, hiddenUserIds });
      return void commandResponse(requestId, true, `Starting **${binding.studioAlias}** in <#${channelId}>.`);
    }
    if (command === 'session.stop') {
      const session = activeSessions.get(guildId);
      if (!session) return void commandResponse(requestId, true, 'There is no active Tempest voice session.');
      sendWorker({ type: 'session.stop', guildId, sessionId: session.sessionId, reason: 'Stopped by a Discord operator.' });
      activeSessions.delete(guildId);
      sendStudio(session.bindingId, { type: 'session.state', guildId, sessionId: session.sessionId, state: 'stopped', reason: 'Stopped by a Discord operator.' });
      return void commandResponse(requestId, true, 'Stopped the Tempest voice session.');
    }
    commandResponse(requestId, false, 'Unsupported Tempest command.');
  };

  sockets.on('connection', (socket, request) => {
    const pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname;
    if (pathname === '/v1/discord/bot-worker') {
      if (workerSocket && workerSocket !== socket) workerSocket.close(4001, 'Replaced by newer worker');
      workerSocket = socket;
      socket.once('message', (raw) => {
        try {
          const hello = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (hello.type !== 'worker.hello' || hello.protocolVersion !== 1 || hello.applicationId !== options.applicationId) return socket.close(4002, 'Invalid worker hello');
          for (const guildId of Array.isArray(hello.guildIds) ? hello.guildIds.map(String) : []) if (snowflakePattern.test(guildId)) guildIds.add(guildId);
          socket.send(JSON.stringify({ type: 'worker.ready', heartbeatIntervalMs: 30_000 }));
        } catch { socket.close(4002, 'Invalid worker hello'); }
      });
      socket.on('message', (raw) => {
        try {
          const message = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (message.type === 'command.request') void handleCommand(message).catch((error) => logger.error(error));
          else if (message.type === 'guild.upsert' && snowflakePattern.test(String(message.guildId))) guildIds.add(String(message.guildId));
          else if (message.type === 'guild.remove') guildIds.delete(String(message.guildId));
          else if (message.type === 'voice.snapshot') {
            const guildId = String(message.guildId || '');
            const session = activeSessions.get(guildId);
            if (session && session.sessionId === message.sessionId && session.bindingId === message.bindingId) sendStudio(session.bindingId, message);
          } else if (message.type === 'session.state') {
            const guildId = String(message.guildId || '');
            const session = activeSessions.get(guildId);
            if (session && session.sessionId === message.sessionId) {
              sendStudio(session.bindingId, message);
              if (message.state === 'stopped' || message.state === 'failed') activeSessions.delete(guildId);
            }
          }
        } catch (error) { logger.warn(error); }
      });
      socket.on('close', () => { if (workerSocket === socket) workerSocket = null; });
      return;
    }
    const binding = socketBindings.get(socket);
    if (!binding) return socket.close(4003, 'Unauthorized Studio');
    const existing = studioSockets.get(binding.id);
    if (existing && existing !== socket) existing.close(4001, 'Replaced by newer Studio connection');
    studioSockets.set(binding.id, socket);
    socket.send(JSON.stringify({ type: 'welcome', protocolVersion: 1, bindingId: binding.id, guildId: binding.guildId, studioAlias: binding.studioAlias }));
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (message.type === 'heartbeat') socket.send(JSON.stringify({ type: 'heartbeat', at: new Date().toISOString() }));
      } catch { socket.close(4002, 'Invalid Studio message'); }
    });
    socket.on('close', () => {
      if (studioSockets.get(binding.id) === socket) studioSockets.delete(binding.id);
      const session = activeSessions.get(binding.guildId);
      if (session?.bindingId === binding.id) {
        sendWorker({ type: 'session.stop', guildId: binding.guildId, sessionId: session.sessionId, reason: 'Tempest Studio disconnected.' });
        activeSessions.delete(binding.guildId);
      }
    });
  });

  return {
    async handleHttp(request, response, requestUrl) {
      if (request.method === 'GET' && requestUrl.pathname === '/v1/discord/install') {
        sendJson(response, 200, { installUrl: publicInstallUrl });
        return true;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/discord/studio/pairings') {
        try {
          const body = await readJson(request);
          const studioInstallationId = String(body.studioInstallationId || '');
          const studioAlias = String(body.studioAlias || '').trim();
          if (!/^[0-9a-f-]{36}$/i.test(studioInstallationId) || !studioAlias || studioAlias.length > 60 || /[\r\n\0]/.test(studioAlias)) {
            sendJson(response, 400, { error: 'Studio pairing details are invalid.' });
            return true;
          }
          const pairing = await store.createPairing(studioInstallationId, studioAlias);
          sendJson(response, 201, { schemaVersion: 1, ...pairing, installUrl: publicInstallUrl });
        } catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : 'Could not create Discord pairing.' }); }
        return true;
      }
      const pairingMatch = requestUrl.pathname.match(/^\/v1\/discord\/studio\/pairings\/([0-9a-f-]{36})$/i);
      if (request.method === 'GET' && pairingMatch) {
        const result = await store.pollPairing(pairingMatch[1], bearerToken(request));
        if (!result) sendJson(response, 401, { error: 'Discord pairing is invalid or expired.' });
        else if (result.state === 'pending') sendJson(response, 200, { schemaVersion: 1, state: 'pending', expiresAt: result.expiresAt });
        else sendJson(response, 200, { schemaVersion: 1, state: 'complete', bindingId: result.binding.id, guildId: result.binding.guildId, studioAlias: result.binding.studioAlias, relayToken: result.relayToken, relayPath: '/v1/discord/studio' });
        return true;
      }
      if (request.method === 'DELETE' && requestUrl.pathname === '/v1/discord/studio/current') {
        const binding = await store.bindingByToken(bearerToken(request));
        if (!binding) sendJson(response, 401, { error: 'Discord Studio credential is invalid or revoked.' });
        else {
          await store.revoke(binding.id);
          studioSockets.get(binding.id)?.close(4003, 'Studio binding revoked');
          sendJson(response, 204, {});
        }
        return true;
      }
      if (request.method === 'PATCH' && requestUrl.pathname === '/v1/discord/studio/current') {
        const binding = await store.bindingByToken(bearerToken(request));
        if (!binding) sendJson(response, 401, { error: 'Discord Studio credential is invalid or revoked.' });
        else {
          try {
            const body = await readJson(request);
            const studioAlias = String(body.studioAlias || '').trim();
            if (!studioAlias || studioAlias.length > 60 || /[\r\n\0]/.test(studioAlias)) throw new Error('Studio alias must contain 1–60 characters.');
            await store.updateAlias(binding.id, studioAlias);
            const studioSocket = studioSockets.get(binding.id);
            if (studioSocket) socketBindings.set(studioSocket, { ...binding, studioAlias });
            sendJson(response, 200, { schemaVersion: 1, bindingId: binding.id, guildId: binding.guildId, studioAlias });
          } catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : 'Could not update the Studio alias.' }); }
        }
        return true;
      }
      return false;
    },
    async handleUpgrade(request, socket, head, requestUrl) {
      if (requestUrl.pathname === '/v1/discord/bot-worker') {
        if (!constantTimeEqual(bearerToken(request), options.workerToken)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return true;
        }
        sockets.handleUpgrade(request, socket, head, (webSocket) => sockets.emit('connection', webSocket, request));
        return true;
      }
      if (requestUrl.pathname === '/v1/discord/studio') {
        const binding = await store.bindingByToken(bearerToken(request));
        if (!binding) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); socket.destroy(); return true; }
        sockets.handleUpgrade(request, socket, head, (webSocket) => { socketBindings.set(webSocket, binding); sockets.emit('connection', webSocket, request); });
        return true;
      }
      return false;
    },
    health: () => ({ workerConnected: workerSocket?.readyState === WebSocket.OPEN, studioConnections: studioSockets.size, activeSessions: activeSessions.size, guilds: guildIds.size }),
    close: async () => {
      workerSocket?.close(1001, 'Signal shutting down');
      for (const socket of studioSockets.values()) socket.close(1001, 'Signal shutting down');
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await store.close();
    }
  };
}
