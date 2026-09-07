import { randomUUID } from 'node:crypto';
import net, { Socket } from 'node:net';

export const OFFICIAL_DISCORD_CLIENT_ID = '1546349623701151854';
export const OFFICIAL_DISCORD_TOKEN_EXCHANGE_URL = 'https://signal.tempestmainframe.com/v1/discord/oauth/exchange';

export interface DiscordRpcTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface DiscordRpcTokenStore {
  available: boolean;
  load(): Promise<DiscordRpcTokenSet | null>;
  save(tokens: DiscordRpcTokenSet): Promise<void>;
  clear(): Promise<void>;
}

export interface DiscordRpcStatus {
  state: 'unconfigured' | 'disconnected' | 'connecting' | 'authorization-required' | 'connected' | 'error';
  configured: boolean;
  approvedApplicationRequired: boolean;
  credentialStorage: 'windows-encrypted' | 'unavailable';
  channelName?: string;
  guildName?: string;
  participantCount: number;
  userName?: string;
  lastError?: string;
}

interface DiscordRpcOptions {
  clientId?: string;
  tokenExchangeUrl?: string;
  tokenStore: DiscordRpcTokenStore;
  publishState(state: Record<string, unknown>): Promise<void>;
  publishSpeaking(userId: string, speaking: boolean): Promise<void>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

interface RpcPayload {
  cmd?: string;
  nonce?: string;
  evt?: string;
  args?: Record<string, unknown>;
  data?: unknown;
}

interface VoiceState {
  voice_state?: { mute?: boolean; deaf?: boolean; self_mute?: boolean; self_deaf?: boolean };
  user?: { id?: string; username?: string; global_name?: string; avatar?: string; bot?: boolean };
  nick?: string;
}

interface VoiceChannel {
  id?: string;
  guild_id?: string;
  name?: string;
  voice_states?: VoiceState[];
}

export function encodeDiscordRpcFrame(opcode: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.allocUnsafe(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

export function readDiscordRpcFrames(buffer: Buffer): { frames: Array<{ opcode: number; payload: RpcPayload }>; remaining: Buffer } {
  const frames: Array<{ opcode: number; payload: RpcPayload }> = [];
  let offset = 0;
  while (buffer.length - offset >= 8) {
    const opcode = buffer.readUInt32LE(offset);
    const length = buffer.readUInt32LE(offset + 4);
    if (length > 16 * 1024 * 1024) throw new Error('Discord RPC sent an oversized frame.');
    if (buffer.length - offset - 8 < length) break;
    const text = buffer.subarray(offset + 8, offset + 8 + length).toString('utf8');
    frames.push({ opcode, payload: JSON.parse(text) as RpcPayload });
    offset += 8 + length;
  }
  return { frames, remaining: buffer.subarray(offset) };
}

export function discordIpcPaths(platform = process.platform): string[] {
  if (platform === 'win32') {
    return Array.from({ length: 10 }, (_unused, index) => [
      `\\\\.\\pipe\\discord-ipc-${index}`,
      `\\\\?\\pipe\\discord-ipc-${index}`
    ]).flat();
  }
  const bases = [process.env.XDG_RUNTIME_DIR, process.env.TMPDIR, process.env.TMP, process.env.TEMP, '/tmp'].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  return bases.flatMap((base) => Array.from({ length: 10 }, (_unused, index) => `${base}/discord-ipc-${index}`));
}

function string(value: unknown): string { return typeof value === 'string' ? value : ''; }

export class TempestDiscordRpcClient {
  private socket: Socket | null = null;
  private receiveBuffer: Buffer = Buffer.alloc(0);
  private pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  private currentUserId = '';
  private currentUserName = '';
  private channelId = '';
  private channelName = '';
  private guildName = '';
  private participantCount = 0;
  private speakingUsers = new Set<string>();
  private lastError = '';
  private phase: DiscordRpcStatus['state'] = 'disconnected';
  private readonly clientId: string;
  private readonly tokenExchangeUrl: string;
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;

  constructor(private readonly options: DiscordRpcOptions) {
    this.clientId = String(options.clientId || '').trim();
    this.tokenExchangeUrl = String(options.tokenExchangeUrl || '').trim();
    this.logger = options.logger || console;
    if (!this.clientId || !this.tokenExchangeUrl) this.phase = 'unconfigured';
  }

  status(): DiscordRpcStatus {
    return {
      state: this.phase,
      configured: Boolean(this.clientId && this.tokenExchangeUrl),
      approvedApplicationRequired: true,
      credentialStorage: this.options.tokenStore.available ? 'windows-encrypted' : 'unavailable',
      ...(this.channelName ? { channelName: this.channelName } : {}),
      ...(this.guildName ? { guildName: this.guildName } : {}),
      participantCount: this.participantCount,
      ...(this.currentUserName ? { userName: this.currentUserName } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {})
    };
  }

  async connect(authorize = false): Promise<DiscordRpcStatus> {
    if (!this.clientId || !this.tokenExchangeUrl) throw new Error('The official Tempest Discord application is not configured in this build yet. The local overlay preview is available now.');
    if (!this.options.tokenStore.available) throw new Error('Windows credential encryption is unavailable.');
    if (this.socket && this.phase === 'connected') return this.status();
    this.phase = 'connecting';
    this.lastError = '';
    try {
      await this.openPipe();
      const ready = await this.waitForEvent('READY');
      const readyUser = (ready as { user?: Record<string, unknown> })?.user || {};
      this.currentUserId = string(readyUser.id);
      this.currentUserName = string(readyUser.global_name) || string(readyUser.username);
      let tokens = await this.options.tokenStore.load();
      if (!tokens && !authorize) {
        this.phase = 'authorization-required';
        return this.status();
      }
      if (!tokens) tokens = await this.authorize();
      if (tokens.refreshToken && tokens.expiresAt && new Date(tokens.expiresAt).getTime() <= Date.now() + 5 * 60_000) tokens = await this.refresh(tokens);
      try { await this.command('AUTHENTICATE', { access_token: tokens.accessToken }); }
      catch (error) {
        if (tokens.refreshToken) {
          try {
            tokens = await this.refresh(tokens);
            await this.command('AUTHENTICATE', { access_token: tokens.accessToken });
          } catch {
            await this.options.tokenStore.clear();
            if (!authorize) { this.phase = 'authorization-required'; return this.status(); }
            tokens = await this.authorize();
            await this.command('AUTHENTICATE', { access_token: tokens.accessToken });
          }
        } else {
          await this.options.tokenStore.clear();
          if (!authorize) { this.phase = 'authorization-required'; return this.status(); }
          tokens = await this.authorize();
          await this.command('AUTHENTICATE', { access_token: tokens.accessToken });
        }
      }
      await this.subscribe('VOICE_CHANNEL_SELECT', {});
      this.phase = 'connected';
      await this.refreshSelectedChannel();
      return this.status();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Discord could not be connected.';
      this.phase = 'error';
      this.destroySocket();
      await this.options.publishState({ connected: false, participants: [], error: this.lastError }).catch(() => {});
      throw error;
    }
  }

  async disconnect(): Promise<DiscordRpcStatus> {
    this.destroySocket();
    this.phase = this.clientId && this.tokenExchangeUrl ? 'disconnected' : 'unconfigured';
    this.channelId = '';
    this.channelName = '';
    this.guildName = '';
    this.participantCount = 0;
    this.speakingUsers.clear();
    await this.options.publishState({ connected: false, participants: [] });
    return this.status();
  }

  async forget(): Promise<DiscordRpcStatus> {
    await this.disconnect();
    await this.options.tokenStore.clear();
    this.phase = this.clientId && this.tokenExchangeUrl ? 'authorization-required' : 'unconfigured';
    return this.status();
  }

  async close(): Promise<void> { await this.disconnect().catch(() => {}); }

  private async authorize(): Promise<DiscordRpcTokenSet> {
    const response = await this.command('AUTHORIZE', { client_id: this.clientId, scopes: ['rpc', 'identify', 'rpc.voice.read'] }) as { code?: unknown };
    const code = string(response?.code);
    if (!code) throw new Error('Discord did not return an authorization code.');
    return this.exchangeTokens({ grantType: 'authorization_code', code, clientId: this.clientId });
  }

  private async refresh(tokens: DiscordRpcTokenSet): Promise<DiscordRpcTokenSet> {
    if (!tokens.refreshToken) throw new Error('No Discord refresh token is available.');
    return this.exchangeTokens({ grantType: 'refresh_token', refreshToken: tokens.refreshToken, clientId: this.clientId }, tokens.refreshToken);
  }

  private async exchangeTokens(body: Record<string, string>, previousRefreshToken?: string): Promise<DiscordRpcTokenSet> {
    const url = new URL(this.tokenExchangeUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('The Discord token exchange service must use public HTTPS.');
    const exchange = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await exchange.json().catch(() => ({})) as { accessToken?: unknown; access_token?: unknown; refreshToken?: unknown; refresh_token?: unknown; expiresAt?: unknown; expires_at?: unknown; expiresIn?: unknown; expires_in?: unknown; error?: unknown };
    if (!exchange.ok) throw new Error(string(result.error) || `Discord authorization exchange failed with ${exchange.status}.`);
    const accessToken = string(result.accessToken) || string(result.access_token);
    if (!accessToken) throw new Error('The Discord authorization service returned no access token.');
    const refreshToken = string(result.refreshToken) || string(result.refresh_token) || previousRefreshToken || undefined;
    const providedExpiry = string(result.expiresAt) || string(result.expires_at);
    const expiresIn = Number(result.expiresIn ?? result.expires_in);
    const expiresAt = providedExpiry || (Number.isFinite(expiresIn) ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined);
    const tokens = { accessToken, ...(refreshToken ? { refreshToken } : {}), ...(expiresAt ? { expiresAt } : {}) };
    await this.options.tokenStore.save(tokens);
    return tokens;
  }

  private async openPipe(): Promise<void> {
    this.destroySocket();
    let lastError: Error | undefined;
    for (const pipePath of discordIpcPaths()) {
      try {
        const socket = await new Promise<Socket>((resolve, reject) => {
          const candidate = net.createConnection(pipePath);
          const timer = setTimeout(() => { candidate.destroy(); reject(new Error('Discord IPC connection timed out.')); }, 800);
          candidate.once('connect', () => { clearTimeout(timer); candidate.removeListener('error', reject); resolve(candidate); });
          candidate.once('error', reject);
        });
        this.socket = socket;
        this.receiveBuffer = Buffer.alloc(0);
        socket.on('data', (chunk) => this.receive(chunk));
        socket.on('error', (error) => this.handleSocketFailure(error));
        socket.on('close', () => this.handleSocketFailure(new Error('Discord closed the local connection.')));
        socket.write(encodeDiscordRpcFrame(0, { v: 1, client_id: this.clientId }));
        return;
      } catch (error) { lastError = error as Error; }
    }
    const code = (lastError as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error('Discord blocked its local connection. Run Discord Desktop and Tempest Studio normally under the same Windows account, then try again.');
    }
    throw new Error('Discord Desktop did not expose a compatible local connection. Fully quit and reopen the Discord desktop app—not Discord in a browser—then try again.');
  }

  private receive(chunk: Buffer): void {
    this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);
    let parsed: ReturnType<typeof readDiscordRpcFrames>;
    try { parsed = readDiscordRpcFrames(this.receiveBuffer); }
    catch (error) { this.handleSocketFailure(error as Error); return; }
    this.receiveBuffer = parsed.remaining;
    for (const frame of parsed.frames) {
      if (frame.opcode === 3) { this.socket?.write(encodeDiscordRpcFrame(4, frame.payload)); continue; }
      if (frame.opcode === 2) { this.handleSocketFailure(new Error('Discord ended the RPC session.')); continue; }
      if (frame.opcode !== 1) continue;
      const payload = frame.payload;
      if (payload.nonce && this.pending.has(payload.nonce)) {
        const pending = this.pending.get(payload.nonce)!;
        clearTimeout(pending.timer);
        this.pending.delete(payload.nonce);
        if (payload.evt === 'ERROR') {
          const data = payload.data as { message?: unknown } | undefined;
          pending.reject(new Error(string(data?.message) || `${payload.cmd || 'Discord RPC'} failed.`));
        } else pending.resolve(payload.data);
        continue;
      }
      if (payload.cmd === 'DISPATCH' && payload.evt) void this.handleDispatch(payload.evt, payload.data);
    }
  }

  private command(cmd: string, args: Record<string, unknown>, evt?: string): Promise<unknown> {
    if (!this.socket) return Promise.reject(new Error('Discord is not connected.'));
    const nonce = randomUUID();
    const payload: RpcPayload = { cmd, args, nonce, ...(evt ? { evt } : {}) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(nonce); reject(new Error(`${cmd} timed out.`)); }, 12_000);
      timer.unref?.();
      this.pending.set(nonce, { resolve, reject, timer });
      this.socket!.write(encodeDiscordRpcFrame(1, payload));
    });
  }

  private subscribe(evt: string, args: Record<string, unknown>): Promise<unknown> { return this.command('SUBSCRIBE', args, evt); }

  private waitForEvent(evt: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Discord ${evt} event timed out.`)), 8_000);
      const poll = setInterval(() => {
        const listener = this.eventWaiters.get(evt);
        if (listener?.length) {
          const value = listener.shift();
          clearInterval(poll);
          clearTimeout(timeout);
          resolve(value);
        }
      }, 10);
      timeout.unref?.();
      poll.unref?.();
    });
  }

  private eventWaiters = new Map<string, unknown[]>();

  private async handleDispatch(evt: string, data: unknown): Promise<void> {
    if (evt === 'READY' || this.eventWaiters.has(evt)) {
      const waiters = this.eventWaiters.get(evt) || [];
      waiters.push(data);
      this.eventWaiters.set(evt, waiters);
    }
    if (evt === 'VOICE_CHANNEL_SELECT') await this.refreshSelectedChannel();
    else if (['VOICE_STATE_CREATE', 'VOICE_STATE_UPDATE', 'VOICE_STATE_DELETE'].includes(evt)) await this.refreshSelectedChannel();
    else if (evt === 'SPEAKING_START' || evt === 'SPEAKING_STOP') {
      const userId = string((data as { user_id?: unknown } | undefined)?.user_id);
      if (userId) {
        if (evt === 'SPEAKING_START') this.speakingUsers.add(userId); else this.speakingUsers.delete(userId);
        await this.options.publishSpeaking(userId, evt === 'SPEAKING_START');
      }
    }
  }

  private async refreshSelectedChannel(): Promise<void> {
    const channel = await this.command('GET_SELECTED_VOICE_CHANNEL', {}) as VoiceChannel | null;
    if (!channel?.id) {
      if (this.channelId) await this.updateChannelSubscriptions(this.channelId, false);
      this.channelId = '';
      this.channelName = '';
      this.guildName = '';
      this.participantCount = 0;
      this.speakingUsers.clear();
      await this.options.publishState({ connected: true, participants: [] });
      return;
    }
    const previousChannelId = this.channelId;
    const channelChanged = channel.id !== previousChannelId;
    this.channelId = channel.id;
    this.channelName = string(channel.name) || 'Discord Voice';
    if (channelChanged) {
      if (previousChannelId) await this.updateChannelSubscriptions(previousChannelId, false);
      this.speakingUsers.clear();
      await this.updateChannelSubscriptions(channel.id, true);
    }
    this.guildName = '';
    if (channel.guild_id) {
      const guild = await this.command('GET_GUILD', { guild_id: channel.guild_id }) as { name?: unknown };
      this.guildName = string(guild?.name);
    }
    const participants = (channel.voice_states || []).flatMap((entry) => {
      const user = entry.user;
      const id = string(user?.id);
      const username = string(user?.username);
      if (!id || !username) return [];
      const avatarHash = string(user?.avatar);
      const avatarUrl = avatarHash ? `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.${avatarHash.startsWith('a_') ? 'gif' : 'png'}?size=256` : undefined;
      return [{ id, username, displayName: string(entry.nick) || string(user?.global_name) || username, ...(avatarUrl ? { avatarUrl } : {}), bot: user?.bot === true, self: id === this.currentUserId, mute: entry.voice_state?.mute === true || entry.voice_state?.self_mute === true, deaf: entry.voice_state?.deaf === true || entry.voice_state?.self_deaf === true, speaking: this.speakingUsers.has(id) }];
    });
    this.participantCount = participants.length;
    await this.options.publishState({ connected: true, channelId: channel.id, channelName: this.channelName, guildName: this.guildName, participants });
  }

  private async updateChannelSubscriptions(channelId: string, subscribe: boolean): Promise<void> {
    const command = subscribe ? 'SUBSCRIBE' : 'UNSUBSCRIBE';
    for (const evt of ['VOICE_STATE_CREATE', 'VOICE_STATE_UPDATE', 'VOICE_STATE_DELETE', 'SPEAKING_START', 'SPEAKING_STOP']) {
      try { await this.command(command, { channel_id: channelId }, evt); }
      catch (error) { if (subscribe) throw error; else this.logger.warn(`Could not unsubscribe ${evt}: ${(error as Error).message}`); }
    }
  }

  private handleSocketFailure(error: Error): void {
    if (!this.socket) return;
    this.lastError = error.message;
    this.phase = 'error';
    this.destroySocket();
    void this.options.publishState({ connected: false, participants: [], error: this.lastError }).catch(() => {});
  }

  private destroySocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket) { socket.removeAllListeners(); socket.destroy(); }
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Discord connection closed.')); }
    this.pending.clear();
  }
}
