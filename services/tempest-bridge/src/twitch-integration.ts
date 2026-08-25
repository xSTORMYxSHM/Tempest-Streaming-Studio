import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  normalizedTwitchEventTopics,
  TempestNormalizedTwitchEvent,
  validateNormalizedTwitchEvent
} from '@tempest/contracts';

export const defaultTwitchScopes = [
  'bits:read',
  'channel:read:hype_train',
  'channel:read:polls',
  'channel:read:predictions',
  'channel:read:redemptions',
  'channel:read:subscriptions',
  'moderator:read:followers',
  'user:read:chat'
] as const;

export interface TwitchTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
}

export interface TwitchCredentialStore {
  available: boolean;
  load(): Promise<TwitchTokenSet | null>;
  save(tokens: TwitchTokenSet): Promise<void>;
  clear(): Promise<void>;
}

interface TwitchConfigurationDocument {
  schemaVersion: 1;
  clientId: string;
  scopes: string[];
  rewardMappings: Record<string, string>;
  updatedAt: string;
}

interface TwitchValidatedIdentity {
  userId: string;
  login: string;
  clientId: string;
}

interface PendingDeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalSeconds: number;
  nextPollAt: number;
}

export interface TwitchIntegrationStatus {
  owner: 'tempest-mainframe-studio';
  configured: boolean;
  clientId?: string;
  oauth: {
    state: 'not-configured' | 'authorization-required' | 'authorization-pending' | 'authorized' | 'refreshing' | 'expired' | 'error';
    tokenExpiresAt?: string;
    scopes: string[];
    storage: 'operating-system-credential-vault' | 'unavailable';
    account?: { userId: string; login: string };
  };
  connections: {
    eventSub: 'disconnected' | 'connecting' | 'connected' | 'error';
    chat: 'disconnected' | 'connecting' | 'connected' | 'error';
    extensionRelay: 'not-configured' | 'disconnected' | 'connecting' | 'connected' | 'error';
  };
  normalizedTopics: readonly string[];
  rewardMappings: Record<string, string>;
  lastEventAt?: string;
  acceptedEvents: number;
  duplicateEvents: number;
  lastError?: string;
  extensionRelayError?: string;
}

export interface TwitchIntegrationGatewayOptions {
  dataDirectory: string;
  credentialStore?: TwitchCredentialStore;
  fetchImplementation?: typeof fetch;
}

const emptyConfiguration = (): TwitchConfigurationDocument => ({
  schemaVersion: 1,
  clientId: '',
  scopes: [...defaultTwitchScopes],
  rewardMappings: {},
  updatedAt: new Date().toISOString()
});

function validClientId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{8,80}$/i.test(value);
}

function validAction(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/.test(value);
}

export function describeTwitchOAuthError(message: unknown, fallback: string): string {
  const detail = String(message || '').trim();
  if (/missing client secret/i.test(detail)) {
    return 'Twitch is requiring a client secret for this application. Tempest Streaming Studio uses Device Code Flow on Windows: set the application Client Type to Public in the Twitch Developer Console, save it, then disconnect and reconnect Twitch.';
  }
  return detail || fallback;
}

export class TwitchIntegrationGateway {
  private configuration = emptyConfiguration();
  private tokens: TwitchTokenSet | null = null;
  private identity: TwitchValidatedIdentity | null = null;
  private pendingDevice: PendingDeviceAuthorization | null = null;
  private oauthState: TwitchIntegrationStatus['oauth']['state'] = 'not-configured';
  private lastError?: string;
  private seenEvents = new Map<string, number>();
  private acceptedEvents = 0;
  private duplicateEvents = 0;
  private lastEventAt?: string;
  private extensionRelayState: TwitchIntegrationStatus['connections']['extensionRelay'] = 'not-configured';
  private extensionRelayError?: string;
  private eventSubState: TwitchIntegrationStatus['connections']['eventSub'] = 'disconnected';
  private chatState: TwitchIntegrationStatus['connections']['chat'] = 'disconnected';
  private readonly credentialStore?: TwitchCredentialStore;
  private readonly request: typeof fetch;

  constructor(private readonly options: TwitchIntegrationGatewayOptions) {
    this.credentialStore = options.credentialStore;
    this.request = options.fetchImplementation || fetch;
  }

  get configurationPath(): string {
    return path.join(this.options.dataDirectory, 'twitch-integration.json');
  }

  async initialize(): Promise<void> {
    await mkdir(this.options.dataDirectory, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.configurationPath, 'utf8')) as Partial<TwitchConfigurationDocument>;
      this.configuration = {
        schemaVersion: 1,
        clientId: validClientId(parsed.clientId) ? parsed.clientId : '',
        scopes: Array.isArray(parsed.scopes) && parsed.scopes.every((scope) => typeof scope === 'string') ? [...new Set(parsed.scopes)] : [...defaultTwitchScopes],
        rewardMappings: parsed.rewardMappings && typeof parsed.rewardMappings === 'object'
          ? Object.fromEntries(Object.entries(parsed.rewardMappings).filter(([rewardId, action]) => Boolean(rewardId) && validAction(action)))
          : {},
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Could not read Twitch integration settings: ${(error as Error).message}`);
      await this.persistConfiguration();
    }

    if (!this.configuration.clientId) return this.setOauthState('not-configured');
    if (!this.credentialStore?.available) return this.setOauthState('authorization-required');
    this.tokens = await this.credentialStore.load();
    if (!this.tokens) return this.setOauthState('authorization-required');
    await this.validateAuthorization().catch((error) => {
      this.lastError = (error as Error).message;
      this.setOauthState('error');
    });
  }

  status(): TwitchIntegrationStatus {
    return {
      owner: 'tempest-mainframe-studio',
      configured: Boolean(this.configuration.clientId),
      clientId: this.configuration.clientId || undefined,
      oauth: {
        state: this.oauthState,
        tokenExpiresAt: this.tokens?.expiresAt,
        scopes: this.tokens?.scopes || this.configuration.scopes,
        storage: this.credentialStore?.available ? 'operating-system-credential-vault' : 'unavailable',
        account: this.identity ? { userId: this.identity.userId, login: this.identity.login } : undefined
      },
      connections: { eventSub: this.eventSubState, chat: this.chatState, extensionRelay: this.extensionRelayState },
      normalizedTopics: normalizedTwitchEventTopics,
      rewardMappings: { ...this.configuration.rewardMappings },
      lastEventAt: this.lastEventAt,
      acceptedEvents: this.acceptedEvents,
      duplicateEvents: this.duplicateEvents,
      lastError: this.lastError,
      extensionRelayError: this.extensionRelayError
    };
  }

  setExtensionRelayState(state: TwitchIntegrationStatus['connections']['extensionRelay'], error?: string): void {
    this.extensionRelayState = state;
    this.extensionRelayError = error;
  }

  setChatConnectionState(eventSub: TwitchIntegrationStatus['connections']['eventSub'], chat: TwitchIntegrationStatus['connections']['chat']): void {
    this.eventSubState = eventSub;
    this.chatState = chat;
  }

  connectionAuthorization(): { clientId: string; channelId: string; channelLogin: string } | null {
    if (this.oauthState !== 'authorized' || !this.identity || !this.configuration.clientId) return null;
    return { clientId: this.configuration.clientId, channelId: this.identity.userId, channelLogin: this.identity.login };
  }

  async configure(input: unknown): Promise<TwitchIntegrationStatus> {
    if (!input || typeof input !== 'object') throw new Error('Twitch configuration must be an object.');
    const source = input as { clientId?: unknown; scopes?: unknown; rewardMappings?: unknown };
    if (!validClientId(source.clientId)) throw new Error('Twitch clientId must contain 8 to 80 letters or numbers.');
    const scopes = source.scopes === undefined ? [...defaultTwitchScopes] : source.scopes;
    if (!Array.isArray(scopes) || !scopes.length || scopes.some((scope) => typeof scope !== 'string' || !/^[a-z]+(?::[a-z_]+)+$/.test(scope))) throw new Error('Twitch scopes must be a non-empty array of scope names.');
    const mappings = source.rewardMappings === undefined ? this.configuration.rewardMappings : source.rewardMappings;
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new Error('rewardMappings must be an object keyed by Twitch reward ID.');
    const rewardMappings = Object.fromEntries(Object.entries(mappings).map(([rewardId, action]) => {
      if (!rewardId.trim() || !validAction(action)) throw new Error(`Reward mapping ${rewardId || '(empty)'} must target a namespaced Tempest action.`);
      return [rewardId.trim(), action];
    }));
    const clientChanged = this.configuration.clientId !== source.clientId;
    this.configuration = { schemaVersion: 1, clientId: source.clientId, scopes: [...new Set(scopes)], rewardMappings, updatedAt: new Date().toISOString() };
    await this.persistConfiguration();
    if (clientChanged) await this.clearAuthorization(true);
    this.setOauthState(this.tokens ? 'authorized' : 'authorization-required');
    return this.status();
  }

  async startDeviceAuthorization(): Promise<{ userCode: string; verificationUri: string; expiresAt: string; intervalSeconds: number }> {
    if (!this.configuration.clientId) throw new Error('Configure a Twitch application client ID first.');
    if (!this.credentialStore?.available) throw new Error('Secure operating-system credential storage is unavailable.');
    const body = new URLSearchParams({ client_id: this.configuration.clientId, scopes: this.configuration.scopes.join(' ') });
    const response = await this.request('https://id.twitch.tv/oauth2/device', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json() as { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number; message?: string };
    if (!response.ok || !result.device_code || !result.user_code || !result.verification_uri) throw new Error(describeTwitchOAuthError(result.message, `Twitch device authorization failed with ${response.status}.`));
    const intervalSeconds = Math.max(1, Number(result.interval) || 5);
    this.pendingDevice = {
      deviceCode: result.device_code,
      userCode: result.user_code,
      verificationUri: result.verification_uri,
      expiresAt: Date.now() + Math.max(60, Number(result.expires_in) || 1800) * 1000,
      intervalSeconds,
      nextPollAt: 0
    };
    this.lastError = undefined;
    this.setOauthState('authorization-pending');
    return { userCode: result.user_code, verificationUri: result.verification_uri, expiresAt: new Date(this.pendingDevice.expiresAt).toISOString(), intervalSeconds };
  }

  async pollDeviceAuthorization(): Promise<{ pending: boolean; status: TwitchIntegrationStatus; retryAfterSeconds?: number }> {
    const credentialStore = this.credentialStore;
    if (!credentialStore?.available) throw new Error('Secure operating-system credential storage is unavailable.');
    const pending = this.pendingDevice;
    if (!pending) throw new Error('No Twitch device authorization is pending.');
    if (Date.now() >= pending.expiresAt) {
      this.pendingDevice = null;
      this.setOauthState('expired');
      return { pending: false, status: this.status() };
    }
    if (Date.now() < pending.nextPollAt) return { pending: true, status: this.status(), retryAfterSeconds: Math.ceil((pending.nextPollAt - Date.now()) / 1000) };
    pending.nextPollAt = Date.now() + pending.intervalSeconds * 1000;
    const body = new URLSearchParams({
      client_id: this.configuration.clientId,
      scopes: this.configuration.scopes.join(' '),
      device_code: pending.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });
    const response = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string[]; message?: string };
    if (!response.ok) {
      if (result.message === 'authorization_pending') return { pending: true, status: this.status(), retryAfterSeconds: pending.intervalSeconds };
      this.lastError = describeTwitchOAuthError(result.message, `Twitch token exchange failed with ${response.status}.`);
      this.setOauthState('error');
      throw new Error(this.lastError);
    }
    if (!result.access_token || !result.refresh_token) throw new Error('Twitch token response did not contain an access and refresh token.');
    this.tokens = {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: new Date(Date.now() + Math.max(1, Number(result.expires_in) || 14400) * 1000).toISOString(),
      scopes: Array.isArray(result.scope) ? result.scope : this.configuration.scopes
    };
    await credentialStore.save(this.tokens);
    this.pendingDevice = null;
    await this.validateAuthorization();
    return { pending: false, status: this.status() };
  }

  async validateAuthorization(): Promise<TwitchIntegrationStatus> {
    if (!this.tokens) {
      this.setOauthState(this.configuration.clientId ? 'authorization-required' : 'not-configured');
      return this.status();
    }
    let response = await this.request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens.accessToken}` } });
    if (response.status === 401 && this.tokens.refreshToken) {
      await this.refreshAuthorization();
      response = await this.request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens.accessToken}` } });
    }
    const result = await response.json() as { client_id?: string; login?: string; user_id?: string; scopes?: string[]; expires_in?: number; message?: string };
    if (!response.ok || !result.client_id || !result.login || !result.user_id) {
      this.lastError = describeTwitchOAuthError(result.message, `Twitch token validation failed with ${response.status}.`);
      this.setOauthState('error');
      throw new Error(this.lastError);
    }
    if (result.client_id !== this.configuration.clientId) throw new Error('Stored Twitch token belongs to a different client ID. Reconnect Twitch.');
    this.identity = { clientId: result.client_id, login: result.login, userId: result.user_id };
    this.tokens.scopes = Array.isArray(result.scopes) ? result.scopes : this.tokens.scopes;
    if (Number(result.expires_in) > 0) this.tokens.expiresAt = new Date(Date.now() + Number(result.expires_in) * 1000).toISOString();
    await this.credentialStore?.save(this.tokens);
    this.lastError = undefined;
    this.setOauthState('authorized');
    return this.status();
  }

  async disconnect(): Promise<TwitchIntegrationStatus> {
    if (this.tokens && this.configuration.clientId) {
      const body = new URLSearchParams({ client_id: this.configuration.clientId, token: this.tokens.accessToken });
      await this.request('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).catch(() => undefined);
    }
    await this.clearAuthorization(true);
    return this.status();
  }

  ingest(input: unknown): { event: TempestNormalizedTwitchEvent; duplicate: boolean } {
    const validation = validateNormalizedTwitchEvent(input);
    if (!validation.ok || !validation.value) throw new Error(validation.errors.join(' '));
    const event = validation.value;
    if (event.topic === 'viewer.reward.redeemed' && typeof event.payload.rewardId === 'string' && event.payload.action === undefined) {
      const mappedAction = this.configuration.rewardMappings[event.payload.rewardId];
      if (mappedAction) event.payload.action = mappedAction;
    }
    this.pruneSeenEvents();
    if (this.seenEvents.has(event.id)) {
      this.duplicateEvents += 1;
      return { event, duplicate: true };
    }
    this.seenEvents.set(event.id, Date.now());
    this.acceptedEvents += 1;
    this.lastEventAt = new Date().toISOString();
    return { event, duplicate: false };
  }

  private async refreshAuthorization(): Promise<void> {
    if (!this.tokens?.refreshToken) throw new Error('Twitch refresh token is unavailable.');
    this.setOauthState('refreshing');
    const body = new URLSearchParams({ client_id: this.configuration.clientId, grant_type: 'refresh_token', refresh_token: this.tokens.refreshToken });
    const response = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string[]; message?: string };
    if (!response.ok || !result.access_token || !result.refresh_token) throw new Error(describeTwitchOAuthError(result.message, `Twitch token refresh failed with ${response.status}.`));
    this.tokens = {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: new Date(Date.now() + Math.max(1, Number(result.expires_in) || 14400) * 1000).toISOString(),
      scopes: Array.isArray(result.scope) ? result.scope : this.tokens.scopes
    };
    await this.credentialStore?.save(this.tokens);
  }

  private async clearAuthorization(clearError: boolean): Promise<void> {
    this.tokens = null;
    this.identity = null;
    this.pendingDevice = null;
    await this.credentialStore?.clear();
    if (clearError) this.lastError = undefined;
    this.setOauthState(this.configuration.clientId ? 'authorization-required' : 'not-configured');
  }

  private setOauthState(state: TwitchIntegrationStatus['oauth']['state']): void {
    this.oauthState = state;
  }

  private async persistConfiguration(): Promise<void> {
    this.configuration.updatedAt = new Date().toISOString();
    await writeFile(this.configurationPath, `${JSON.stringify(this.configuration, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  private pruneSeenEvents(): void {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, seenAt] of this.seenEvents) {
      if (seenAt < cutoff) this.seenEvents.delete(id);
    }
    while (this.seenEvents.size > 5000) this.seenEvents.delete(this.seenEvents.keys().next().value as string);
  }
}
