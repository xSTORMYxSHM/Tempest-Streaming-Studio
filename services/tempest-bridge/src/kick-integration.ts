import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TempestNormalizedKickChatEvent } from '@tempest/contracts';

export const kickChatScopes = ['user:read', 'chat:write', 'events:subscribe'] as const;

export interface KickCredentialSet {
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
}

export interface KickCredentialStore {
  available: boolean;
  load(): Promise<KickCredentialSet | null>;
  save(credentials: KickCredentialSet): Promise<void>;
  clear(): Promise<void>;
}

interface KickConfiguration {
  schemaVersion: 1;
  clientId: string;
  redirectUri: string;
  updatedAt: string;
}

interface KickIdentity {
  userId: string;
  username: string;
  profilePicture?: string;
}

interface PendingAuthorization {
  state: string;
  codeVerifier: string;
  expiresAt: number;
}

export interface KickIntegrationStatus {
  owner: 'tempest-mainframe-studio';
  platform: 'kick';
  configured: boolean;
  clientId?: string;
  redirectUri: string;
  webhookUrl: string;
  oauth: {
    state: 'not-configured' | 'authorization-required' | 'authorization-pending' | 'authorized' | 'refreshing' | 'expired' | 'error';
    scopes: string[];
    storage: 'operating-system-credential-vault' | 'unavailable';
    account?: KickIdentity;
    tokenExpiresAt?: string;
  };
  events: {
    state: 'disconnected' | 'subscribing' | 'connected' | 'error';
    subscriptionId?: string;
  };
  messagesReceived: number;
  messagesSent: number;
  lastMessageAt?: string;
  lastError?: string;
}

export interface KickIntegrationOptions {
  dataDirectory: string;
  defaultRedirectUri: string;
  webhookUrl?: string;
  credentialStore?: KickCredentialStore;
  fetchImplementation?: typeof fetch;
  onChatEvent?(event: TempestNormalizedKickChatEvent): void | Promise<void>;
}

const defaultWebhookUrl = 'https://signal.tempestmainframe.com/v1/kick/events';

function validateClientId(value: unknown): string {
  const clientId = String(value || '').trim();
  if (!clientId || clientId.length > 120 || !/^[A-Za-z0-9_-]+$/.test(clientId)) throw new Error('Enter the Client ID from your Kick developer application.');
  return clientId;
}

function validateClientSecret(value: unknown): string {
  const secret = String(value || '').trim();
  if (secret.length < 16 || secret.length > 512 || /[\r\n\0]/.test(secret)) throw new Error('Enter a valid Kick client secret.');
  return secret;
}

function validateRedirectUri(value: unknown): string {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Kick OAuth must return to a localhost HTTP address.');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/v1/integrations/kick/oauth/callback') throw new Error('Kick redirect URL must use the Studio callback path without credentials, query, or fragment.');
  return url.href;
}

function responseMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const source = body as { message?: unknown; error?: unknown; data?: { message?: unknown } };
  return String(source.message || source.error || source.data?.message || fallback);
}

export class KickIntegrationGateway {
  private configuration: KickConfiguration;
  private credentials: KickCredentialSet | null = null;
  private identity: KickIdentity | null = null;
  private pending: PendingAuthorization | null = null;
  private oauthState: KickIntegrationStatus['oauth']['state'] = 'not-configured';
  private eventState: KickIntegrationStatus['events']['state'] = 'disconnected';
  private subscriptionId?: string;
  private lastError?: string;
  private messagesReceived = 0;
  private messagesSent = 0;
  private lastMessageAt?: string;
  private readonly request: typeof fetch;

  constructor(private readonly options: KickIntegrationOptions) {
    const timestamp = new Date().toISOString();
    this.configuration = { schemaVersion: 1, clientId: '', redirectUri: validateRedirectUri(options.defaultRedirectUri), updatedAt: timestamp };
    this.request = options.fetchImplementation || fetch;
  }

  get configurationPath(): string {
    return path.join(this.options.dataDirectory, 'kick-integration.json');
  }

  async initialize(): Promise<void> {
    await mkdir(this.options.dataDirectory, { recursive: true });
    try {
      const source = JSON.parse(await readFile(this.configurationPath, 'utf8')) as Partial<KickConfiguration>;
      this.configuration = {
        schemaVersion: 1,
        clientId: source.clientId ? validateClientId(source.clientId) : '',
        redirectUri: validateRedirectUri(source.redirectUri || this.options.defaultRedirectUri),
        updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString()
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Could not read Kick integration settings: ${(error as Error).message}`);
      await this.persist();
    }
    if (!this.configuration.clientId) return;
    if (!this.options.credentialStore?.available) {
      this.oauthState = 'authorization-required';
      return;
    }
    this.credentials = await this.options.credentialStore.load();
    this.oauthState = 'authorization-required';
    if (this.credentials?.accessToken) await this.validateAuthorization().catch((error) => {
      this.oauthState = 'error';
      this.lastError = (error as Error).message;
    });
  }

  status(): KickIntegrationStatus {
    return {
      owner: 'tempest-mainframe-studio',
      platform: 'kick',
      configured: Boolean(this.configuration.clientId && this.credentials?.clientSecret),
      clientId: this.configuration.clientId || undefined,
      redirectUri: this.configuration.redirectUri,
      webhookUrl: this.options.webhookUrl || defaultWebhookUrl,
      oauth: {
        state: this.oauthState,
        scopes: this.credentials?.scopes || [...kickChatScopes],
        storage: this.options.credentialStore?.available ? 'operating-system-credential-vault' : 'unavailable',
        account: this.identity ? { ...this.identity } : undefined,
        tokenExpiresAt: this.credentials?.expiresAt
      },
      events: { state: this.eventState, subscriptionId: this.subscriptionId },
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      lastMessageAt: this.lastMessageAt,
      lastError: this.lastError
    };
  }

  async configure(input: unknown): Promise<KickIntegrationStatus> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Kick configuration must be an object.');
    if (!this.options.credentialStore?.available) throw new Error('Secure operating-system credential storage is unavailable.');
    const source = input as { clientId?: unknown; clientSecret?: unknown; redirectUri?: unknown };
    const clientId = validateClientId(source.clientId);
    const redirectUri = validateRedirectUri(source.redirectUri || this.configuration.redirectUri);
    const existing = this.credentials || await this.options.credentialStore.load();
    const clientSecret = source.clientSecret ? validateClientSecret(source.clientSecret) : existing?.clientSecret;
    if (!clientSecret) throw new Error('Enter the Kick client secret the first time this application is configured.');
    const clientChanged = Boolean(this.configuration.clientId && this.configuration.clientId !== clientId);
    this.configuration = { schemaVersion: 1, clientId, redirectUri, updatedAt: new Date().toISOString() };
    this.credentials = { clientSecret, accessToken: clientChanged ? undefined : existing?.accessToken, refreshToken: clientChanged ? undefined : existing?.refreshToken, expiresAt: clientChanged ? undefined : existing?.expiresAt, scopes: clientChanged ? [...kickChatScopes] : existing?.scopes || [...kickChatScopes] };
    await Promise.all([this.persist(), this.options.credentialStore.save(this.credentials)]);
    this.identity = null;
    this.pending = null;
    this.subscriptionId = undefined;
    this.eventState = 'disconnected';
    this.oauthState = 'authorization-required';
    this.lastError = undefined;
    return this.status();
  }

  async startAuthorization(): Promise<{ authorizationUri: string; expiresAt: string; status: KickIntegrationStatus }> {
    const credentials = await this.requireCredentials();
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const expiresAt = Date.now() + 10 * 60_000;
    this.pending = { state, codeVerifier, expiresAt };
    const url = new URL('https://id.kick.com/oauth/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.configuration.clientId);
    if (new URL(this.configuration.redirectUri).hostname === '127.0.0.1') url.searchParams.set('redirect', 'http://localhost');
    url.searchParams.set('redirect_uri', this.configuration.redirectUri);
    url.searchParams.set('scope', kickChatScopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    this.credentials = credentials;
    this.oauthState = 'authorization-pending';
    this.lastError = undefined;
    return { authorizationUri: url.href, expiresAt: new Date(expiresAt).toISOString(), status: this.status() };
  }

  async completeAuthorization(input: { code?: unknown; state?: unknown; error?: unknown }): Promise<KickIntegrationStatus> {
    if (input.error) throw new Error(`Kick authorization was declined: ${String(input.error)}`);
    const pending = this.pending;
    this.pending = null;
    if (!pending || pending.expiresAt < Date.now()) throw new Error('Kick authorization expired. Start it again from Studio.');
    if (String(input.state || '') !== pending.state) throw new Error('Kick authorization state did not match this Studio session.');
    const code = String(input.code || '').trim();
    if (!code || code.length > 2048 || /[\r\n\0]/.test(code)) throw new Error('Kick did not return a valid authorization code.');
    const credentials = await this.requireCredentials();
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code, client_id: this.configuration.clientId,
      client_secret: credentials.clientSecret, redirect_uri: this.configuration.redirectUri,
      code_verifier: pending.codeVerifier
    });
    const response = await this.request('https://id.kick.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number | string; scope?: string | string[]; message?: string; error?: string };
    if (!response.ok || !result.access_token || !result.refresh_token) throw new Error(responseMessage(result, `Kick token exchange failed with ${response.status}.`));
    const scopes = Array.isArray(result.scope) ? result.scope : String(result.scope || '').split(/\s+/).filter(Boolean);
    this.credentials = { clientSecret: credentials.clientSecret, accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: new Date(Date.now() + Math.max(60, Number(result.expires_in) || 3600) * 1000).toISOString(), scopes };
    await this.options.credentialStore!.save(this.credentials);
    return this.validateAuthorization();
  }

  async validateAuthorization(): Promise<KickIntegrationStatus> {
    if (!this.configuration.clientId) throw new Error('Configure the Kick developer application first.');
    let credentials = await this.requireCredentials();
    if (!credentials.accessToken) {
      this.oauthState = 'authorization-required';
      throw new Error('Connect a Kick account first.');
    }
    if (credentials.expiresAt && Date.parse(credentials.expiresAt) <= Date.now() + 60_000) credentials = await this.refreshAuthorization();
    let response = await this.request('https://api.kick.com/public/v1/users', { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    if (response.status === 401 && credentials.refreshToken) {
      credentials = await this.refreshAuthorization();
      response = await this.request('https://api.kick.com/public/v1/users', { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    }
    const result = await response.json().catch(() => ({})) as { data?: Array<{ user_id?: number | string; name?: string; profile_picture?: string }>; message?: string; error?: string };
    const user = result.data?.[0];
    if (!response.ok || !user?.user_id || !user.name) throw new Error(responseMessage(result, `Kick account validation failed with ${response.status}.`));
    const missingScopes = kickChatScopes.filter((scope) => !credentials.scopes.includes(scope));
    if (missingScopes.length) throw new Error(`Kick authorization is missing: ${missingScopes.join(', ')}.`);
    this.identity = { userId: String(user.user_id), username: user.name, profilePicture: user.profile_picture || undefined };
    this.oauthState = 'authorized';
    this.lastError = undefined;
    await this.ensureChatSubscription().catch((error) => {
      this.eventState = 'error';
      this.lastError = (error as Error).message;
    });
    return this.status();
  }

  async disconnect(): Promise<KickIntegrationStatus> {
    const accessToken = this.credentials?.accessToken;
    if (accessToken) {
      const url = new URL('https://id.kick.com/oauth/revoke');
      url.searchParams.set('token', accessToken);
      url.searchParams.set('token_hint_type', 'access_token');
      await this.request(url, { method: 'POST' }).catch(() => undefined);
    }
    this.credentials = null;
    this.identity = null;
    this.pending = null;
    this.subscriptionId = undefined;
    this.oauthState = this.configuration.clientId ? 'authorization-required' : 'not-configured';
    this.eventState = 'disconnected';
    this.lastError = undefined;
    await this.options.credentialStore?.clear();
    return this.status();
  }

  async postMessage(input: unknown): Promise<{ sent: true; messageId?: string }> {
    if (this.oauthState !== 'authorized' || !this.identity) throw new Error('Kick chat output is not connected.');
    const source = input && typeof input === 'object' ? input as { message?: unknown; replyToMessageId?: unknown } : {};
    const message = String(source.message || '').trim();
    if (!message) throw new Error('Kick chat message is required.');
    if ([...message].length > 500 || Buffer.byteLength(message, 'utf8') > 2048) throw new Error('Kick chat messages must be no more than 500 characters and 2048 UTF-8 bytes.');
    const credentials = await this.activeCredentials();
    const response = await this.request('https://api.kick.com/public/v1/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', broadcaster_user_id: Number(this.identity.userId), content: message, ...(source.replyToMessageId ? { reply_to_message_id: String(source.replyToMessageId) } : {}) })
    });
    const result = await response.json().catch(() => ({})) as { data?: { is_sent?: boolean; message_id?: string }; message?: string; error?: string };
    if (!response.ok || result.data?.is_sent === false) throw new Error(responseMessage(result, `Kick chat send failed with ${response.status}.`));
    this.messagesSent += 1;
    return { sent: true, messageId: result.data?.message_id };
  }

  async ingestWebhook(input: unknown, eventId?: string, occurredAt?: string): Promise<{ accepted: true; eventId: string }> {
    if (this.oauthState !== 'authorized' || !this.identity) throw new Error('Kick chat is not authorized on this Studio installation.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Kick chat webhook must be an object.');
    const source = input as Record<string, unknown>;
    const broadcaster = source.broadcaster as Record<string, unknown> | undefined;
    const sender = source.sender as Record<string, unknown> | undefined;
    const identity = sender?.identity as { badges?: Array<{ type?: string }> } | null | undefined;
    const messageId = String(source.message_id || eventId || '').trim();
    const broadcasterId = String(broadcaster?.user_id || '').trim();
    const senderId = String(sender?.user_id || '').trim();
    const text = String(source.content || '').trim();
    if (!messageId || !broadcasterId || !senderId || !text) throw new Error('Kick chat webhook is missing its message, broadcaster, sender, or content.');
    if (broadcasterId !== this.identity.userId) throw new Error('Kick webhook channel does not match the connected account.');
    const badges = Array.isArray(identity?.badges) ? identity.badges : [];
    const badgeTypes = badges.map((badge) => String(badge.type || '').toLowerCase());
    const roles = [
      ...(senderId === broadcasterId ? ['broadcaster'] : []),
      ...(badgeTypes.includes('moderator') ? ['moderator'] : []),
      ...(badgeTypes.includes('subscriber') ? ['subscriber'] : []),
      ...(badgeTypes.includes('vip') ? ['vip'] : [])
    ];
    const suppliedTimestamp = String(source.created_at || occurredAt || '');
    const normalizedTimestamp = Number.isFinite(Date.parse(suppliedTimestamp)) ? new Date(suppliedTimestamp).toISOString() : new Date().toISOString();
    const event: TempestNormalizedKickChatEvent = {
      schemaVersion: 1,
      id: `kick:${messageId}`,
      topic: 'viewer.chat.message',
      occurredAt: normalizedTimestamp,
      source: 'kick',
      channel: { id: broadcasterId, login: String(broadcaster?.channel_slug || broadcaster?.username || ''), displayName: String(broadcaster?.username || '') },
      viewer: { id: senderId, login: String(sender?.channel_slug || sender?.username || ''), displayName: String(sender?.username || ''), roles },
      payload: { messageId, text: text.slice(0, 500), platform: 'kick', botMessage: senderId === this.identity?.userId }
    };
    this.messagesReceived += 1;
    this.lastMessageAt = event.occurredAt;
    await this.options.onChatEvent?.(event);
    return { accepted: true, eventId: event.id };
  }

  private async persist(): Promise<void> {
    await mkdir(this.options.dataDirectory, { recursive: true });
    await writeFile(this.configurationPath, `${JSON.stringify(this.configuration, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  private async requireCredentials(): Promise<KickCredentialSet> {
    if (!this.options.credentialStore?.available) throw new Error('Secure operating-system credential storage is unavailable.');
    if (!this.credentials) this.credentials = await this.options.credentialStore.load();
    if (!this.credentials?.clientSecret) throw new Error('Save the Kick Client ID and client secret first.');
    return this.credentials;
  }

  private async activeCredentials(): Promise<KickCredentialSet & { accessToken: string }> {
    let credentials = await this.requireCredentials();
    if (!credentials.accessToken) throw new Error('Connect a Kick account first.');
    if (credentials.expiresAt && Date.parse(credentials.expiresAt) <= Date.now() + 60_000) credentials = await this.refreshAuthorization();
    if (!credentials.accessToken) throw new Error('Kick access token is unavailable.');
    return credentials as KickCredentialSet & { accessToken: string };
  }

  private async refreshAuthorization(): Promise<KickCredentialSet> {
    const credentials = await this.requireCredentials();
    if (!credentials.refreshToken) {
      this.oauthState = 'expired';
      throw new Error('Kick authorization expired. Connect the account again.');
    }
    this.oauthState = 'refreshing';
    const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: this.configuration.clientId, client_secret: credentials.clientSecret, refresh_token: credentials.refreshToken });
    const response = await this.request('https://id.kick.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number | string; scope?: string | string[]; message?: string; error?: string };
    if (!response.ok || !result.access_token) {
      this.oauthState = 'expired';
      throw new Error(responseMessage(result, `Kick token refresh failed with ${response.status}.`));
    }
    const scopes = Array.isArray(result.scope) ? result.scope : String(result.scope || '').split(/\s+/).filter(Boolean);
    this.credentials = { clientSecret: credentials.clientSecret, accessToken: result.access_token, refreshToken: result.refresh_token || credentials.refreshToken, expiresAt: new Date(Date.now() + Math.max(60, Number(result.expires_in) || 3600) * 1000).toISOString(), scopes: scopes.length ? scopes : credentials.scopes };
    await this.options.credentialStore!.save(this.credentials);
    this.oauthState = 'authorized';
    return this.credentials;
  }

  private async ensureChatSubscription(): Promise<void> {
    if (!this.identity) return;
    this.eventState = 'subscribing';
    const credentials = await this.activeCredentials();
    const headers = { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' };
    const list = await this.request(`https://api.kick.com/public/v1/events/subscriptions?broadcaster_user_id=${encodeURIComponent(this.identity.userId)}`, { headers });
    const listed = await list.json().catch(() => ({})) as { data?: Array<{ id?: string; event?: string; version?: number }>; message?: string; error?: string };
    if (!list.ok) throw new Error(responseMessage(listed, `Kick event subscription lookup failed with ${list.status}.`));
    const existing = listed.data?.find((entry) => entry.event === 'chat.message.sent' && Number(entry.version) === 1);
    if (existing?.id) {
      this.subscriptionId = existing.id;
      this.eventState = 'connected';
      return;
    }
    const response = await this.request('https://api.kick.com/public/v1/events/subscriptions', { method: 'POST', headers, body: JSON.stringify({ method: 'webhook', events: [{ name: 'chat.message.sent', version: 1 }] }) });
    const result = await response.json().catch(() => ({})) as { data?: Array<{ subscription_id?: string; error?: string }>; message?: string; error?: string };
    const subscription = result.data?.[0];
    if (!response.ok || subscription?.error || !subscription?.subscription_id) throw new Error(subscription?.error || responseMessage(result, `Kick chat subscription failed with ${response.status}.`));
    this.subscriptionId = subscription.subscription_id;
    this.eventState = 'connected';
  }
}
