export const discordCompanionProtocolVersion = 1 as const;

export interface VoiceParticipant {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bot: boolean;
  self: boolean;
  mute: boolean;
  deaf: boolean;
  speaking: boolean;
}

export interface VoiceSessionStart {
  type: 'session.start';
  guildId: string;
  channelId: string;
  bindingId: string;
  sessionId: string;
  streamerUserId?: string;
  hiddenUserIds?: string[];
}

export interface VoiceSessionStop {
  type: 'session.stop';
  guildId: string;
  sessionId?: string;
  reason?: string;
}

export interface PrivacyChanged {
  type: 'privacy.changed';
  guildId: string;
  userId: string;
  hidden: boolean;
}

export interface CommandResponse {
  type: 'command.response';
  requestId: string;
  ok: boolean;
  message: string;
}

export type SignalToWorkerMessage =
  | { type: 'worker.ready'; heartbeatIntervalMs?: number }
  | VoiceSessionStart
  | VoiceSessionStop
  | PrivacyChanged
  | CommandResponse;

export type WorkerToSignalMessage =
  | { type: 'worker.hello'; protocolVersion: typeof discordCompanionProtocolVersion; applicationId: string; instanceId: string; guildIds: string[] }
  | { type: 'worker.heartbeat'; at: string; guildCount: number; sessionCount: number }
  | { type: 'guild.upsert'; guildId: string; name: string; ownerId: string; memberCount: number }
  | { type: 'guild.remove'; guildId: string }
  | { type: 'voice.snapshot'; guildId: string; guildName: string; channelId: string; channelName: string; bindingId: string; sessionId: string; sequence: number; generatedAt: string; participants: VoiceParticipant[] }
  | { type: 'session.state'; guildId: string; channelId?: string; sessionId: string; state: 'connecting' | 'connected' | 'stopped' | 'failed'; reason?: string }
  | CommandRequest;

export interface CommandRequest {
  type: 'command.request';
  requestId: string;
  command: 'setup' | 'status' | 'privacy' | 'unlink' | 'session.start' | 'session.stop';
  guildId: string;
  channelId: string;
  userId: string;
  roleIds: string[];
  manageGuild: boolean;
  options: Record<string, string | boolean>;
}

const snowflakePattern = /^\d{17,20}$/;
const identifierPattern = /^[A-Za-z0-9_-]{8,128}$/;

export function parseSignalMessage(value: unknown): SignalToWorkerMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Signal message must be an object.');
  const message = value as Record<string, unknown>;
  const type = String(message.type || '');
  if (type === 'worker.ready') {
    const interval = message.heartbeatIntervalMs === undefined ? undefined : Number(message.heartbeatIntervalMs);
    if (interval !== undefined && (!Number.isInteger(interval) || interval < 5_000 || interval > 300_000)) throw new Error('Signal heartbeat interval is invalid.');
    return { type, ...(interval === undefined ? {} : { heartbeatIntervalMs: interval }) };
  }
  if (type === 'command.response') {
    const requestId = String(message.requestId || '');
    const text = String(message.message || '').trim();
    if (!identifierPattern.test(requestId) || !text || text.length > 1_800 || typeof message.ok !== 'boolean') throw new Error('Signal command response is invalid.');
    return { type, requestId, ok: message.ok, message: text };
  }
  if (type === 'session.start') {
    const guildId = String(message.guildId || '');
    const channelId = String(message.channelId || '');
    const bindingId = String(message.bindingId || '');
    const sessionId = String(message.sessionId || '');
    const streamerUserId = String(message.streamerUserId || '');
    const hiddenUserIds = Array.isArray(message.hiddenUserIds) ? [...new Set(message.hiddenUserIds.map(String).filter((id) => snowflakePattern.test(id)))].slice(0, 1_000) : [];
    if (![guildId, channelId].every((id) => snowflakePattern.test(id)) || !identifierPattern.test(bindingId) || !identifierPattern.test(sessionId) || (streamerUserId && !snowflakePattern.test(streamerUserId))) throw new Error('Signal session start is invalid.');
    return { type, guildId, channelId, bindingId, sessionId, ...(streamerUserId ? { streamerUserId } : {}), ...(hiddenUserIds.length ? { hiddenUserIds } : {}) };
  }
  if (type === 'session.stop') {
    const guildId = String(message.guildId || '');
    const sessionId = String(message.sessionId || '');
    const reason = String(message.reason || '').slice(0, 200);
    if (!snowflakePattern.test(guildId) || (sessionId && !identifierPattern.test(sessionId))) throw new Error('Signal session stop is invalid.');
    return { type, guildId, ...(sessionId ? { sessionId } : {}), ...(reason ? { reason } : {}) };
  }
  if (type === 'privacy.changed') {
    const guildId = String(message.guildId || '');
    const userId = String(message.userId || '');
    if (!snowflakePattern.test(guildId) || !snowflakePattern.test(userId) || typeof message.hidden !== 'boolean') throw new Error('Signal privacy update is invalid.');
    return { type, guildId, userId, hidden: message.hidden };
  }
  throw new Error(`Unsupported Signal message type: ${type || '(missing)'}.`);
}
