import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type { TempestNormalizedTwitchEvent } from '@tempest/contracts';
import { describeTwitchOAuthError, type TwitchCredentialStore, type TwitchTokenSet } from './twitch-integration';

export const chatbotRequiredScopes = ['user:read:chat', 'user:write:chat'] as const;
export const chatbotScopes = [...chatbotRequiredScopes, 'moderator:manage:shoutouts', 'moderator:manage:chat_messages', 'moderator:manage:banned_users'] as const;
export const chatbotPermissions = ['everyone', 'subscriber', 'moderator', 'broadcaster'] as const;
export type ChatbotPermission = typeof chatbotPermissions[number];
export const chatbotResponseHandlers = ['command-directory', 'stream-uptime', 'channel-title', 'channel-game', 'stream-schedule', 'local-weather', 'seattle-weather', 'radio-now-playing'] as const;
export type ChatbotResponseHandler = typeof chatbotResponseHandlers[number];

export interface ChatbotCommand {
  id: string;
  name: string;
  aliases: string[];
  enabled: boolean;
  replyToViewer: boolean;
  allowSharedChat: boolean;
  permission: ChatbotPermission;
  response: string;
  handler?: ChatbotResponseHandler;
  workflowId?: string;
  viewerCooldownMs: number;
  globalCooldownMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatbotActivity {
  id: string;
  timestamp: string;
  command?: string;
  viewerName?: string;
  sourceChannelLogin?: string;
  sharedChat?: boolean;
  state: 'accepted' | 'blocked' | 'ignored' | 'error';
  message: string;
}

export interface ChatbotWeatherProvider {
  provider: 'nws';
  locationName: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

export interface ChatbotNowPlayingProvider {
  provider: 'azuracast';
  stationName: string;
  apiUrl: string;
  publicPlayerUrl: string;
  streamUrl?: string;
}

export interface ChatbotRaidAutomationConfiguration {
  welcomeEnabled: boolean;
  welcomeMessage: string;
  shoutoutEnabled: boolean;
}

export interface ChatbotFirstChatShoutoutConfiguration {
  enabled: boolean;
  channels: string[];
}

export interface ChatbotInteractionAccessConfiguration {
  mode: 'everyone' | 'assigned-creators';
  allowBroadcasterAndModerators: boolean;
}

export interface ChatbotAutoModConfiguration {
  enabled: boolean;
  linkProtectionEnabled: boolean;
  allowedDomains: string[];
  blockedTermsEnabled: boolean;
  blockedTerms: string[];
  capsProtectionEnabled: boolean;
  capsMinimumLetters: number;
  capsPercentage: number;
  repetitionProtectionEnabled: boolean;
  repetitionLimit: number;
  exemptRoles: Array<'broadcaster' | 'moderator' | 'vip'>;
  action: 'delete' | 'timeout';
  timeoutSeconds: number;
  postNotice: boolean;
  noticeMessage: string;
}

interface ChatbotConfiguration {
  schemaVersion: 6;
  displayName: string;
  prefix: string;
  commands: ChatbotCommand[];
  raidAutomation: ChatbotRaidAutomationConfiguration;
  firstChatShoutouts: ChatbotFirstChatShoutoutConfiguration;
  interactionAccess: ChatbotInteractionAccessConfiguration;
  assignedCreatorIds: Record<string, string>;
  autoMod: ChatbotAutoModConfiguration;
  weatherProvider?: ChatbotWeatherProvider;
  nowPlayingProvider?: ChatbotNowPlayingProvider;
  updatedAt: string;
}

interface ValidatedIdentity {
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

export interface ChatbotChannelAuthorization {
  clientId: string;
  channelId: string;
  channelLogin: string;
}

export interface ChatbotStatus {
  owner: 'tempest-mainframe-studio';
  botName: string;
  configuredName?: string;
  prefix: string;
  oauth: {
    state: 'not-configured' | 'authorization-required' | 'authorization-pending' | 'authorized' | 'refreshing' | 'expired' | 'error';
    scopes: string[];
    storage: 'operating-system-credential-vault' | 'unavailable';
    account?: { userId: string; login: string };
    tokenExpiresAt?: string;
  };
  connections: {
    eventSub: 'disconnected' | 'connecting' | 'connected' | 'error';
    chat: 'disconnected' | 'connecting' | 'connected' | 'error';
  };
  channel?: { userId: string; login: string };
  commands: ChatbotCommand[];
  activity: ChatbotActivity[];
  messagesReceived: number;
  commandsTriggered: number;
  lastMessageAt?: string;
  lastError?: string;
  raidAutomation: ChatbotRaidAutomationConfiguration & {
    shoutoutAuthorized: boolean;
    moderatorRequired: true;
    queuedShoutouts: number;
  };
  firstChatShoutouts: ChatbotFirstChatShoutoutConfiguration & {
    handledSessions: number;
  };
  interactionAccess: ChatbotInteractionAccessConfiguration & {
    assignedCreators: number;
    resolvedCreators: number;
  };
  autoMod: ChatbotAutoModConfiguration & {
    deleteAuthorized: boolean;
    timeoutAuthorized: boolean;
    moderatorRequired: true;
    actionsTaken: number;
  };
  providers: {
    weather?: ChatbotWeatherProvider;
    nowPlaying?: ChatbotNowPlayingProvider;
    availableHandlers: ChatbotResponseHandler[];
  };
}

export interface NowPlayingProviderStatus {
  id: 'now-playing-provider';
  name: string;
  provider: 'AzuraCast';
  state: 'online' | 'offline' | 'unavailable';
  online: boolean;
  publicPlayerUrl: string;
  streamUrl: string;
  checkedAt: string;
  nowPlaying?: { artist?: string; title?: string; text?: string; album?: string };
}

export interface ChatbotDispatch {
  command: ChatbotCommand;
  event: TempestNormalizedTwitchEvent;
  arguments: string[];
  simulated: boolean;
}

export interface ChatbotInteractionAccessDecision {
  allowed: boolean;
  code: 'allowed' | 'identity-required' | 'not-assigned' | 'verification-unavailable';
  reason?: string;
}

export interface TwitchChatbotOptions {
  dataDirectory: string;
  credentialStore?: TwitchCredentialStore;
  fetchImplementation?: typeof fetch;
  onEvent?: (event: TempestNormalizedTwitchEvent) => void | Promise<void>;
  onCommand?: (dispatch: ChatbotDispatch) => void | Promise<void>;
  onConnectionState?: (eventSub: ChatbotStatus['connections']['eventSub'], chat: ChatbotStatus['connections']['chat']) => void;
}

const commandNamePattern = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const legacyStormHorizonProvider: ChatbotNowPlayingProvider = { provider: 'azuracast', stationName: 'Storm Horizon Radio', apiUrl: 'https://a12.asurahosting.com/api/nowplaying/storm_horizon_radio', publicPlayerUrl: 'https://a12.asurahosting.com/public/storm_horizon_radio', streamUrl: 'https://a12.asurahosting.com/listen/storm_horizon_radio/radio.mp3' };
const legacySeattleProvider: ChatbotWeatherProvider = { provider: 'nws', locationName: 'Seattle', latitude: 47.6062, longitude: -122.3321, timeZone: 'America/Los_Angeles' };
const defaultRaidWelcomeMessage = 'Welcome {raider} and your {viewers} raiders! Thank you for sharing your community with us!';
const defaultAutoModNotice = '@{user}, that message was removed by channel AutoMod ({reason}).';

function normalizeDomain(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].replace(/\.+$/, '');
  if (!raw) return '';
  if (raw.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(raw)) throw new Error(`${raw} is not a valid allowed domain.`);
  return raw;
}

function validateAutoMod(value: unknown, fallback: ChatbotAutoModConfiguration = {
  enabled: false,
  linkProtectionEnabled: true,
  allowedDomains: [],
  blockedTermsEnabled: false,
  blockedTerms: [],
  capsProtectionEnabled: false,
  capsMinimumLetters: 12,
  capsPercentage: 75,
  repetitionProtectionEnabled: true,
  repetitionLimit: 8,
  exemptRoles: ['broadcaster', 'moderator', 'vip'],
  action: 'delete',
  timeoutSeconds: 60,
  postNotice: true,
  noticeMessage: defaultAutoModNotice
}): ChatbotAutoModConfiguration {
  if (value === undefined) return { ...fallback, allowedDomains: [...fallback.allowedDomains], blockedTerms: [...fallback.blockedTerms], exemptRoles: [...fallback.exemptRoles] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AutoMod settings are invalid.');
  const source = value as Partial<ChatbotAutoModConfiguration>;
  const rawDomains = Array.isArray(source.allowedDomains) ? source.allowedDomains : typeof source.allowedDomains === 'string' ? String(source.allowedDomains).split(/[\s,]+/) : fallback.allowedDomains;
  const allowedDomains = [...new Set(rawDomains.map(normalizeDomain).filter(Boolean))];
  if (allowedDomains.length > 100) throw new Error('AutoMod supports up to 100 allowed domains.');
  const rawTerms = Array.isArray(source.blockedTerms) ? source.blockedTerms : typeof source.blockedTerms === 'string' ? String(source.blockedTerms).split(/\r?\n/) : fallback.blockedTerms;
  const blockedTerms = [...new Set(rawTerms.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))];
  if (blockedTerms.length > 200 || blockedTerms.some((term) => term.length > 100)) throw new Error('AutoMod supports up to 200 blocked terms of 100 characters each.');
  const capsMinimumLetters = Number(source.capsMinimumLetters ?? fallback.capsMinimumLetters);
  const capsPercentage = Number(source.capsPercentage ?? fallback.capsPercentage);
  const repetitionLimit = Number(source.repetitionLimit ?? fallback.repetitionLimit);
  const timeoutSeconds = Number(source.timeoutSeconds ?? fallback.timeoutSeconds);
  if (!Number.isInteger(capsMinimumLetters) || capsMinimumLetters < 5 || capsMinimumLetters > 100) throw new Error('Caps protection minimum letters must be between 5 and 100.');
  if (!Number.isInteger(capsPercentage) || capsPercentage < 50 || capsPercentage > 100) throw new Error('Caps percentage must be between 50 and 100.');
  if (!Number.isInteger(repetitionLimit) || repetitionLimit < 4 || repetitionLimit > 30) throw new Error('Repeated-character limit must be between 4 and 30.');
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 1_209_600) throw new Error('AutoMod timeout must be between 1 second and 14 days.');
  const action = source.action === 'timeout' ? 'timeout' : source.action === 'delete' ? 'delete' : fallback.action;
  const exemptRoles = [...new Set((Array.isArray(source.exemptRoles) ? source.exemptRoles : fallback.exemptRoles).filter((role): role is 'broadcaster' | 'moderator' | 'vip' => role === 'broadcaster' || role === 'moderator' || role === 'vip'))];
  const noticeMessage = String(source.noticeMessage ?? fallback.noticeMessage).trim();
  if (!noticeMessage || noticeMessage.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(noticeMessage)) throw new Error('AutoMod notice must contain 1 to 500 safe characters.');
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled,
    linkProtectionEnabled: typeof source.linkProtectionEnabled === 'boolean' ? source.linkProtectionEnabled : fallback.linkProtectionEnabled,
    allowedDomains,
    blockedTermsEnabled: typeof source.blockedTermsEnabled === 'boolean' ? source.blockedTermsEnabled : fallback.blockedTermsEnabled,
    blockedTerms,
    capsProtectionEnabled: typeof source.capsProtectionEnabled === 'boolean' ? source.capsProtectionEnabled : fallback.capsProtectionEnabled,
    capsMinimumLetters,
    capsPercentage,
    repetitionProtectionEnabled: typeof source.repetitionProtectionEnabled === 'boolean' ? source.repetitionProtectionEnabled : fallback.repetitionProtectionEnabled,
    repetitionLimit,
    exemptRoles,
    action,
    timeoutSeconds,
    postNotice: typeof source.postNotice === 'boolean' ? source.postNotice : fallback.postNotice,
    noticeMessage
  };
}

function validateRaidAutomation(value: unknown, fallback: ChatbotRaidAutomationConfiguration = { welcomeEnabled: true, welcomeMessage: defaultRaidWelcomeMessage, shoutoutEnabled: true }): ChatbotRaidAutomationConfiguration {
  if (value === undefined) return { ...fallback };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Raid automation settings are invalid.');
  const source = value as Partial<ChatbotRaidAutomationConfiguration>;
  const welcomeMessage = String(source.welcomeMessage ?? fallback.welcomeMessage).trim();
  if (!welcomeMessage || welcomeMessage.length > 500) throw new Error('Raid welcome message must contain 1 to 500 characters.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(welcomeMessage)) throw new Error('Raid welcome message cannot contain control characters.');
  return {
    welcomeEnabled: typeof source.welcomeEnabled === 'boolean' ? source.welcomeEnabled : fallback.welcomeEnabled,
    welcomeMessage,
    shoutoutEnabled: typeof source.shoutoutEnabled === 'boolean' ? source.shoutoutEnabled : fallback.shoutoutEnabled
  };
}

function validateFirstChatShoutouts(value: unknown, fallback: ChatbotFirstChatShoutoutConfiguration = { enabled: false, channels: [] }): ChatbotFirstChatShoutoutConfiguration {
  if (value === undefined) return { enabled: fallback.enabled, channels: [...fallback.channels] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('First Chat Shoutout settings are invalid.');
  const source = value as { enabled?: unknown; channels?: unknown };
  const rawChannels = Array.isArray(source.channels) ? source.channels : typeof source.channels === 'string' ? source.channels.split(/[\s,]+/) : fallback.channels;
  const channels = [...new Set(rawChannels.map((entry) => String(entry || '').trim().replace(/^@+/, '').toLowerCase()).filter(Boolean))];
  if (channels.length > 50) throw new Error('First Chat Shoutouts support up to 50 assigned Twitch channels.');
  const invalid = channels.find((channel) => !/^[a-z0-9_]{1,25}$/.test(channel));
  if (invalid) throw new Error(`@${invalid} is not a valid Twitch channel login.`);
  return { enabled: typeof source.enabled === 'boolean' ? source.enabled : fallback.enabled, channels };
}

function validateInteractionAccess(value: unknown, fallback: ChatbotInteractionAccessConfiguration = { mode: 'everyone', allowBroadcasterAndModerators: true }): ChatbotInteractionAccessConfiguration {
  if (value === undefined) return { ...fallback };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Interaction access settings are invalid.');
  const source = value as Partial<ChatbotInteractionAccessConfiguration>;
  const mode = source.mode === 'assigned-creators' ? 'assigned-creators' : source.mode === 'everyone' ? 'everyone' : fallback.mode;
  return {
    mode,
    allowBroadcasterAndModerators: typeof source.allowBroadcasterAndModerators === 'boolean' ? source.allowBroadcasterAndModerators : fallback.allowBroadcasterAndModerators
  };
}

function defaultConfiguration(): ChatbotConfiguration {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 6,
    displayName: '',
    prefix: '!',
    raidAutomation: validateRaidAutomation(undefined),
    firstChatShoutouts: validateFirstChatShoutouts(undefined),
    interactionAccess: validateInteractionAccess(undefined),
    assignedCreatorIds: {},
    autoMod: validateAutoMod(undefined),
    commands: [{
      id: 'studio',
      name: 'studio',
      aliases: ['tempest'],
      enabled: true,
      replyToViewer: false,
      allowSharedChat: true,
      permission: 'everyone',
      response: 'Studio chatbot online, {user}.',
      viewerCooldownMs: 15_000,
      globalCooldownMs: 3_000,
      createdAt: timestamp,
      updatedAt: timestamp
    }, {
      id: 'commands',
      name: 'commands',
      aliases: ['help'],
      enabled: true,
      replyToViewer: false,
      allowSharedChat: true,
      permission: 'everyone',
      response: '',
      handler: 'command-directory',
      viewerCooldownMs: 15_000,
      globalCooldownMs: 5_000,
      createdAt: timestamp,
      updatedAt: timestamp
    }, {
      id: 'uptime',
      name: 'uptime',
      aliases: ['live'],
      enabled: true,
      replyToViewer: false,
      allowSharedChat: true,
      permission: 'everyone',
      response: '',
      handler: 'stream-uptime',
      viewerCooldownMs: 15_000,
      globalCooldownMs: 10_000,
      createdAt: timestamp,
      updatedAt: timestamp
    }, {
      id: 'title',
      name: 'title',
      aliases: [],
      enabled: true,
      replyToViewer: false,
      allowSharedChat: true,
      permission: 'everyone',
      response: '',
      handler: 'channel-title',
      viewerCooldownMs: 15_000,
      globalCooldownMs: 10_000,
      createdAt: timestamp,
      updatedAt: timestamp
    }, {
      id: 'game',
      name: 'game',
      aliases: ['category'],
      enabled: true,
      replyToViewer: false,
      allowSharedChat: true,
      permission: 'everyone',
      response: '',
      handler: 'channel-game',
      viewerCooldownMs: 15_000,
      globalCooldownMs: 10_000,
      createdAt: timestamp,
      updatedAt: timestamp
    }, {
      id: 'schedule',
      name: 'schedule',
      aliases: ['nextstream'],
      enabled: true,
      replyToViewer: false,
      allowSharedChat: true,
      permission: 'everyone',
      response: '',
      handler: 'stream-schedule',
      viewerCooldownMs: 30_000,
      globalCooldownMs: 15_000,
      createdAt: timestamp,
      updatedAt: timestamp
    }, {
      id: 'lurk',
      name: 'lurk',
      aliases: [],
      enabled: true,
      replyToViewer: false,
      allowSharedChat: true,
      permission: 'everyone',
      response: '{user} has entered low-power observation mode. Thanks for lurking!',
      viewerCooldownMs: 60_000,
      globalCooldownMs: 3_000,
      createdAt: timestamp,
      updatedAt: timestamp
    }, {
      id: 'unlurk',
      name: 'unlurk',
      aliases: ['back'],
      enabled: true,
      replyToViewer: false,
      allowSharedChat: true,
      permission: 'everyone',
      response: '{user} is back. Welcome to the stream!',
      viewerCooldownMs: 60_000,
      globalCooldownMs: 3_000,
      createdAt: timestamp,
      updatedAt: timestamp
    }],
    updatedAt: timestamp
  };
}

function httpsUrl(value: unknown, field: string, optional = false): string | undefined {
  const text = String(value || '').trim();
  if (!text && optional) return undefined;
  let url: URL;
  try { url = new URL(text); } catch { throw new Error(`${field} must be a valid HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password || text.length > 500) throw new Error(`${field} must be a public HTTPS URL without embedded credentials.`);
  return url.href;
}

function validateWeatherProvider(value: unknown): ChatbotWeatherProvider | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Weather provider settings are invalid.');
  const source = value as Record<string, unknown>;
  const locationName = String(source.locationName || '').trim();
  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);
  const timeZone = String(source.timeZone || '').trim();
  if (!locationName || locationName.length > 80) throw new Error('Weather location name must contain 1 to 80 characters.');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Weather coordinates are invalid.');
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(); } catch { throw new Error('Weather time zone must be a valid IANA time zone such as America/Los_Angeles.'); }
  return { provider: 'nws', locationName, latitude, longitude, timeZone };
}

function validateNowPlayingProvider(value: unknown): ChatbotNowPlayingProvider | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Now Playing provider settings are invalid.');
  const source = value as Record<string, unknown>;
  const stationName = String(source.stationName || '').trim();
  if (!stationName || stationName.length > 100) throw new Error('Station name must contain 1 to 100 characters.');
  return { provider: 'azuracast', stationName, apiUrl: httpsUrl(source.apiUrl, 'AzuraCast Now Playing API URL')!, publicPlayerUrl: httpsUrl(source.publicPlayerUrl, 'Station public player URL')!, streamUrl: httpsUrl(source.streamUrl, 'Station stream URL', true) };
}

function copyCommand(command: ChatbotCommand): ChatbotCommand {
  return { ...command, aliases: [...command.aliases] };
}

function normalizeName(value: unknown, field = 'Command name'): string {
  const name = String(value || '').trim().replace(/^!+/, '').toLowerCase();
  if (!commandNamePattern.test(name)) throw new Error(`${field} must contain 1 to 32 lowercase letters, numbers, underscores, or hyphens.`);
  return name;
}

function normalizeDuration(value: unknown, field: string): number {
  const duration = Number(value ?? 0);
  if (!Number.isFinite(duration) || duration < 0 || duration > 86_400_000) throw new Error(`${field} must be between 0 and 86400000 milliseconds.`);
  return Math.round(duration);
}

function normalizeDisplayName(value: unknown): string {
  const displayName = String(value || '').trim();
  if (displayName.length > 40) throw new Error('Chatbot display name must be 40 characters or fewer.');
  if (/[\u0000-\u001f\u007f]/.test(displayName)) throw new Error('Chatbot display name cannot contain control characters.');
  return displayName;
}

function validateCommand(input: unknown, existing?: ChatbotCommand): ChatbotCommand {
  if (!input || typeof input !== 'object') throw new Error('Chatbot command must be an object.');
  const source = input as Partial<ChatbotCommand>;
  const name = normalizeName(source.name);
  const aliases = Array.isArray(source.aliases)
    ? [...new Set(source.aliases.map((alias) => normalizeName(alias, 'Command alias')).filter((alias) => alias !== name))]
    : [];
  if (aliases.length > 12) throw new Error('A command may have at most 12 aliases.');
  const permission = source.permission || 'everyone';
  if (!chatbotPermissions.includes(permission as ChatbotPermission)) throw new Error('Command permission is invalid.');
  const response = String(source.response || '').trim();
  if (response.length > 500) throw new Error('Chat response must be 500 characters or fewer.');
  const workflowId = String(source.workflowId || '').trim() || undefined;
  const rawHandler = (source as { handler?: unknown }).handler;
  const handler = rawHandler === undefined || rawHandler === '' ? undefined : String(rawHandler);
  if (handler && !chatbotResponseHandlers.includes(handler as ChatbotResponseHandler)) throw new Error('Chatbot response handler is invalid.');
  if (workflowId && !/^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i.test(workflowId)) throw new Error('Workflow ID must be a namespaced identifier.');
  if (!response && !workflowId && !handler) throw new Error('A command needs a chat response, a built-in response, a workflow, or a combination.');
  const timestamp = new Date().toISOString();
  return {
    id: existing?.id || randomUUID(),
    name,
    aliases,
    enabled: source.enabled !== false,
    replyToViewer: source.replyToViewer === true,
    allowSharedChat: typeof source.allowSharedChat === 'boolean' ? source.allowSharedChat : permission === 'everyone' && !workflowId,
    permission: permission as ChatbotPermission,
    response,
    handler: handler as ChatbotResponseHandler | undefined,
    workflowId,
    viewerCooldownMs: normalizeDuration(source.viewerCooldownMs, 'Viewer cooldown'),
    globalCooldownMs: normalizeDuration(source.globalCooldownMs, 'Global cooldown'),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp
  };
}

function rolesPermit(required: ChatbotPermission, roles: string[]): boolean {
  if (required === 'everyone') return true;
  const roleSet = new Set(roles);
  if (roleSet.has('broadcaster')) return true;
  if (required === 'broadcaster') return false;
  if (roleSet.has('moderator')) return true;
  if (required === 'moderator') return false;
  return roleSet.has('subscriber');
}

export class TwitchChatbot {
  private configuration = defaultConfiguration();
  private clientId = '';
  private tokens: TwitchTokenSet | null = null;
  private identity: ValidatedIdentity | null = null;
  private channel: ChatbotChannelAuthorization | null = null;
  private pendingDevice: PendingDeviceAuthorization | null = null;
  private oauthState: ChatbotStatus['oauth']['state'] = 'not-configured';
  private eventSubState: ChatbotStatus['connections']['eventSub'] = 'disconnected';
  private chatState: ChatbotStatus['connections']['chat'] = 'disconnected';
  private lastError?: string;
  private socket: WebSocket | null = null;
  private inheritedSubscriptionSockets = new WeakSet<WebSocket>();
  private reconnectTimer?: NodeJS.Timeout;
  private silenceTimer?: NodeJS.Timeout;
  private stopping = false;
  private activity: ChatbotActivity[] = [];
  private messagesReceived = 0;
  private commandsTriggered = 0;
  private lastMessageAt?: string;
  private lastGlobalUse = new Map<string, number>();
  private lastViewerUse = new Map<string, number>();
  private seenEventIds = new Map<string, number>();
  private raidShoutoutQueue: Array<{ eventId: string; targetId: string; targetName: string }> = [];
  private raidShoutoutTimer?: NodeJS.Timeout;
  private raidShoutoutSending = false;
  private lastShoutoutAt = 0;
  private lastShoutoutByTarget = new Map<string, number>();
  private firstChatShoutoutSessions = new Map<string, string>();
  private firstChatShoutoutAttempts = new Set<string>();
  private autoModActionsTaken = 0;
  private channelInfoCache?: { fetchedAt: number; title: string; gameName: string };
  private streamCache?: { fetchedAt: number; startedAt?: string; viewerCount?: number };
  private scheduleCache?: { fetchedAt: number; title?: string; startTime?: string };
  private weatherCache?: { fetchedAt: number; temperature: number; temperatureUnit: string; shortForecast: string; windSpeed?: string; windDirection?: string; humidity?: number; precipitation?: number };
  private radioNowPlayingCache?: { fetchedAt: number; online: boolean; stationName: string; artist?: string; title?: string; text?: string; album?: string };
  private weatherForecastUrl?: string;
  private readonly request: typeof fetch;

  constructor(private readonly options: TwitchChatbotOptions) {
    this.request = options.fetchImplementation || fetch;
  }

  get configurationPath(): string {
    return path.join(this.options.dataDirectory, 'chatbot.json');
  }

  get firstChatShoutoutStatePath(): string {
    return path.join(this.options.dataDirectory, 'chatbot-first-chat-shoutouts.json');
  }

  async initialize(clientId = ''): Promise<void> {
    await mkdir(this.options.dataDirectory, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.configurationPath, 'utf8')) as Partial<ChatbotConfiguration> & { schemaVersion?: number };
      const displayName = normalizeDisplayName(parsed.displayName);
      const prefix = typeof parsed.prefix === 'string' && parsed.prefix.length === 1 && !/\s/.test(parsed.prefix) ? parsed.prefix : '!';
      const commands: ChatbotCommand[] = [];
      for (const entry of Array.isArray(parsed.commands) ? parsed.commands : []) {
        try {
          const command = validateCommand(entry, entry);
          commands.push(command.handler === 'seattle-weather' ? { ...command, handler: 'local-weather' } : command);
        } catch { /* discard invalid persisted command */ }
      }
      let installedDefaults = false;
      for (const defaultCommand of defaultConfiguration().commands) {
        const defaultNames = [defaultCommand.name, ...defaultCommand.aliases];
        const alreadyInstalled = commands.some((command) => [command.name, ...command.aliases].some((name) => defaultNames.includes(name)));
        if (!alreadyInstalled) {
          commands.push(copyCommand(defaultCommand));
          installedDefaults = true;
        }
      }
      const legacyConfiguration = parsed.schemaVersion !== 6;
      const legacyProviderConfiguration = !parsed.schemaVersion || parsed.schemaVersion < 2;
      const weatherProvider = validateWeatherProvider(parsed.weatherProvider ?? (legacyProviderConfiguration && commands.some((command) => command.handler === 'local-weather') ? legacySeattleProvider : undefined));
      const nowPlayingProvider = validateNowPlayingProvider(parsed.nowPlayingProvider ?? (legacyProviderConfiguration && commands.some((command) => command.handler === 'radio-now-playing') ? legacyStormHorizonProvider : undefined));
      const raidAutomation = validateRaidAutomation(parsed.raidAutomation);
      const firstChatShoutouts = validateFirstChatShoutouts(parsed.firstChatShoutouts);
      const interactionAccess = validateInteractionAccess(parsed.interactionAccess);
      const assignedCreatorIds = Object.fromEntries(Object.entries(parsed.assignedCreatorIds || {})
        .filter(([login, userId]) => firstChatShoutouts.channels.includes(login) && /^\d{1,30}$/.test(String(userId)))
        .map(([login, userId]) => [login, String(userId)]));
      const autoMod = validateAutoMod(parsed.autoMod);
      this.configuration = { schemaVersion: 6, displayName, prefix, commands, raidAutomation, firstChatShoutouts, interactionAccess, assignedCreatorIds, autoMod, weatherProvider, nowPlayingProvider, updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString() };
      if (installedDefaults || legacyConfiguration) await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Could not read Chatbot settings: ${(error as Error).message}`);
      await this.persist();
    }
    try {
      const parsed = JSON.parse(await readFile(this.firstChatShoutoutStatePath, 'utf8')) as { sessions?: unknown };
      if (parsed.sessions && typeof parsed.sessions === 'object' && !Array.isArray(parsed.sessions)) {
        for (const [login, session] of Object.entries(parsed.sessions as Record<string, unknown>)) {
          if (/^[a-z0-9_]{1,25}$/.test(login) && typeof session === 'string' && session) this.firstChatShoutoutSessions.set(login, session);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Could not read First Chat Shoutout state: ${(error as Error).message}`);
    }
    await this.setClientId(clientId);
  }

  async setClientId(clientId: string): Promise<void> {
    const changed = this.clientId !== clientId;
    this.clientId = clientId;
    if (changed) await this.stopConnection();
    if (!clientId) {
      this.oauthState = 'not-configured';
      return;
    }
    if (!this.options.credentialStore?.available) {
      this.oauthState = 'authorization-required';
      return;
    }
    if (!this.tokens) this.tokens = await this.options.credentialStore.load();
    if (!this.tokens) {
      this.oauthState = 'authorization-required';
      return;
    }
    await this.validateAuthorization().catch((error) => {
      this.lastError = (error as Error).message;
      this.oauthState = 'error';
    });
  }

  status(): ChatbotStatus {
    const configuredName = this.configuration.displayName || undefined;
    return {
      owner: 'tempest-mainframe-studio',
      botName: configuredName || this.identity?.login || 'Chat Bot',
      configuredName,
      prefix: this.configuration.prefix,
      oauth: {
        state: this.oauthState,
        scopes: this.tokens?.scopes || [...chatbotScopes],
        storage: this.options.credentialStore?.available ? 'operating-system-credential-vault' : 'unavailable',
        account: this.identity ? { userId: this.identity.userId, login: this.identity.login } : undefined,
        tokenExpiresAt: this.tokens?.expiresAt
      },
      connections: { eventSub: this.eventSubState, chat: this.chatState },
      channel: this.channel ? { userId: this.channel.channelId, login: this.channel.channelLogin } : undefined,
      commands: this.configuration.commands.map(copyCommand),
      activity: this.activity.map((entry) => ({ ...entry })),
      messagesReceived: this.messagesReceived,
      commandsTriggered: this.commandsTriggered,
      lastMessageAt: this.lastMessageAt,
      lastError: this.lastError,
      raidAutomation: {
        ...this.configuration.raidAutomation,
        shoutoutAuthorized: Boolean(this.tokens?.scopes.includes('moderator:manage:shoutouts')),
        moderatorRequired: true,
        queuedShoutouts: this.raidShoutoutQueue.length
      },
      firstChatShoutouts: {
        enabled: this.configuration.firstChatShoutouts.enabled,
        channels: [...this.configuration.firstChatShoutouts.channels],
        handledSessions: this.firstChatShoutoutSessions.size
      },
      interactionAccess: {
        ...this.configuration.interactionAccess,
        assignedCreators: this.configuration.firstChatShoutouts.channels.length,
        resolvedCreators: Object.keys(this.configuration.assignedCreatorIds).length
      },
      autoMod: {
        ...this.configuration.autoMod,
        deleteAuthorized: Boolean(this.tokens?.scopes.includes('moderator:manage:chat_messages')),
        timeoutAuthorized: Boolean(this.tokens?.scopes.includes('moderator:manage:banned_users')),
        moderatorRequired: true,
        actionsTaken: this.autoModActionsTaken
      },
      providers: {
        weather: this.configuration.weatherProvider ? { ...this.configuration.weatherProvider } : undefined,
        nowPlaying: this.configuration.nowPlayingProvider ? { ...this.configuration.nowPlayingProvider } : undefined,
        availableHandlers: chatbotResponseHandlers.filter((handler) => handler !== 'seattle-weather' && (handler !== 'local-weather' || this.configuration.weatherProvider) && (handler !== 'radio-now-playing' || this.configuration.nowPlayingProvider))
      }
    };
  }

  async configure(input: unknown): Promise<ChatbotStatus> {
    if (!input || typeof input !== 'object') throw new Error('Chatbot configuration must be an object.');
    const source = input as { prefix?: unknown; displayName?: unknown; raidAutomation?: unknown; firstChatShoutouts?: unknown; interactionAccess?: unknown; autoMod?: unknown; weatherProvider?: unknown; nowPlayingProvider?: unknown };
    const prefix = String(source.prefix ?? this.configuration.prefix);
    if (prefix.length !== 1 || /\s/.test(prefix)) throw new Error('Chatbot prefix must be one non-space character.');
    const nextFirstChatShoutouts = Object.prototype.hasOwnProperty.call(source, 'firstChatShoutouts')
      ? validateFirstChatShoutouts(source.firstChatShoutouts, this.configuration.firstChatShoutouts)
      : this.configuration.firstChatShoutouts;
    const nextInteractionAccess = Object.prototype.hasOwnProperty.call(source, 'interactionAccess')
      ? validateInteractionAccess(source.interactionAccess, this.configuration.interactionAccess)
      : this.configuration.interactionAccess;
    if (nextInteractionAccess.mode === 'assigned-creators' && !nextFirstChatShoutouts.channels.length) throw new Error('Add at least one assigned Twitch creator before restricting panel interactions.');
    this.configuration.prefix = prefix;
    if (Object.prototype.hasOwnProperty.call(source, 'displayName')) this.configuration.displayName = normalizeDisplayName(source.displayName);
    if (Object.prototype.hasOwnProperty.call(source, 'raidAutomation')) {
      this.configuration.raidAutomation = validateRaidAutomation(source.raidAutomation, this.configuration.raidAutomation);
      if (!this.configuration.raidAutomation.shoutoutEnabled) this.clearRaidShoutoutQueue();
    }
    if (Object.prototype.hasOwnProperty.call(source, 'firstChatShoutouts')) {
      this.configuration.firstChatShoutouts = nextFirstChatShoutouts;
      const assigned = new Set(this.configuration.firstChatShoutouts.channels);
      this.configuration.assignedCreatorIds = Object.fromEntries(Object.entries(this.configuration.assignedCreatorIds).filter(([login]) => assigned.has(login)));
      for (const login of this.firstChatShoutoutSessions.keys()) if (!assigned.has(login)) this.firstChatShoutoutSessions.delete(login);
      await this.persistFirstChatShoutoutState();
    }
    if (Object.prototype.hasOwnProperty.call(source, 'interactionAccess')) {
      this.configuration.interactionAccess = nextInteractionAccess;
    }
    if (this.configuration.interactionAccess.mode === 'assigned-creators') {
      await this.refreshAssignedCreatorIds().catch(() => undefined);
    }
    if (Object.prototype.hasOwnProperty.call(source, 'autoMod')) {
      this.configuration.autoMod = validateAutoMod(source.autoMod, this.configuration.autoMod);
    }
    if (Object.prototype.hasOwnProperty.call(source, 'weatherProvider')) {
      this.configuration.weatherProvider = validateWeatherProvider(source.weatherProvider);
      this.weatherCache = undefined;
      this.weatherForecastUrl = undefined;
    }
    if (Object.prototype.hasOwnProperty.call(source, 'nowPlayingProvider')) {
      this.configuration.nowPlayingProvider = validateNowPlayingProvider(source.nowPlayingProvider);
      this.radioNowPlayingCache = undefined;
    }
    await this.persist();
    return this.status();
  }

  async upsertCommand(input: unknown): Promise<ChatbotCommand> {
    const source = input as Partial<ChatbotCommand>;
    const existing = source.id ? this.configuration.commands.find((command) => command.id === source.id) : undefined;
    const command = validateCommand(input, existing);
    const conflict = this.configuration.commands.find((entry) => entry.id !== command.id && [entry.name, ...entry.aliases].some((name) => name === command.name || command.aliases.includes(name)));
    if (conflict) throw new Error(`Command name or alias conflicts with !${conflict.name}.`);
    this.configuration.commands = [command, ...this.configuration.commands.filter((entry) => entry.id !== command.id)];
    await this.persist();
    return copyCommand(command);
  }

  async removeCommand(id: string): Promise<boolean> {
    const before = this.configuration.commands.length;
    this.configuration.commands = this.configuration.commands.filter((command) => command.id !== id);
    if (this.configuration.commands.length === before) return false;
    await this.persist();
    return true;
  }

  async startDeviceAuthorization(): Promise<{ userCode: string; verificationUri: string; expiresAt: string; intervalSeconds: number }> {
    if (!this.clientId) throw new Error('Configure the Twitch Gateway client ID first.');
    if (!this.options.credentialStore?.available) throw new Error('Secure operating-system credential storage is unavailable.');
    const body = new URLSearchParams({ client_id: this.clientId, scopes: chatbotScopes.join(' ') });
    const response = await this.request('https://id.twitch.tv/oauth2/device', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json() as { device_code?: string; user_code?: string; verification_uri?: string; expires_in?: number; interval?: number; message?: string };
    if (!response.ok || !result.device_code || !result.user_code || !result.verification_uri) throw new Error(describeTwitchOAuthError(result.message, `Chatbot authorization failed with ${response.status}.`));
    const intervalSeconds = Math.max(1, Number(result.interval) || 5);
    this.pendingDevice = { deviceCode: result.device_code, userCode: result.user_code, verificationUri: result.verification_uri, expiresAt: Date.now() + Math.max(60, Number(result.expires_in) || 1800) * 1000, intervalSeconds, nextPollAt: 0 };
    this.oauthState = 'authorization-pending';
    this.lastError = undefined;
    return { userCode: result.user_code, verificationUri: result.verification_uri, expiresAt: new Date(this.pendingDevice.expiresAt).toISOString(), intervalSeconds };
  }

  async pollDeviceAuthorization(): Promise<{ pending: boolean; status: ChatbotStatus; retryAfterSeconds?: number }> {
    const store = this.options.credentialStore;
    if (!store?.available) throw new Error('Secure operating-system credential storage is unavailable.');
    const pending = this.pendingDevice;
    if (!pending) throw new Error('No chatbot authorization is pending.');
    if (Date.now() >= pending.expiresAt) {
      this.pendingDevice = null;
      this.oauthState = 'expired';
      return { pending: false, status: this.status() };
    }
    if (Date.now() < pending.nextPollAt) return { pending: true, status: this.status(), retryAfterSeconds: Math.ceil((pending.nextPollAt - Date.now()) / 1000) };
    pending.nextPollAt = Date.now() + pending.intervalSeconds * 1000;
    const body = new URLSearchParams({ client_id: this.clientId, scopes: chatbotScopes.join(' '), device_code: pending.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    const response = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string[]; message?: string };
    if (!response.ok) {
      if (result.message === 'authorization_pending') return { pending: true, status: this.status(), retryAfterSeconds: pending.intervalSeconds };
      this.lastError = describeTwitchOAuthError(result.message, `Chatbot token exchange failed with ${response.status}.`);
      this.oauthState = 'error';
      throw new Error(this.lastError);
    }
    if (!result.access_token || !result.refresh_token) throw new Error('Twitch did not return chatbot access and refresh tokens.');
    this.tokens = { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: new Date(Date.now() + Math.max(1, Number(result.expires_in) || 14400) * 1000).toISOString(), scopes: Array.isArray(result.scope) ? result.scope : [...chatbotScopes] };
    await store.save(this.tokens);
    this.pendingDevice = null;
    await this.validateAuthorization();
    await this.ensureConnection();
    return { pending: false, status: this.status() };
  }

  async validateAuthorization(): Promise<ChatbotStatus> {
    if (!this.tokens) {
      this.oauthState = this.clientId ? 'authorization-required' : 'not-configured';
      return this.status();
    }
    let response = await this.request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens.accessToken}` } });
    if (response.status === 401 && this.tokens.refreshToken) {
      await this.refreshAuthorization();
      response = await this.request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.tokens.accessToken}` } });
    }
    const result = await response.json() as { client_id?: string; login?: string; user_id?: string; scopes?: string[]; expires_in?: number; message?: string };
    if (!response.ok || !result.client_id || !result.login || !result.user_id) throw new Error(describeTwitchOAuthError(result.message, `Chatbot token validation failed with ${response.status}.`));
    if (result.client_id !== this.clientId) throw new Error('Stored chatbot token belongs to a different Twitch client ID. Reconnect the bot account.');
    const scopes = Array.isArray(result.scopes) ? result.scopes : this.tokens.scopes;
    const missing = chatbotRequiredScopes.filter((scope) => !scopes.includes(scope));
    if (missing.length) throw new Error(`Reconnect the bot account to grant: ${missing.join(', ')}.`);
    this.identity = { clientId: result.client_id, login: result.login, userId: result.user_id };
    this.tokens.scopes = scopes;
    if (Number(result.expires_in) > 0) this.tokens.expiresAt = new Date(Date.now() + Number(result.expires_in) * 1000).toISOString();
    await this.options.credentialStore?.save(this.tokens);
    this.oauthState = 'authorized';
    this.firstChatShoutoutAttempts.clear();
    this.lastError = undefined;
    return this.status();
  }

  async disconnect(): Promise<ChatbotStatus> {
    this.clearRaidShoutoutQueue();
    await this.stopConnection();
    if (this.tokens && this.clientId) {
      const body = new URLSearchParams({ client_id: this.clientId, token: this.tokens.accessToken });
      await this.request('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).catch(() => undefined);
    }
    this.tokens = null;
    this.identity = null;
    this.pendingDevice = null;
    this.lastError = undefined;
    await this.options.credentialStore?.clear();
    this.oauthState = this.clientId ? 'authorization-required' : 'not-configured';
    return this.status();
  }

  async connectChannel(channel: ChatbotChannelAuthorization | null): Promise<void> {
    const changed = this.channel?.channelId !== channel?.channelId || this.channel?.clientId !== channel?.clientId;
    this.channel = channel;
    if (changed) await this.stopConnection();
    await this.ensureConnection();
  }

  async authorizeInteraction(event: TempestNormalizedTwitchEvent): Promise<ChatbotInteractionAccessDecision> {
    const settings = this.configuration.interactionAccess;
    if (settings.mode === 'everyone') return { allowed: true, code: 'allowed' };
    const roles = new Set(event.viewer?.roles || []);
    if (settings.allowBroadcasterAndModerators && (roles.has('broadcaster') || roles.has('moderator'))) return { allowed: true, code: 'allowed' };
    const viewerId = String(event.viewer?.id || '');
    if (!/^\d{1,30}$/.test(viewerId)) {
      return { allowed: false, code: 'identity-required', reason: 'Share your Twitch identity with this Extension to use restricted interactions.' };
    }
    try {
      await this.refreshAssignedCreatorIds();
    } catch (error) {
      return { allowed: false, code: 'verification-unavailable', reason: `Studio could not verify the assigned-creator list: ${(error as Error).message}` };
    }
    if (Object.values(this.configuration.assignedCreatorIds).includes(viewerId)) return { allowed: true, code: 'allowed' };
    return { allowed: false, code: 'not-assigned', reason: 'This channel has limited interactions to its assigned creators.' };
  }

  async processChatEvent(event: TempestNormalizedTwitchEvent, simulated = false, bypassCooldown = false): Promise<{ matched: boolean; accepted: boolean; command?: ChatbotCommand; response?: string; reason?: string }> {
    if (!simulated) {
      const cutoff = Date.now() - 10 * 60 * 1000;
      for (const [id, seenAt] of this.seenEventIds) if (seenAt < cutoff) this.seenEventIds.delete(id);
      if (this.seenEventIds.has(event.id)) {
        this.record({ state: 'ignored', message: `Duplicate chat event ${event.id} ignored.` });
        return { matched: false, accepted: false, reason: 'Duplicate EventSub delivery.' };
      }
      this.seenEventIds.set(event.id, Date.now());
    }
    this.messagesReceived += simulated ? 0 : 1;
    if (!simulated) this.lastMessageAt = new Date().toISOString();
    if (!simulated) await this.options.onEvent?.(event);
    if (event.topic !== 'viewer.chat.message') return { matched: false, accepted: false };
    if (event.viewer?.id && event.viewer.id === this.identity?.userId) return { matched: false, accepted: false, reason: 'Bot messages are ignored to prevent loops.' };
    const autoModResult = await this.processAutoMod(event, simulated);
    if (autoModResult) return autoModResult;
    if (!simulated) await this.processFirstChatShoutout(event);
    const text = String(event.payload.text || '').trim();
    if (!text.startsWith(this.configuration.prefix)) return { matched: false, accepted: false };
    const [rawName, ...args] = text.slice(this.configuration.prefix.length).trim().split(/\s+/);
    const name = String(rawName || '').toLowerCase();
    const command = this.configuration.commands.find((entry) => entry.enabled && (entry.name === name || entry.aliases.includes(name)));
    if (!command) return { matched: false, accepted: false };
    const viewerName = event.viewer?.displayName || event.viewer?.login || 'viewer';
    const sourceChannelId = String(event.payload.sourceChannelId || '').trim();
    const sourceChannelLogin = String(event.payload.sourceChannelLogin || '').trim();
    const sharedChat = event.payload.sharedChat === true || Boolean(sourceChannelId && sourceChannelId !== event.channel.id);
    const activityContext = sharedChat ? { sharedChat: true, sourceChannelLogin: sourceChannelLogin || sourceChannelId || 'shared-chat-participant' } : {};
    if (sharedChat && !command.allowSharedChat) {
      return this.block(command, viewerName, `Unavailable from Shared Chat${sourceChannelLogin ? ` channel @${sourceChannelLogin}` : ''}.`, activityContext);
    }
    const roles = event.viewer?.roles || [];
    if (!rolesPermit(command.permission, roles)) return this.block(command, viewerName, `Requires ${command.permission} permission in @${event.channel.login || 'the home channel'}.`, activityContext);
    const now = Date.now();
    if (!bypassCooldown) {
      const globalRemaining = (this.lastGlobalUse.get(command.id) || 0) + command.globalCooldownMs - now;
      if (globalRemaining > 0) return this.block(command, viewerName, `Global cooldown: ${Math.ceil(globalRemaining / 1000)}s remaining.`, activityContext);
      const viewerKey = `${command.id}:${event.viewer?.id || viewerName.toLowerCase()}`;
      const viewerRemaining = (this.lastViewerUse.get(viewerKey) || 0) + command.viewerCooldownMs - now;
      if (viewerRemaining > 0) return this.block(command, viewerName, `Viewer cooldown: ${Math.ceil(viewerRemaining / 1000)}s remaining.`, activityContext);
      this.lastViewerUse.set(viewerKey, now);
    }
    if (!simulated) this.lastGlobalUse.set(command.id, now);
    const responseTemplate = await this.resolveCommandResponse(command, event);
    const response = responseTemplate
      .replaceAll('{user}', viewerName)
      .replaceAll('{bot}', this.status().botName)
      .replaceAll('{command}', `${this.configuration.prefix}${command.name}`)
      .replaceAll('{args}', args.join(' '));
    try {
      await this.options.onCommand?.({ command: copyCommand(command), event, arguments: args, simulated });
      if (response && !simulated) await this.sendMessage(response, command.replyToViewer ? String(event.payload.messageId || '') : undefined);
      this.commandsTriggered += simulated ? 0 : 1;
      this.record({ command: command.name, viewerName, ...activityContext, state: 'accepted', message: simulated ? `Simulated !${command.name}.` : `Accepted !${command.name} from ${viewerName}.` });
      return { matched: true, accepted: true, command: copyCommand(command), response };
    } catch (error) {
      const message = (error as Error).message;
      this.record({ command: command.name, viewerName, ...activityContext, state: 'error', message });
      return { matched: true, accepted: false, command: copyCommand(command), reason: message };
    }
  }

  async testCommand(input: unknown): Promise<{ matched: boolean; accepted: boolean; command?: ChatbotCommand; response?: string; reason?: string }> {
    const source = input && typeof input === 'object' ? input as { message?: unknown; viewerName?: unknown; roles?: unknown; sharedChat?: unknown; sourceChannelLogin?: unknown } : {};
    const viewerName = String(source.viewerName || 'StudioTester').trim() || 'StudioTester';
    const roles = Array.isArray(source.roles) ? source.roles.filter((role): role is string => typeof role === 'string') : ['broadcaster'];
    const sharedChat = source.sharedChat === true;
    const sourceChannelLogin = String(source.sourceChannelLogin || 'collaborator').trim() || 'collaborator';
    return this.processChatEvent({
      schemaVersion: 1,
      id: `chatbot-test-${randomUUID()}`,
      topic: 'viewer.chat.message',
      occurredAt: new Date().toISOString(),
      source: 'twitch',
      channel: { id: this.channel?.channelId || 'studio-test', login: this.channel?.channelLogin || 'studio-test' },
      viewer: { id: 'studio-chatbot-tester', login: viewerName.toLowerCase(), displayName: viewerName, roles },
      payload: {
        messageId: `test-${randomUUID()}`,
        text: String(source.message || ''),
        ...(sharedChat ? { sharedChat: true, sourceChannelId: 'studio-shared-chat-test', sourceChannelLogin } : {})
      }
    }, true, true);
  }

  async testAutoMod(input: unknown): Promise<{ blocked: boolean; rule?: string; action?: 'delete' | 'timeout'; reason?: string }> {
    const source = input && typeof input === 'object' ? input as { message?: unknown; roles?: unknown } : {};
    const roles = Array.isArray(source.roles) ? source.roles.filter((role): role is string => typeof role === 'string') : [];
    const event: TempestNormalizedTwitchEvent = {
      schemaVersion: 1,
      id: `automod-test-${randomUUID()}`,
      topic: 'viewer.chat.message',
      occurredAt: new Date().toISOString(),
      source: 'twitch',
      channel: { id: this.channel?.channelId || 'studio-test', login: this.channel?.channelLogin || 'studio-test' },
      viewer: { id: 'automod-preview-viewer', login: 'automod_preview', displayName: 'AutoModPreview', roles },
      payload: { messageId: `automod-preview-${randomUUID()}`, text: String(source.message || '') }
    };
    const violation = this.autoModViolation(event);
    return violation ? { blocked: true, rule: violation.rule, action: this.configuration.autoMod.action, reason: violation.reason } : { blocked: false };
  }

  async processRaidEvent(event: TempestNormalizedTwitchEvent, simulated = false): Promise<{ accepted: boolean; welcome: 'disabled' | 'preview' | 'sent' | 'error'; shoutout: 'disabled' | 'preview' | 'queued' | 'authorization-required'; message: string; error?: string }> {
    if (event.topic !== 'viewer.raid.received') throw new Error('Raid automation requires a viewer.raid.received event.');
    const raiderId = String(event.payload.fromBroadcasterId || '').trim();
    const raiderName = String(event.payload.fromBroadcasterName || 'Incoming channel').trim() || 'Incoming channel';
    const viewers = Math.max(0, Math.round(Number(event.payload.viewers) || 0));
    const message = this.configuration.raidAutomation.welcomeMessage
      .replaceAll('{raider}', raiderName)
      .replaceAll('{viewers}', viewers.toLocaleString('en-US'))
      .replaceAll('{channel}', this.channel?.channelLogin || event.channel.login || 'the channel')
      .replaceAll('{bot}', this.status().botName)
      .slice(0, 500);
    let welcome: 'disabled' | 'preview' | 'sent' | 'error' = this.configuration.raidAutomation.welcomeEnabled ? (simulated ? 'preview' : 'sent') : 'disabled';
    let error: string | undefined;
    if (this.configuration.raidAutomation.welcomeEnabled && !simulated) {
      try {
        await this.sendMessage(message);
        this.record({ viewerName: raiderName, state: 'accepted', message: `Welcomed raid from ${raiderName} (${viewers.toLocaleString('en-US')} viewers).` });
      } catch (caught) {
        welcome = 'error';
        error = (caught as Error).message;
        this.record({ viewerName: raiderName, state: 'error', message: `Raid welcome failed for ${raiderName}: ${error}` });
      }
    }
    let shoutout: 'disabled' | 'preview' | 'queued' | 'authorization-required' = 'disabled';
    if (this.configuration.raidAutomation.shoutoutEnabled) {
      if (simulated) shoutout = 'preview';
      else if (!this.tokens?.scopes.includes('moderator:manage:shoutouts')) {
        shoutout = 'authorization-required';
        this.record({ viewerName: raiderName, state: 'error', message: `Official shoutout for ${raiderName} needs a reconnected bot account with moderator:manage:shoutouts.` });
      } else {
        shoutout = this.enqueueOfficialShoutout(event.id, raiderId, raiderName) ? 'queued' : 'disabled';
      }
    }
    return { accepted: welcome === 'sent' || welcome === 'preview' || shoutout === 'queued' || shoutout === 'preview', welcome, shoutout, message, ...(error ? { error } : {}) };
  }

  async testRaidAutomation(input: unknown = {}): Promise<Awaited<ReturnType<TwitchChatbot['processRaidEvent']>>> {
    const source = input && typeof input === 'object' ? input as { raiderName?: unknown; viewers?: unknown } : {};
    const raiderName = String(source.raiderName || 'IncomingChannel').trim().slice(0, 40) || 'IncomingChannel';
    const viewers = Math.max(0, Math.min(1_000_000, Math.round(Number(source.viewers) || 42)));
    return this.processRaidEvent({
      schemaVersion: 1,
      id: `chatbot-raid-test-${randomUUID()}`,
      topic: 'viewer.raid.received',
      occurredAt: new Date().toISOString(),
      source: 'twitch',
      channel: { id: this.channel?.channelId || 'studio-test', login: this.channel?.channelLogin || 'studio-test' },
      payload: { fromBroadcasterId: 'studio-raid-test', fromBroadcasterName: raiderName, viewers }
    }, true);
  }

  private async processFirstChatShoutout(event: TempestNormalizedTwitchEvent): Promise<void> {
    const settings = this.configuration.firstChatShoutouts;
    const login = String(event.viewer?.login || '').trim().toLowerCase();
    const targetId = String(event.viewer?.id || '').trim();
    const targetName = String(event.viewer?.displayName || event.viewer?.login || '').trim() || login;
    if (settings.channels.includes(login) && /^\d{1,30}$/.test(targetId) && this.configuration.assignedCreatorIds[login] !== targetId) {
      this.configuration.assignedCreatorIds[login] = targetId;
      await this.persist();
    }
    if (!settings.enabled || !login || !targetId || !settings.channels.includes(login) || targetId === this.channel?.channelId) return;
    let stream: NonNullable<TwitchChatbot['streamCache']>;
    try {
      stream = await this.loadStreamStatus();
    } catch (caught) {
      this.record({ viewerName: targetName, state: 'error', message: `First Chat Shoutout could not verify the live stream for ${targetName}: ${(caught as Error).message}` });
      return;
    }
    if (!stream.startedAt || this.firstChatShoutoutSessions.get(login) === stream.startedAt) return;
    const attemptKey = `${login}:${stream.startedAt}`;
    if (!this.tokens?.scopes.includes('moderator:manage:shoutouts')) {
      if (!this.firstChatShoutoutAttempts.has(attemptKey)) {
        this.firstChatShoutoutAttempts.add(attemptKey);
        this.record({ viewerName: targetName, state: 'error', message: `First Chat Shoutout for ${targetName} needs a reconnected moderator bot with moderator:manage:shoutouts.` });
      }
      return;
    }
    if (!this.enqueueOfficialShoutout(`first-chat:${stream.startedAt}:${targetId}`, targetId, targetName)) return;
    this.firstChatShoutoutSessions.set(login, stream.startedAt);
    await this.persistFirstChatShoutoutState();
    this.record({ viewerName: targetName, state: 'accepted', message: `First chat from assigned channel ${targetName} detected for this stream.` });
  }

  async radioStatus(): Promise<NowPlayingProviderStatus | null> {
    const provider = this.configuration.nowPlayingProvider;
    if (!provider) return null;
    const checkedAt = new Date().toISOString();
    try {
      const radio = await this.loadRadioNowPlaying();
      return {
        id: 'now-playing-provider',
        name: radio.stationName,
        provider: 'AzuraCast',
        state: radio.online ? 'online' : 'offline',
        online: radio.online,
        publicPlayerUrl: provider.publicPlayerUrl,
        streamUrl: provider.streamUrl || '',
        checkedAt,
        nowPlaying: { artist: radio.artist, title: radio.title, text: radio.text, album: radio.album }
      };
    } catch {
      return {
        id: 'now-playing-provider',
        name: provider.stationName,
        provider: 'AzuraCast',
        state: 'unavailable',
        online: false,
        publicPlayerUrl: provider.publicPlayerUrl,
        streamUrl: provider.streamUrl || '',
        checkedAt
      };
    }
  }

  async close(): Promise<void> {
    this.clearRaidShoutoutQueue();
    await this.stopConnection();
  }

  private block(command: ChatbotCommand, viewerName: string, reason: string, activityContext: Pick<ChatbotActivity, 'sharedChat' | 'sourceChannelLogin'> = {}) {
    this.record({ command: command.name, viewerName, ...activityContext, state: 'blocked', message: `${viewerName}: ${reason}` });
    return { matched: true, accepted: false, command: copyCommand(command), reason };
  }

  private autoModViolation(event: TempestNormalizedTwitchEvent): { rule: string; reason: string } | undefined {
    const settings = this.configuration.autoMod;
    if (!settings.enabled || event.topic !== 'viewer.chat.message') return undefined;
    const sourceChannelId = String(event.payload.sourceChannelId || '').trim();
    if (event.payload.sharedChat === true || (sourceChannelId && sourceChannelId !== event.channel.id)) return undefined;
    const roles = event.viewer?.roles || [];
    if (settings.exemptRoles.some((role) => roles.includes(role))) return undefined;
    const text = String(event.payload.text || '').trim();
    if (!text) return undefined;
    if (settings.blockedTermsEnabled) {
      const normalized = text.toLocaleLowerCase();
      const term = settings.blockedTerms.find((entry) => normalized.includes(entry));
      if (term) return { rule: 'blocked-term', reason: 'blocked term' };
    }
    if (settings.linkProtectionEnabled) {
      const candidates = text.match(/(?:https?:\/\/|www\.)[^\s<>]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>]*)?/gi) || [];
      const blockedDomain = candidates.map((candidate) => {
        try {
          return new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`).hostname.toLowerCase().replace(/^www\./, '');
        } catch { return ''; }
      }).find((hostname) => hostname && !settings.allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)));
      if (blockedDomain) return { rule: 'link', reason: 'unapproved link' };
    }
    if (settings.capsProtectionEnabled) {
      const letters = [...text].filter((character) => /[a-z]/i.test(character));
      const uppercase = letters.filter((character) => character === character.toLocaleUpperCase() && character !== character.toLocaleLowerCase()).length;
      if (letters.length >= settings.capsMinimumLetters && (uppercase / letters.length) * 100 >= settings.capsPercentage) return { rule: 'caps', reason: 'excessive capital letters' };
    }
    if (settings.repetitionProtectionEnabled) {
      const repeated = new RegExp(`([^\\s])\\1{${settings.repetitionLimit - 1},}`, 'i');
      if (repeated.test(text)) return { rule: 'repetition', reason: 'repeated-character spam' };
    }
    return undefined;
  }

  private async processAutoMod(event: TempestNormalizedTwitchEvent, simulated: boolean): Promise<{ matched: boolean; accepted: false; reason: string } | undefined> {
    const violation = this.autoModViolation(event);
    if (!violation) return undefined;
    const settings = this.configuration.autoMod;
    const viewerName = event.viewer?.displayName || event.viewer?.login || 'viewer';
    if (simulated) return { matched: true, accepted: false, reason: `AutoMod would ${settings.action} this message: ${violation.reason}.` };
    if (!this.tokens || !this.identity || !this.channel) {
      const reason = 'AutoMod matched, but the moderator bot is not connected.';
      this.record({ viewerName, state: 'error', message: `${viewerName}: ${reason}` });
      return { matched: true, accepted: false, reason };
    }
    const messageId = String(event.payload.messageId || '');
    const viewerId = String(event.viewer?.id || '');
    const requiredScope = settings.action === 'timeout' ? 'moderator:manage:banned_users' : 'moderator:manage:chat_messages';
    if (!this.tokens.scopes.includes(requiredScope) || !messageId || (settings.action === 'timeout' && !viewerId)) {
      const reason = `AutoMod matched, but ${requiredScope} authorization is required.`;
      this.record({ viewerName, state: 'error', message: `${viewerName}: ${reason}` });
      return { matched: true, accepted: false, reason };
    }
    try {
      if (settings.action === 'timeout') {
        const query = new URLSearchParams({ broadcaster_id: this.channel.channelId, moderator_id: this.identity.userId });
        const response = await this.request(`https://api.twitch.tv/helix/moderation/bans?${query}`, {
          method: 'POST',
          headers: { ...this.twitchHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { user_id: viewerId, duration: settings.timeoutSeconds, reason: `Tempest AutoMod: ${violation.reason}` } })
        });
        if (response.status !== 200) {
          const result = await response.json().catch(() => ({})) as { message?: string };
          throw new Error(result.message || `Twitch timeout failed with ${response.status}.`);
        }
      } else {
        const query = new URLSearchParams({ broadcaster_id: this.channel.channelId, moderator_id: this.identity.userId, message_id: messageId });
        const response = await this.request(`https://api.twitch.tv/helix/moderation/chat?${query}`, { method: 'DELETE', headers: this.twitchHeaders() });
        if (response.status !== 204) {
          const result = await response.json().catch(() => ({})) as { message?: string };
          throw new Error(result.message || `Twitch message deletion failed with ${response.status}.`);
        }
      }
      this.autoModActionsTaken += 1;
      this.record({ viewerName, state: 'blocked', message: `AutoMod ${settings.action === 'timeout' ? `timed out ${viewerName} for ${settings.timeoutSeconds}s` : `deleted a message from ${viewerName}`} · ${violation.reason}.` });
      if (settings.postNotice) {
        const notice = settings.noticeMessage.replaceAll('{user}', viewerName).replaceAll('{reason}', violation.reason).replaceAll('{action}', settings.action);
        await this.sendMessage(notice).catch((error) => this.record({ viewerName, state: 'error', message: `AutoMod acted, but its chat notice failed: ${(error as Error).message}` }));
      }
      return { matched: true, accepted: false, reason: `AutoMod ${settings.action}: ${violation.reason}.` };
    } catch (error) {
      const reason = `AutoMod could not ${settings.action} ${viewerName}: ${(error as Error).message}`;
      this.record({ viewerName, state: 'error', message: reason });
      return { matched: true, accepted: false, reason };
    }
  }

  private record(input: Omit<ChatbotActivity, 'id' | 'timestamp'>): void {
    this.activity.unshift({ id: randomUUID(), timestamp: new Date().toISOString(), ...input });
    this.activity = this.activity.slice(0, 100);
  }

  private async sendMessage(message: string, replyParentMessageId?: string): Promise<void> {
    if (!this.tokens || !this.identity || !this.channel) throw new Error('Chatbot output is not connected.');
    const response = await this.request('https://api.twitch.tv/helix/chat/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.tokens.accessToken}`, 'Client-Id': this.clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: this.channel.channelId, sender_id: this.identity.userId, message: message.slice(0, 500), ...(replyParentMessageId ? { reply_parent_message_id: replyParentMessageId } : {}) })
    });
    const result = await response.json().catch(() => ({})) as { message?: string; data?: Array<{ is_sent?: boolean; drop_reason?: { message?: string } }> };
    if (!response.ok || result.data?.[0]?.is_sent === false) throw new Error(result.data?.[0]?.drop_reason?.message || result.message || `Twitch chat send failed with ${response.status}.`);
  }

  private enqueueOfficialShoutout(eventId: string, targetId: string, targetName: string): boolean {
    if (!targetId) {
      this.record({ viewerName: targetName, state: 'error', message: `Official shoutout for ${targetName} could not be queued because Twitch did not provide the channel ID.` });
      return false;
    }
    if (this.raidShoutoutQueue.some((entry) => entry.eventId === eventId || entry.targetId === targetId)) return false;
    if ((this.lastShoutoutByTarget.get(targetId) || 0) + 3_600_000 > Date.now()) return false;
    this.raidShoutoutQueue.push({ eventId, targetId, targetName });
    this.record({ viewerName: targetName, state: 'accepted', message: `Official shoutout for ${targetName} queued.` });
    this.scheduleRaidShoutout();
    return true;
  }

  private clearRaidShoutoutQueue(): void {
    clearTimeout(this.raidShoutoutTimer);
    this.raidShoutoutTimer = undefined;
    this.raidShoutoutQueue = [];
  }

  private nextRaidShoutout(): { index: number; readyAt: number } | undefined {
    if (!this.raidShoutoutQueue.length) return undefined;
    const globalReadyAt = this.lastShoutoutAt + 120_000;
    let selected = { index: 0, readyAt: Number.POSITIVE_INFINITY };
    this.raidShoutoutQueue.forEach((entry, index) => {
      const readyAt = Math.max(globalReadyAt, (this.lastShoutoutByTarget.get(entry.targetId) || 0) + 3_600_000);
      if (readyAt < selected.readyAt) selected = { index, readyAt };
    });
    return selected;
  }

  private scheduleRaidShoutout(): void {
    if (this.raidShoutoutSending || this.raidShoutoutTimer) return;
    const next = this.nextRaidShoutout();
    if (!next) return;
    const waitMs = Math.max(0, next.readyAt - Date.now());
    this.raidShoutoutTimer = setTimeout(() => {
      this.raidShoutoutTimer = undefined;
      void this.sendNextRaidShoutout();
    }, waitMs);
    this.raidShoutoutTimer.unref?.();
  }

  private async sendNextRaidShoutout(): Promise<void> {
    if (this.raidShoutoutSending) return;
    const next = this.nextRaidShoutout();
    if (!next || next.readyAt > Date.now()) return this.scheduleRaidShoutout();
    const entry = this.raidShoutoutQueue.splice(next.index, 1)[0];
    this.raidShoutoutSending = true;
    try {
      if (!this.tokens || !this.identity || !this.channel) throw new Error('Chatbot output is not connected.');
      const query = new URLSearchParams({ from_broadcaster_id: this.channel.channelId, to_broadcaster_id: entry.targetId, moderator_id: this.identity.userId });
      const response = await this.request(`https://api.twitch.tv/helix/chat/shoutouts?${query}`, { method: 'POST', headers: this.twitchHeaders() });
      if (response.status !== 204) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(result.message || `Twitch shoutout failed with ${response.status}.`);
      }
      const now = Date.now();
      this.lastShoutoutAt = now;
      this.lastShoutoutByTarget.set(entry.targetId, now);
      this.record({ viewerName: entry.targetName, state: 'accepted', message: `Official Twitch shoutout sent to ${entry.targetName}.` });
    } catch (caught) {
      this.record({ viewerName: entry.targetName, state: 'error', message: `Official shoutout failed for ${entry.targetName}: ${(caught as Error).message}` });
    } finally {
      this.raidShoutoutSending = false;
      this.scheduleRaidShoutout();
    }
  }

  private async resolveCommandResponse(command: ChatbotCommand, event: TempestNormalizedTwitchEvent): Promise<string> {
    switch (command.handler) {
      case 'command-directory': return this.commandDirectoryResponse(event);
      case 'stream-uptime': return this.streamUptimeResponse();
      case 'channel-title': return this.channelTitleResponse();
      case 'channel-game': return this.channelGameResponse();
      case 'stream-schedule': return this.streamScheduleResponse();
      case 'local-weather':
      case 'seattle-weather': return this.localWeatherResponse();
      case 'radio-now-playing': return this.radioNowPlayingResponse();
      default: return command.response;
    }
  }

  private commandDirectoryResponse(event: TempestNormalizedTwitchEvent): string {
    const sourceChannelId = String(event.payload.sourceChannelId || '').trim();
    const sharedChat = event.payload.sharedChat === true || Boolean(sourceChannelId && sourceChannelId !== event.channel.id);
    const roles = event.viewer?.roles || [];
    const names = this.configuration.commands
      .filter((command) => command.enabled && (!sharedChat || command.allowSharedChat) && rolesPermit(command.permission, roles))
      .map((command) => `${this.configuration.prefix}${command.name}`);
    return `Available commands: ${names.join(' · ')}`.slice(0, 500);
  }

  private async streamUptimeResponse(): Promise<string> {
    try {
      const stream = await this.loadStreamStatus();
      if (!stream.startedAt) return `@${this.channel?.channelLogin || 'This channel'} is currently offline.`;
      const elapsedMs = Math.max(0, Date.now() - Date.parse(stream.startedAt));
      const hours = Math.floor(elapsedMs / 3_600_000);
      const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);
      const duration = hours ? `${hours}h ${minutes}m` : `${minutes}m`;
      return `Stream uptime: ${duration}${Number.isInteger(stream.viewerCount) ? ` · ${stream.viewerCount?.toLocaleString()} viewers` : ''}.`;
    } catch {
      return 'Stream uptime is temporarily unavailable. Try again shortly.';
    }
  }

  private async channelTitleResponse(): Promise<string> {
    try {
      const info = await this.loadChannelInfo();
      return info.title ? `Current title: ${info.title}`.slice(0, 500) : 'The channel does not currently have a stream title.';
    } catch {
      return 'The current stream title is temporarily unavailable. Try again shortly.';
    }
  }

  private async channelGameResponse(): Promise<string> {
    try {
      const info = await this.loadChannelInfo();
      return info.gameName ? `Current category: ${info.gameName}`.slice(0, 500) : 'No Twitch category is currently selected.';
    } catch {
      return 'The current Twitch category is temporarily unavailable. Try again shortly.';
    }
  }

  private async streamScheduleResponse(): Promise<string> {
    try {
      const schedule = await this.loadStreamSchedule();
      if (!schedule.startTime) return 'No upcoming stream is listed on the Twitch schedule.';
      const time = new Intl.DateTimeFormat('en-US', {
        timeZone: this.configuration.weatherProvider?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
      }).format(new Date(schedule.startTime));
      return `Next stream: ${time}${schedule.title ? ` · ${schedule.title}` : ''}`.slice(0, 500);
    } catch {
      return 'The Twitch stream schedule is temporarily unavailable. Try again shortly.';
    }
  }

  private twitchHeaders(): Record<string, string> {
    if (!this.tokens) throw new Error('The bot account is not authorized.');
    return { Authorization: `Bearer ${this.tokens.accessToken}`, 'Client-Id': this.clientId };
  }

  private async refreshAssignedCreatorIds(): Promise<void> {
    const channels = this.configuration.firstChatShoutouts.channels;
    const missing = channels.filter((login) => !this.configuration.assignedCreatorIds[login]);
    if (!missing.length) return;
    const query = new URLSearchParams();
    for (const login of missing) query.append('login', login);
    const response = await this.request(`https://api.twitch.tv/helix/users?${query}`, { headers: this.twitchHeaders() });
    const result = await response.json().catch(() => ({})) as { data?: Array<{ id?: string; login?: string }>; message?: string };
    if (!response.ok) throw new Error(result.message || `Twitch user lookup failed with ${response.status}.`);
    for (const user of result.data || []) {
      const login = String(user.login || '').toLowerCase();
      const userId = String(user.id || '');
      if (channels.includes(login) && /^\d{1,30}$/.test(userId)) this.configuration.assignedCreatorIds[login] = userId;
    }
    await this.persist();
  }

  private async loadStreamStatus(): Promise<NonNullable<TwitchChatbot['streamCache']>> {
    if (this.streamCache && Date.now() - this.streamCache.fetchedAt < 30_000) return this.streamCache;
    if (!this.channel) throw new Error('The home channel is not connected.');
    const response = await this.request(`https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(this.channel.channelId)}`, { headers: this.twitchHeaders() });
    const result = await response.json().catch(() => ({})) as { data?: Array<{ started_at?: string; viewer_count?: number }>; message?: string };
    if (!response.ok) throw new Error(result.message || `Twitch streams request failed with ${response.status}.`);
    const stream = result.data?.[0];
    this.streamCache = { fetchedAt: Date.now(), startedAt: stream?.started_at, viewerCount: stream?.viewer_count };
    return this.streamCache;
  }

  private async loadChannelInfo(): Promise<NonNullable<TwitchChatbot['channelInfoCache']>> {
    if (this.channelInfoCache && Date.now() - this.channelInfoCache.fetchedAt < 60_000) return this.channelInfoCache;
    if (!this.channel) throw new Error('The home channel is not connected.');
    const response = await this.request(`https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(this.channel.channelId)}`, { headers: this.twitchHeaders() });
    const result = await response.json().catch(() => ({})) as { data?: Array<{ title?: string; game_name?: string }>; message?: string };
    if (!response.ok) throw new Error(result.message || `Twitch channel request failed with ${response.status}.`);
    const channel = result.data?.[0];
    this.channelInfoCache = { fetchedAt: Date.now(), title: String(channel?.title || ''), gameName: String(channel?.game_name || '') };
    return this.channelInfoCache;
  }

  private async loadStreamSchedule(): Promise<NonNullable<TwitchChatbot['scheduleCache']>> {
    if (this.scheduleCache && Date.now() - this.scheduleCache.fetchedAt < 5 * 60_000) return this.scheduleCache;
    if (!this.channel) throw new Error('The home channel is not connected.');
    const response = await this.request(`https://api.twitch.tv/helix/schedule?broadcaster_id=${encodeURIComponent(this.channel.channelId)}&first=1`, { headers: this.twitchHeaders() });
    if (response.status === 404) {
      this.scheduleCache = { fetchedAt: Date.now() };
      return this.scheduleCache;
    }
    const result = await response.json().catch(() => ({})) as { data?: { segments?: Array<{ title?: string; start_time?: string }> }; message?: string };
    if (!response.ok) throw new Error(result.message || `Twitch schedule request failed with ${response.status}.`);
    const segment = result.data?.segments?.[0];
    this.scheduleCache = { fetchedAt: Date.now(), title: String(segment?.title || '') || undefined, startTime: String(segment?.start_time || '') || undefined };
    return this.scheduleCache;
  }

  private async radioNowPlayingResponse(): Promise<string> {
    const provider = this.configuration.nowPlayingProvider;
    if (!provider) return 'Now Playing is not configured in Studio.';
    try {
      const nowPlaying = await this.loadRadioNowPlaying();
      if (!nowPlaying.online) return `${nowPlaying.stationName} is currently offline. Listen page: ${provider.publicPlayerUrl}`;
      const track = nowPlaying.artist && nowPlaying.title
        ? `${nowPlaying.artist} — ${nowPlaying.title}`
        : nowPlaying.title || nowPlaying.text;
      if (!track) return `${nowPlaying.stationName} is online, but the current song metadata is unavailable.`;
      return `Now playing on ${nowPlaying.stationName}: ${track}${nowPlaying.album ? ` · Album: ${nowPlaying.album}` : ''} · Listen: ${provider.publicPlayerUrl}`.slice(0, 500);
    } catch {
      return `${provider.stationName}'s now-playing signal is temporarily unavailable. Listen live: ${provider.publicPlayerUrl}`;
    }
  }

  private async loadRadioNowPlaying(): Promise<NonNullable<TwitchChatbot['radioNowPlayingCache']>> {
    const provider = this.configuration.nowPlayingProvider;
    if (!provider) throw new Error('Now Playing is not configured.');
    if (this.radioNowPlayingCache && Date.now() - this.radioNowPlayingCache.fetchedAt < 15_000) return this.radioNowPlayingCache;
    const response = await this.request(provider.apiUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'TempestStreamingStudio/1.0.1' },
      signal: AbortSignal.timeout(5_000)
    });
    const result = await response.json().catch(() => ({})) as {
      is_online?: boolean;
      station?: { name?: string };
      now_playing?: { song?: { artist?: string; title?: string; text?: string; album?: string } };
    };
    if (!response.ok) throw new Error(`Now Playing request failed with ${response.status}.`);
    const song = result.now_playing?.song;
    const value = (input: unknown): string | undefined => typeof input === 'string' && input.trim() ? input.trim() : undefined;
    this.radioNowPlayingCache = {
      fetchedAt: Date.now(),
      online: result.is_online === true,
      stationName: value(result.station?.name) || provider.stationName,
      artist: value(song?.artist),
      title: value(song?.title),
      text: value(song?.text),
      album: value(song?.album)
    };
    return this.radioNowPlayingCache;
  }

  private async localWeatherResponse(): Promise<string> {
    const provider = this.configuration.weatherProvider;
    if (!provider) return 'Local weather is not configured in Studio.';
    const localTime = new Intl.DateTimeFormat('en-US', {
      timeZone: provider.timeZone,
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    }).format(new Date());
    try {
      const weather = await this.loadLocalWeather();
      const segments = [
        `${provider.locationName}: ${localTime}`,
        `${Math.round(weather.temperature)}°${weather.temperatureUnit}`,
        weather.shortForecast
      ];
      if (Number.isFinite(weather.humidity)) segments.push(`Humidity ${Math.round(weather.humidity as number)}%`);
      if (Number.isFinite(weather.precipitation)) segments.push(`Rain ${Math.round(weather.precipitation as number)}%`);
      if (weather.windSpeed) segments.push(`Wind ${weather.windDirection ? `${weather.windDirection} ` : ''}${weather.windSpeed}`);
      return segments.join(' · ').slice(0, 500);
    } catch {
      return `${provider.locationName}: ${localTime} · Weather is temporarily unavailable. Try again shortly.`;
    }
  }

  private async loadLocalWeather(): Promise<NonNullable<TwitchChatbot['weatherCache']>> {
    const provider = this.configuration.weatherProvider;
    if (!provider) throw new Error('Local weather is not configured.');
    const now = Date.now();
    if (this.weatherCache && now - this.weatherCache.fetchedAt < 10 * 60 * 1000) return this.weatherCache;
    try {
      const headers = { 'User-Agent': 'TempestStreamingStudio/1.0.1', Accept: 'application/geo+json' };
      if (!this.weatherForecastUrl) {
        const pointResponse = await this.request(`https://api.weather.gov/points/${provider.latitude},${provider.longitude}`, { headers });
        const point = await pointResponse.json() as { properties?: { forecastHourly?: string }; title?: string };
        if (!pointResponse.ok || !point.properties?.forecastHourly) throw new Error(point.title || `NWS point lookup failed with ${pointResponse.status}.`);
        this.weatherForecastUrl = point.properties.forecastHourly;
      }
      const forecastResponse = await this.request(this.weatherForecastUrl, { headers });
      const forecast = await forecastResponse.json() as {
        properties?: { periods?: Array<{ temperature?: number; temperatureUnit?: string; shortForecast?: string; windSpeed?: string; windDirection?: string; relativeHumidity?: { value?: number | null }; probabilityOfPrecipitation?: { value?: number | null } }> };
        title?: string;
      };
      const period = forecast.properties?.periods?.[0];
      if (!forecastResponse.ok || !period || !Number.isFinite(period.temperature) || !period.temperatureUnit || !period.shortForecast) throw new Error(forecast.title || `NWS hourly forecast failed with ${forecastResponse.status}.`);
      this.weatherCache = {
        fetchedAt: now,
        temperature: Number(period.temperature),
        temperatureUnit: period.temperatureUnit,
        shortForecast: period.shortForecast,
        windSpeed: period.windSpeed,
        windDirection: period.windDirection,
        humidity: Number.isFinite(period.relativeHumidity?.value) ? Number(period.relativeHumidity?.value) : undefined,
        precipitation: Number.isFinite(period.probabilityOfPrecipitation?.value) ? Number(period.probabilityOfPrecipitation?.value) : undefined
      };
      return this.weatherCache;
    } catch (error) {
      if (this.weatherCache && now - this.weatherCache.fetchedAt < 60 * 60 * 1000) return this.weatherCache;
      throw error;
    }
  }

  private async ensureConnection(): Promise<void> {
    if (!this.channel || !this.tokens || !this.identity || this.oauthState !== 'authorized' || this.socket) return;
    this.stopping = false;
    this.setConnectionState('connecting', 'connecting');
    this.openSocket('wss://eventsub.wss.twitch.tv/ws');
  }

  private openSocket(url: string, inheritsSubscriptions = false): void {
    const socket = new WebSocket(url);
    if (inheritsSubscriptions) this.inheritedSubscriptionSockets.add(socket);
    this.socket = socket;
    socket.on('message', (data) => {
      void this.handleSocketMessage(socket, data.toString()).catch((error) => {
        if (this.socket !== socket) return;
        this.lastError = (error as Error).message;
        this.setConnectionState('error', 'error');
        socket.close(1011, 'EventSub message handling failed');
      });
    });
    socket.on('error', (error) => {
      if (this.socket !== socket) return;
      this.lastError = `EventSub connection error: ${error.message}`;
      this.setConnectionState('error', 'error');
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearSilenceTimer();
      if (this.stopping) return;
      this.setConnectionState('disconnected', 'disconnected');
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => { void this.ensureConnection(); }, 5_000);
    });
  }

  private async handleSocketMessage(socket: WebSocket, raw: string): Promise<void> {
    if (this.socket !== socket) return;
    const message = JSON.parse(raw) as {
      metadata?: { message_id?: string; message_type?: string; message_timestamp?: string; subscription_type?: string };
      payload?: { session?: { id?: string; keepalive_timeout_seconds?: number; reconnect_url?: string }; event?: Record<string, unknown> };
    };
    const type = message.metadata?.message_type;
    this.resetSilenceTimer(Number(message.payload?.session?.keepalive_timeout_seconds) || 30);
    if (type === 'session_welcome') {
      const sessionId = message.payload?.session?.id;
      if (!sessionId) throw new Error('EventSub Welcome message did not include a session ID.');
      if (!this.inheritedSubscriptionSockets.has(socket)) await this.subscribeToChat(sessionId);
      this.setConnectionState('connected', 'connected');
      this.lastError = undefined;
      return;
    }
    if (type === 'session_reconnect' && message.payload?.session?.reconnect_url) {
      const oldSocket = this.socket;
      this.socket = null;
      this.openSocket(message.payload.session.reconnect_url, true);
      oldSocket?.close(1000, 'Twitch requested reconnect');
      return;
    }
    if (type === 'revocation') {
      this.lastError = 'Twitch revoked the Chat EventSub subscription. Reconnect the bot account.';
      this.setConnectionState('error', 'error');
      return;
    }
    if (type !== 'notification' || message.metadata?.subscription_type !== 'channel.chat.message' || !message.payload?.event) return;
    const event = message.payload.event;
    const chatterId = String(event.chatter_user_id || '');
    const chatMessage = event.message && typeof event.message === 'object' && !Array.isArray(event.message)
      ? event.message as { text?: unknown; fragments?: unknown }
      : {};
    const fragments = Array.isArray(chatMessage.fragments) ? chatMessage.fragments.flatMap((entry): Array<Record<string, unknown>> => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const fragment = entry as Record<string, unknown>;
      const type = String(fragment.type || '');
      const text = String(fragment.text || '').slice(0, 500);
      if (type === 'text' && text) return [{ type, text }];
      if (type === 'emote' && fragment.emote && typeof fragment.emote === 'object' && !Array.isArray(fragment.emote)) {
        const emote = fragment.emote as Record<string, unknown>;
        const id = String(emote.id || '');
        if (!/^[A-Za-z0-9_]+$/.test(id)) return [];
        const format = Array.isArray(emote.format) ? emote.format.map(String).filter((value) => value === 'static' || value === 'animated').slice(0, 2) : ['static'];
        return [{ type, text, emote: { id, format } }];
      }
      if (type === 'gif' && fragment.gif && typeof fragment.gif === 'object' && !Array.isArray(fragment.gif)) {
        try {
          const url = new URL(String((fragment.gif as Record<string, unknown>).url || ''));
          if (url.protocol === 'https:') return [{ type, text, gif: { url: url.href } }];
        } catch { /* Ignore malformed GIF fragments supplied by the upstream event. */ }
      }
      return [];
    }) : [];
    const badges = Array.isArray(event.badges) ? event.badges as Array<{ set_id?: string }> : [];
    const roles = [
      ...(chatterId === String(event.broadcaster_user_id || '') ? ['broadcaster'] : []),
      ...(badges.some((badge) => badge.set_id === 'moderator') ? ['moderator'] : []),
      ...(badges.some((badge) => badge.set_id === 'subscriber') ? ['subscriber'] : []),
      ...(badges.some((badge) => badge.set_id === 'vip') ? ['vip'] : [])
    ];
    await this.processChatEvent({
      schemaVersion: 1,
      id: String(event.source_message_id || event.message_id || message.metadata?.message_id || randomUUID()),
      topic: 'viewer.chat.message',
      occurredAt: String(message.metadata?.message_timestamp || new Date().toISOString()),
      source: 'twitch',
      channel: { id: String(event.broadcaster_user_id || this.channel?.channelId || ''), login: String(event.broadcaster_user_login || this.channel?.channelLogin || ''), displayName: String(event.broadcaster_user_name || '') },
      viewer: { id: chatterId, login: String(event.chatter_user_login || ''), displayName: String(event.chatter_user_name || ''), roles },
      payload: {
        messageId: String(event.message_id || ''),
        text: String(chatMessage.text || ''),
        ...(fragments.length ? { fragments } : {}),
        ...(event.source_broadcaster_user_id ? {
          sharedChat: true,
          sourceChannelId: String(event.source_broadcaster_user_id),
          sourceChannelLogin: String(event.source_broadcaster_user_login || ''),
          sourceChannelDisplayName: String(event.source_broadcaster_user_name || ''),
          sourceMessageId: String(event.source_message_id || '')
        } : {}),
        ...(typeof event.is_source_only === 'boolean' ? { sourceOnly: event.is_source_only } : {})
      }
    });
  }

  private async subscribeToChat(sessionId: string): Promise<void> {
    if (!this.tokens || !this.identity || !this.channel) throw new Error('Chatbot authorization is incomplete.');
    const response = await this.request('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.tokens.accessToken}`, 'Client-Id': this.clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.channel.channelId, user_id: this.identity.userId }, transport: { method: 'websocket', session_id: sessionId } })
    });
    const result = await response.json().catch(() => ({})) as { message?: string; error?: string };
    if (response.status !== 202) throw new Error(result.message || result.error || `Chat EventSub subscription failed with ${response.status}.`);
  }

  private resetSilenceTimer(seconds: number): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.lastError = 'EventSub keepalive timed out; reconnecting.';
      this.socket?.terminate();
    }, (Math.max(10, seconds) + 5) * 1000);
  }

  private clearSilenceTimer(): void {
    clearTimeout(this.silenceTimer);
    this.silenceTimer = undefined;
  }

  private async stopConnection(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.clearSilenceTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close(1000, 'Studio stopped Chatbot');
    this.setConnectionState('disconnected', 'disconnected');
  }

  private setConnectionState(eventSub: ChatbotStatus['connections']['eventSub'], chat: ChatbotStatus['connections']['chat']): void {
    this.eventSubState = eventSub;
    this.chatState = chat;
    this.options.onConnectionState?.(eventSub, chat);
  }

  private async refreshAuthorization(): Promise<void> {
    if (!this.tokens?.refreshToken) throw new Error('Chatbot refresh token is unavailable.');
    this.oauthState = 'refreshing';
    const body = new URLSearchParams({ client_id: this.clientId, grant_type: 'refresh_token', refresh_token: this.tokens.refreshToken });
    const response = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const result = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string[]; message?: string };
    if (!response.ok || !result.access_token || !result.refresh_token) throw new Error(describeTwitchOAuthError(result.message, `Chatbot token refresh failed with ${response.status}.`));
    this.tokens = { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: new Date(Date.now() + Math.max(1, Number(result.expires_in) || 14400) * 1000).toISOString(), scopes: Array.isArray(result.scope) ? result.scope : this.tokens.scopes };
    await this.options.credentialStore?.save(this.tokens);
  }

  private async persist(): Promise<void> {
    this.configuration.updatedAt = new Date().toISOString();
    await writeFile(this.configurationPath, `${JSON.stringify(this.configuration, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  private async persistFirstChatShoutoutState(): Promise<void> {
    await writeFile(this.firstChatShoutoutStatePath, `${JSON.stringify({ schemaVersion: 1, sessions: Object.fromEntries(this.firstChatShoutoutSessions) }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}
