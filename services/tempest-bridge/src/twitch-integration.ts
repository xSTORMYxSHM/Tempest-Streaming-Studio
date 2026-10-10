import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocket } from 'ws';
import {
  normalizedTwitchEventTopics,
  TempestNormalizedTwitchEvent,
  validateNormalizedTwitchEvent
} from '@tempest/contracts';

export const defaultTwitchScopes = [
  'bits:read',
  'channel:read:hype_train',
  'channel:read:goals',
  'channel:read:polls',
  'channel:manage:predictions',
  'channel:read:redemptions',
  'channel:read:subscriptions',
  'clips:edit',
  'moderator:read:followers',
  'user:read:chat'
] as const;

// Twitch Client IDs are public application identifiers. This Public client uses
// Device Code authorization, so no client secret is embedded or accepted.
export const OFFICIAL_TWITCH_CLIENT_ID = 'n04l25zbygbsnq6nj7gupboyeji820';

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

export interface TwitchPredictionOutcome {
  id: string;
  title: string;
  users: number;
  channelPoints: number;
  color?: string;
}

export interface TwitchPrediction {
  id: string;
  title: string;
  status: 'ACTIVE' | 'LOCKED' | 'RESOLVED' | 'CANCELED';
  predictionWindow: number;
  outcomes: TwitchPredictionOutcome[];
  winningOutcomeId?: string;
  createdAt?: string;
  endedAt?: string;
  lockedAt?: string;
}

export interface TwitchIntegrationStatus {
  owner: 'tempest-mainframe-studio';
  configured: boolean;
  clientId?: string;
  clientIdMode: 'official' | 'custom';
  oauth: {
    state: 'not-configured' | 'authorization-required' | 'authorization-pending' | 'authorized' | 'refreshing' | 'expired' | 'error';
    tokenExpiresAt?: string;
    scopes: string[];
    missingScopes?: string[];
    storage: 'operating-system-credential-vault' | 'unavailable';
    account?: { userId: string; login: string };
  };
  connections: {
    eventSub: 'disconnected' | 'connecting' | 'connected' | 'error';
    chat: 'disconnected' | 'connecting' | 'connected' | 'error';
    extensionRelay: 'not-configured' | 'disconnected' | 'connecting' | 'connected' | 'error';
  };
  extensionRelaySync?: {
    state: 'pending' | 'synced';
    companions: { schemaVersion: 1; mainframe: boolean; streaming: boolean };
    edition: 'free' | 'bits';
    revision: string;
    itemCount: number;
    sentAt: string;
    acknowledgedAt?: string;
  };
  normalizedTopics: readonly string[];
  eventSubFeatures: { raidPortal: boolean; hypeTrain: boolean; goals: boolean; channelPointRedemptions: boolean; predictions: boolean };
  predictions: {
    authorized: boolean;
    available: boolean;
    current?: TwitchPrediction;
  };
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
  onEvent?: (event: TempestNormalizedTwitchEvent) => void | Promise<void>;
}

const emptyConfiguration = (): TwitchConfigurationDocument => ({
  schemaVersion: 1,
  clientId: OFFICIAL_TWITCH_CLIENT_ID,
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

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function normalizeTwitchPrediction(value: unknown): TwitchPrediction | undefined {
  const source = object(value);
  if (!source || !source.id || !source.title) return undefined;
  const status = String(source.status || '').toUpperCase();
  if (!['ACTIVE', 'LOCKED', 'RESOLVED', 'CANCELED'].includes(status)) return undefined;
  const outcomes = Array.isArray(source.outcomes) ? source.outcomes.flatMap((entry) => {
    const outcome = object(entry);
    if (!outcome?.id || !outcome.title) return [];
    return [{
      id: String(outcome.id),
      title: String(outcome.title),
      users: Math.max(0, Number(outcome.users) || 0),
      channelPoints: Math.max(0, Number(outcome.channel_points ?? outcome.channelPoints) || 0),
      color: outcome.color ? String(outcome.color) : undefined
    }];
  }) : [];
  return {
    id: String(source.id),
    title: String(source.title),
    status: status as TwitchPrediction['status'],
    predictionWindow: Math.max(0, Number(source.prediction_window ?? source.predictionWindow) || 0),
    outcomes,
    winningOutcomeId: source.winning_outcome_id || source.winningOutcomeId ? String(source.winning_outcome_id || source.winningOutcomeId) : undefined,
    createdAt: source.created_at || source.createdAt ? String(source.created_at || source.createdAt) : undefined,
    endedAt: source.ended_at || source.endedAt ? String(source.ended_at || source.endedAt) : undefined,
    lockedAt: source.locked_at || source.lockedAt ? String(source.locked_at || source.lockedAt) : undefined
  };
}

export function normalizeTwitchEventSubNotification(subscriptionType: string, event: Record<string, unknown>, messageId: string, occurredAt: string): TempestNormalizedTwitchEvent | undefined {
  const channel = {
    id: String(event.broadcaster_user_id || event.to_broadcaster_user_id || ''),
    login: String(event.broadcaster_user_login || event.to_broadcaster_user_login || ''),
    displayName: String(event.broadcaster_user_name || event.to_broadcaster_user_name || '')
  };
  if (subscriptionType === 'channel.raid') {
    return {
      schemaVersion: 1, id: messageId, topic: 'viewer.raid.received', occurredAt, source: 'twitch', channel,
      viewer: { id: String(event.from_broadcaster_user_id || ''), login: String(event.from_broadcaster_user_login || ''), displayName: String(event.from_broadcaster_user_name || '') },
      payload: { fromBroadcasterId: String(event.from_broadcaster_user_id || ''), fromBroadcasterName: String(event.from_broadcaster_user_name || 'A raider'), viewers: Math.max(0, Number(event.viewers) || 0) }
    };
  }
  if (subscriptionType === 'channel.channel_points_custom_reward_redemption.add') {
    const reward = object(event.reward) || {};
    return {
      schemaVersion: 1, id: messageId, topic: 'viewer.reward.redeemed', occurredAt, source: 'twitch', channel,
      viewer: { id: String(event.user_id || ''), login: String(event.user_login || ''), displayName: String(event.user_name || '') },
      payload: {
        redemptionId: String(event.id || messageId), rewardId: String(reward.id || ''), rewardTitle: String(reward.title || 'Channel Point Reward').slice(0, 300),
        rewardCost: Math.max(0, Number(reward.cost) || 0), input: String(event.user_input || '').slice(0, 500)
      }
    };
  }
  if (subscriptionType.startsWith('channel.hype_train.')) {
    const phase = subscriptionType.split('.').at(-1) || 'progress';
    const contributions = Array.isArray(event.top_contributions) ? event.top_contributions.flatMap((entry) => {
      const item = object(entry); if (!item) return [];
      return [{ userId: String(item.user_id || ''), userName: String(item.user_name || ''), type: String(item.type || 'other'), total: Math.max(0, Number(item.total) || 0) }];
    }).slice(0, 10) : [];
    return {
      schemaVersion: 1, id: messageId, topic: 'channel.hype-train.updated', occurredAt, source: 'twitch', channel,
      payload: {
        phase, hypeTrainId: String(event.id || ''), level: Math.max(0, Number(event.level) || 0), total: Math.max(0, Number(event.total) || 0),
        progress: Math.max(0, Number(event.progress) || 0), goal: Math.max(0, Number(event.goal) || 0), topContributions: contributions,
        startedAt: String(event.started_at || ''), expiresAt: String(event.expires_at || ''), endedAt: String(event.ended_at || ''),
        type: String(event.type || 'regular'), isSharedTrain: event.is_shared_train === true
      }
    };
  }
  if (subscriptionType.startsWith('channel.goal.')) {
    const phase = subscriptionType.split('.').at(-1) || 'progress';
    return {
      schemaVersion: 1, id: messageId, topic: 'channel.goal.updated', occurredAt, source: 'twitch', channel,
      payload: {
        phase, goalId: String(event.id || ''), type: String(event.type || 'custom'), description: String(event.description || 'Channel Goal').slice(0, 300),
        currentAmount: Math.max(0, Number(event.current_amount) || 0), targetAmount: Math.max(0, Number(event.target_amount) || 0),
        startedAt: String(event.started_at || ''), endedAt: String(event.ended_at || ''), isAchieved: event.is_achieved === true
      }
    };
  }
  return undefined;
}

export function describeTwitchOAuthError(message: unknown, fallback: string): string {
  const detail = String(message || '').trim();
  if (/missing client secret/i.test(detail)) {
    return 'Twitch rejected Device Code authorization because the selected application expects a client secret. Update Tempest Streaming Studio, or set an Advanced custom Twitch application to Client Type Public, then disconnect and reconnect Twitch.';
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
  private extensionRelaySync?: TwitchIntegrationStatus['extensionRelaySync'];
  private eventSubState: TwitchIntegrationStatus['connections']['eventSub'] = 'disconnected';
  private chatState: TwitchIntegrationStatus['connections']['chat'] = 'disconnected';
  private eventSubSocket: WebSocket | null = null;
  private eventSubReconnectTimer?: NodeJS.Timeout;
  private eventSubSilenceTimer?: NodeJS.Timeout;
  private eventSubStopping = false;
  private inheritedEventSubSockets = new Set<WebSocket>();
  private activeEventSubTypes = new Set<string>();
  private currentPrediction?: TwitchPrediction;
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
      const useOfficialClientId = !validClientId(parsed.clientId);
      const clientId = validClientId(parsed.clientId) ? parsed.clientId : OFFICIAL_TWITCH_CLIENT_ID;
      this.configuration = {
        schemaVersion: 1,
        clientId,
        scopes: Array.isArray(parsed.scopes) && parsed.scopes.every((scope) => typeof scope === 'string') ? [...new Set([...parsed.scopes, ...defaultTwitchScopes])] : [...defaultTwitchScopes],
        rewardMappings: parsed.rewardMappings && typeof parsed.rewardMappings === 'object'
          ? Object.fromEntries(Object.entries(parsed.rewardMappings).filter(([rewardId, action]) => Boolean(rewardId) && validAction(action)))
          : {},
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
      };
      if (useOfficialClientId) await this.persistConfiguration();
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
      clientIdMode: this.configuration.clientId === OFFICIAL_TWITCH_CLIENT_ID ? 'official' : 'custom',
      oauth: {
        state: this.oauthState,
        tokenExpiresAt: this.tokens?.expiresAt,
        scopes: this.tokens?.scopes || this.configuration.scopes,
        missingScopes: this.tokens ? this.configuration.scopes.filter((scope) => !this.tokens?.scopes.includes(scope)) : undefined,
        storage: this.credentialStore?.available ? 'operating-system-credential-vault' : 'unavailable',
        account: this.identity ? { userId: this.identity.userId, login: this.identity.login } : undefined
      },
      connections: { eventSub: this.eventSubState, chat: this.chatState, extensionRelay: this.extensionRelayState },
      normalizedTopics: normalizedTwitchEventTopics,
      eventSubFeatures: {
        raidPortal: this.activeEventSubTypes.has('channel.raid'),
        hypeTrain: this.activeEventSubTypes.has('channel.hype_train.progress'),
        goals: this.activeEventSubTypes.has('channel.goal.progress'),
        channelPointRedemptions: this.activeEventSubTypes.has('channel.channel_points_custom_reward_redemption.add'),
        predictions: this.activeEventSubTypes.has('channel.prediction.begin')
      },
      predictions: {
        authorized: this.tokens?.scopes.includes('channel:manage:predictions') === true,
        available: this.oauthState === 'authorized' && this.tokens?.scopes.includes('channel:manage:predictions') === true,
        current: this.currentPrediction ? { ...this.currentPrediction, outcomes: this.currentPrediction.outcomes.map((outcome) => ({ ...outcome })) } : undefined
      },
      rewardMappings: { ...this.configuration.rewardMappings },
      lastEventAt: this.lastEventAt,
      acceptedEvents: this.acceptedEvents,
      duplicateEvents: this.duplicateEvents,
      lastError: this.lastError,
      extensionRelayError: this.extensionRelayError,
      extensionRelaySync: this.extensionRelaySync ? { ...this.extensionRelaySync } : undefined
    };
  }

  setExtensionRelayState(state: TwitchIntegrationStatus['connections']['extensionRelay'], error?: string): void {
    this.extensionRelayState = state;
    this.extensionRelayError = error;
    if (state === 'not-configured') this.extensionRelaySync = undefined;
  }

  setExtensionRelayStatus(status: { state: TwitchIntegrationStatus['connections']['extensionRelay']; lastError?: string; catalogSync?: TwitchIntegrationStatus['extensionRelaySync'] }): void {
    this.extensionRelayState = status.state;
    this.extensionRelayError = status.lastError;
    this.extensionRelaySync = status.catalogSync ? { ...status.catalogSync } : undefined;
  }

  setChatConnectionState(_eventSub: TwitchIntegrationStatus['connections']['eventSub'], chat: TwitchIntegrationStatus['connections']['chat']): void {
    this.chatState = chat;
  }

  connectionAuthorization(): { clientId: string; channelId: string; channelLogin: string } | null {
    if (this.oauthState !== 'authorized' || !this.identity || !this.configuration.clientId) return null;
    return { clientId: this.configuration.clientId, channelId: this.identity.userId, channelLogin: this.identity.login };
  }

  async configure(input: unknown): Promise<TwitchIntegrationStatus> {
    if (!input || typeof input !== 'object') throw new Error('Twitch configuration must be an object.');
    const source = input as { clientId?: unknown; scopes?: unknown; rewardMappings?: unknown };
    const clientId = source.clientId === undefined || source.clientId === '' ? OFFICIAL_TWITCH_CLIENT_ID : source.clientId;
    if (!validClientId(clientId)) throw new Error('A custom Twitch clientId must contain 8 to 80 letters or numbers.');
    const scopes = source.scopes === undefined ? [...defaultTwitchScopes] : source.scopes;
    if (!Array.isArray(scopes) || !scopes.length || scopes.some((scope) => typeof scope !== 'string' || !/^[a-z]+(?::[a-z_]+)+$/.test(scope))) throw new Error('Twitch scopes must be a non-empty array of scope names.');
    const mappings = source.rewardMappings === undefined ? this.configuration.rewardMappings : source.rewardMappings;
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new Error('rewardMappings must be an object keyed by Twitch reward ID.');
    const rewardMappings = Object.fromEntries(Object.entries(mappings).map(([rewardId, action]) => {
      if (!rewardId.trim() || !validAction(action)) throw new Error(`Reward mapping ${rewardId || '(empty)'} must target a namespaced Tempest action.`);
      return [rewardId.trim(), action];
    }));
    const clientChanged = this.configuration.clientId !== clientId;
    this.configuration = { schemaVersion: 1, clientId, scopes: [...new Set([...scopes, ...defaultTwitchScopes])], rewardMappings, updatedAt: new Date().toISOString() };
    await this.persistConfiguration();
    if (clientChanged) await this.clearAuthorization(true);
    this.setOauthState(this.tokens ? 'authorized' : 'authorization-required');
    return this.status();
  }

  async startDeviceAuthorization(): Promise<{ userCode: string; verificationUri: string; expiresAt: string; intervalSeconds: number }> {
    if (!this.configuration.clientId) throw new Error('Twitch sign-in is not configured.');
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
    await this.ensureEventSubConnection();
    return this.status();
  }

  async disconnect(): Promise<TwitchIntegrationStatus> {
    this.stopEventSub();
    if (this.tokens && this.configuration.clientId) {
      const body = new URLSearchParams({ client_id: this.configuration.clientId, token: this.tokens.accessToken });
      await this.request('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).catch(() => undefined);
    }
    await this.clearAuthorization(true);
    return this.status();
  }

  async refreshPrediction(): Promise<TwitchIntegrationStatus> {
    const authorization = this.predictionAuthorization();
    const response = await this.request(`https://api.twitch.tv/helix/predictions?broadcaster_id=${encodeURIComponent(authorization.userId)}&first=20`, {
      headers: this.helixHeaders(authorization.accessToken)
    });
    const result = await response.json().catch(() => ({})) as { data?: unknown[]; message?: string };
    if (!response.ok) throw new Error(this.describePredictionError(response.status, result.message));
    const predictions = Array.isArray(result.data) ? result.data.map(normalizeTwitchPrediction).filter((prediction): prediction is TwitchPrediction => Boolean(prediction)) : [];
    this.currentPrediction = predictions.find((prediction) => prediction.status === 'ACTIVE' || prediction.status === 'LOCKED') || predictions[0];
    return this.status();
  }

  async createPrediction(input: unknown): Promise<TwitchIntegrationStatus> {
    const authorization = this.predictionAuthorization();
    const source = object(input);
    if (!source) throw new Error('Prediction setup must be an object.');
    const title = String(source.title || '').trim();
    if (!title || title.length > 45) throw new Error('Prediction title must contain 1 to 45 characters.');
    const outcomes = Array.isArray(source.outcomes) ? source.outcomes.map((outcome) => String(outcome || '').trim()).filter(Boolean) : [];
    if (outcomes.length < 2 || outcomes.length > 10) throw new Error('Predictions need 2 to 10 outcomes.');
    if (outcomes.some((outcome) => outcome.length > 25)) throw new Error('Each prediction outcome must contain 1 to 25 characters.');
    if (new Set(outcomes.map((outcome) => outcome.toLocaleLowerCase())).size !== outcomes.length) throw new Error('Prediction outcomes must be unique.');
    const predictionWindow = Number(source.predictionWindow);
    if (!Number.isInteger(predictionWindow) || predictionWindow < 30 || predictionWindow > 1800) throw new Error('Prediction wagering time must be between 30 and 1,800 seconds.');
    const response = await this.request('https://api.twitch.tv/helix/predictions', {
      method: 'POST',
      headers: this.helixHeaders(authorization.accessToken, true),
      body: JSON.stringify({ broadcaster_id: authorization.userId, title, outcomes: outcomes.map((outcome) => ({ title: outcome })), prediction_window: predictionWindow })
    });
    const result = await response.json().catch(() => ({})) as { data?: unknown[]; message?: string };
    if (!response.ok) throw new Error(this.describePredictionError(response.status, result.message));
    const prediction = normalizeTwitchPrediction(result.data?.[0]);
    if (!prediction) throw new Error('Twitch created the prediction but returned an invalid response. Refresh Predictions to recover its state.');
    this.currentPrediction = prediction;
    return this.status();
  }

  async endPrediction(input: unknown): Promise<TwitchIntegrationStatus> {
    const authorization = this.predictionAuthorization();
    const source = object(input);
    const predictionId = String(source?.predictionId || this.currentPrediction?.id || '').trim();
    const status = String(source?.status || '').toUpperCase();
    if (!predictionId) throw new Error('No active Twitch Prediction is available.');
    if (!['LOCKED', 'RESOLVED', 'CANCELED'].includes(status)) throw new Error('Prediction status must be LOCKED, RESOLVED, or CANCELED.');
    const winningOutcomeId = String(source?.winningOutcomeId || '').trim();
    if (status === 'RESOLVED' && !winningOutcomeId) throw new Error('Choose the winning outcome before resolving a prediction.');
    if (status === 'RESOLVED' && this.currentPrediction && !this.currentPrediction.outcomes.some((outcome) => outcome.id === winningOutcomeId)) throw new Error('The selected winner is not an outcome in the current prediction.');
    const body: Record<string, string> = { broadcaster_id: authorization.userId, id: predictionId, status };
    if (status === 'RESOLVED') body.winning_outcome_id = winningOutcomeId;
    const response = await this.request('https://api.twitch.tv/helix/predictions', {
      method: 'PATCH', headers: this.helixHeaders(authorization.accessToken, true), body: JSON.stringify(body)
    });
    const result = await response.json().catch(() => ({})) as { data?: unknown[]; message?: string };
    if (!response.ok) throw new Error(this.describePredictionError(response.status, result.message));
    const prediction = normalizeTwitchPrediction(result.data?.[0]);
    if (prediction) this.currentPrediction = prediction;
    return this.status();
  }

  async createClip(input: unknown): Promise<{ id: string; url: string; editUrl: string; title?: string; duration: number }> {
    if (this.oauthState !== 'authorized' || !this.identity || !this.tokens) throw new Error('Connect the broadcaster Twitch account before creating clips.');
    if (!this.tokens.scopes.includes('clips:edit')) throw new Error('Reconnect Twitch to grant Studio permission to create clips.');
    const source = object(input) || {};
    const title = String(source.title || '').trim();
    if (title.length > 100) throw new Error('Clip titles must be 100 characters or fewer.');
    const duration = source.duration === undefined ? 30 : Number(source.duration);
    if (!Number.isFinite(duration) || duration < 5 || duration > 60) throw new Error('Clip duration must be between 5 and 60 seconds.');
    const query = new URLSearchParams({ broadcaster_id: this.identity.userId, duration: String(Math.round(duration * 10) / 10) });
    if (title) query.set('title', title);
    const response = await this.request(`https://api.twitch.tv/helix/clips?${query}`, {
      method: 'POST', headers: this.helixHeaders(this.tokens.accessToken)
    });
    const result = await response.json().catch(() => ({})) as { data?: Array<{ id?: string; edit_url?: string }>; message?: string };
    if (response.status !== 202 || !result.data?.[0]?.id || !result.data[0].edit_url) {
      if (response.status === 404) throw new Error('The Twitch channel must be live before viewers can create a clip.');
      if (response.status === 403) throw new Error('Twitch clips are disabled or restricted for this channel.');
      if (response.status === 401) throw new Error('Reconnect Twitch to restore clip creation permission.');
      throw new Error(result.message || `Twitch clip creation failed with ${response.status}.`);
    }
    const id = result.data[0].id;
    return { id, url: `https://clips.twitch.tv/${encodeURIComponent(id)}`, editUrl: result.data[0].edit_url, ...(title ? { title } : {}), duration };
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

  close(): void { this.stopEventSub(); }

  private async ensureEventSubConnection(): Promise<void> {
    if (!this.options.onEvent || !this.tokens || !this.identity || !this.configuration.clientId || this.oauthState !== 'authorized' || this.eventSubSocket) return;
    this.eventSubStopping = false;
    this.eventSubState = 'connecting';
    this.openEventSubSocket('wss://eventsub.wss.twitch.tv/ws');
  }

  private openEventSubSocket(url: string, inheritsSubscriptions = false): void {
    const socket = new WebSocket(url);
    if (inheritsSubscriptions) this.inheritedEventSubSockets.add(socket);
    this.eventSubSocket = socket;
    socket.on('message', (data) => void this.handleEventSubMessage(socket, data.toString()).catch((error) => {
      if (this.eventSubSocket !== socket) return;
      this.lastError = `Twitch EventSub: ${(error as Error).message}`;
      this.eventSubState = 'error';
      socket.close(1011, 'EventSub message handling failed');
    }));
    socket.on('error', (error) => {
      if (this.eventSubSocket !== socket) return;
      this.lastError = `Twitch EventSub connection error: ${error.message}`;
      this.eventSubState = 'error';
    });
    socket.on('close', () => {
      this.inheritedEventSubSockets.delete(socket);
      if (this.eventSubSocket !== socket) return;
      this.eventSubSocket = null;
      this.clearEventSubSilenceTimer();
      this.activeEventSubTypes.clear();
      if (this.eventSubStopping) return;
      this.eventSubState = 'disconnected';
      clearTimeout(this.eventSubReconnectTimer);
      this.eventSubReconnectTimer = setTimeout(() => void this.ensureEventSubConnection(), 5000);
      this.eventSubReconnectTimer.unref?.();
    });
  }

  private async handleEventSubMessage(socket: WebSocket, raw: string): Promise<void> {
    if (this.eventSubSocket !== socket) return;
    const message = JSON.parse(raw) as {
      metadata?: { message_id?: string; message_type?: string; message_timestamp?: string; subscription_type?: string };
      payload?: { session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string }; event?: Record<string, unknown> };
    };
    const type = message.metadata?.message_type;
    this.resetEventSubSilenceTimer(Number(message.payload?.session?.keepalive_timeout_seconds) || 30);
    if (type === 'session_welcome') {
      const sessionId = message.payload?.session?.id;
      if (!sessionId) throw new Error('Welcome message did not include a session ID.');
      if (!this.inheritedEventSubSockets.has(socket)) await this.subscribeEventSubFeatures(sessionId);
      this.eventSubState = 'connected';
      return;
    }
    if (type === 'session_reconnect' && message.payload?.session?.reconnect_url) {
      const previous = this.eventSubSocket;
      this.eventSubSocket = null;
      this.openEventSubSocket(message.payload.session.reconnect_url, true);
      previous?.close(1000, 'Twitch requested reconnect');
      return;
    }
    if (type === 'revocation') {
      this.lastError = `Twitch revoked ${message.metadata?.subscription_type || 'an EventSub subscription'}. Reconnect Twitch if authorization changed.`;
      return;
    }
    if (type !== 'notification' || !message.metadata?.subscription_type || !message.payload?.event) return;
    if (message.metadata.subscription_type.startsWith('channel.prediction.')) {
      const prediction = normalizeTwitchPrediction(message.payload.event);
      if (prediction) this.currentPrediction = prediction;
      return;
    }
    const normalized = normalizeTwitchEventSubNotification(
      message.metadata.subscription_type,
      message.payload.event,
      String(message.metadata.message_id || globalThis.crypto.randomUUID()),
      String(message.metadata.message_timestamp || new Date().toISOString())
    );
    if (normalized) await this.options.onEvent?.(normalized);
  }

  private async subscribeEventSubFeatures(sessionId: string): Promise<void> {
    if (!this.tokens || !this.identity) return;
    this.activeEventSubTypes.clear();
    const definitions: Array<{ type: string; version: string; scope?: string; condition: Record<string, string> }> = [
      { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: this.identity.userId } },
      { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', scope: 'channel:read:redemptions', condition: { broadcaster_user_id: this.identity.userId } },
      ...['begin', 'progress', 'end'].map((phase) => ({ type: `channel.hype_train.${phase}`, version: '2', scope: 'channel:read:hype_train', condition: { broadcaster_user_id: this.identity!.userId } })),
      ...['begin', 'progress', 'end'].map((phase) => ({ type: `channel.goal.${phase}`, version: '1', scope: 'channel:read:goals', condition: { broadcaster_user_id: this.identity!.userId } })),
      ...['begin', 'progress', 'lock', 'end'].map((phase) => ({ type: `channel.prediction.${phase}`, version: '1', scope: 'channel:manage:predictions', condition: { broadcaster_user_id: this.identity!.userId } }))
    ];
    const failures: string[] = [];
    for (const definition of definitions) {
      if (definition.scope && !this.tokens.scopes.includes(definition.scope)) { failures.push(`${definition.type} needs ${definition.scope}`); continue; }
      const response = await this.request('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: { 'Client-Id': this.configuration.clientId, Authorization: `Bearer ${this.tokens.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: definition.type, version: definition.version, condition: definition.condition, transport: { method: 'websocket', session_id: sessionId } })
      });
      if (response.status === 202) this.activeEventSubTypes.add(definition.type);
      else {
        const body = await response.json().catch(() => ({})) as { message?: string };
        failures.push(`${definition.type}: ${body.message || response.status}`);
      }
    }
    this.lastError = failures.length ? `Some Twitch experiences are unavailable: ${failures.join('; ')}`.slice(0, 800) : undefined;
  }

  private resetEventSubSilenceTimer(seconds: number): void {
    this.clearEventSubSilenceTimer();
    this.eventSubSilenceTimer = setTimeout(() => {
      this.lastError = 'Twitch EventSub keepalive timed out; reconnecting.';
      this.eventSubSocket?.close(4000, 'Keepalive timed out');
    }, (Math.max(10, seconds) + 10) * 1000);
    this.eventSubSilenceTimer.unref?.();
  }

  private clearEventSubSilenceTimer(): void {
    if (this.eventSubSilenceTimer) clearTimeout(this.eventSubSilenceTimer);
    this.eventSubSilenceTimer = undefined;
  }

  private stopEventSub(): void {
    this.eventSubStopping = true;
    clearTimeout(this.eventSubReconnectTimer);
    this.eventSubReconnectTimer = undefined;
    this.clearEventSubSilenceTimer();
    this.activeEventSubTypes.clear();
    const socket = this.eventSubSocket;
    this.eventSubSocket = null;
    socket?.close(1000, 'Twitch disconnected');
    this.eventSubState = 'disconnected';
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

  private predictionAuthorization(): { userId: string; accessToken: string } {
    if (this.oauthState !== 'authorized' || !this.identity || !this.tokens) throw new Error('Connect the broadcaster Twitch account before managing Predictions.');
    if (!this.tokens.scopes.includes('channel:manage:predictions')) throw new Error('Reconnect Twitch to grant Studio permission to manage Predictions.');
    return { userId: this.identity.userId, accessToken: this.tokens.accessToken };
  }

  private helixHeaders(accessToken: string, json = false): Record<string, string> {
    return {
      'Client-Id': this.configuration.clientId,
      Authorization: `Bearer ${accessToken}`,
      ...(json ? { 'Content-Type': 'application/json' } : {})
    };
  }

  private describePredictionError(status: number, message?: string): string {
    if (status === 403) return 'Twitch Predictions require an eligible Affiliate or Partner channel and the channel:manage:predictions permission.';
    if (status === 401) return 'Twitch authorization expired or is missing Prediction permission. Reconnect Twitch in Studio.';
    return String(message || `Twitch Prediction request failed with ${status}.`);
  }

  private async clearAuthorization(clearError: boolean): Promise<void> {
    this.stopEventSub();
    this.tokens = null;
    this.identity = null;
    this.currentPrediction = undefined;
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
