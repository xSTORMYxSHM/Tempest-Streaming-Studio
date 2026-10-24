export interface DiscordCompanionConfig {
  token: string;
  applicationId: string;
  developmentGuildId?: string;
  signalUrl: string;
  signalToken: string;
  selfDeaf: boolean;
  signalGraceMs: number;
  reconnectMs: number;
  radioUrl?: string;
  radioVolume: number;
  port: number;
}

const snowflakePattern = /^\d{17,20}$/;

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = String(environment[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  if (/[\r\n\0]/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function integer(environment: NodeJS.ProcessEnv, name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = String(environment[name] || '').trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  return value;
}

export function readDiscordCompanionConfig(environment: NodeJS.ProcessEnv = process.env): DiscordCompanionConfig {
  const applicationId = required(environment, 'TEMPEST_DISCORD_APPLICATION_ID');
  if (!snowflakePattern.test(applicationId)) throw new Error('TEMPEST_DISCORD_APPLICATION_ID must be a Discord snowflake.');
  const developmentGuildId = String(environment.TEMPEST_DISCORD_DEVELOPMENT_GUILD_ID || '').trim();
  if (developmentGuildId && !snowflakePattern.test(developmentGuildId)) throw new Error('TEMPEST_DISCORD_DEVELOPMENT_GUILD_ID must be a Discord snowflake.');
  const signalUrl = required(environment, 'TEMPEST_SIGNAL_DISCORD_WORKER_URL');
  const parsedSignalUrl = new URL(signalUrl);
  if (!['wss:', ...(environment.NODE_ENV === 'test' ? ['ws:'] : [])].includes(parsedSignalUrl.protocol)) {
    throw new Error('TEMPEST_SIGNAL_DISCORD_WORKER_URL must use wss://.');
  }
  const signalToken = required(environment, 'TEMPEST_SIGNAL_DISCORD_WORKER_TOKEN');
  if (signalToken.length < 32) throw new Error('TEMPEST_SIGNAL_DISCORD_WORKER_TOKEN must contain at least 32 characters.');
  const radioUrlValue = String(environment.TEMPEST_RADIO_URL || environment.RADIO_URL || '').trim();
  let radioUrl: string | undefined;
  if (radioUrlValue) {
    const parsedRadioUrl = new URL(radioUrlValue);
    if (!['http:', 'https:'].includes(parsedRadioUrl.protocol) || /[\r\n\0]/.test(radioUrlValue)) {
      throw new Error('TEMPEST_RADIO_URL must be an HTTP or HTTPS stream URL.');
    }
    radioUrl = parsedRadioUrl.toString();
  }
  return {
    token: required(environment, 'TEMPEST_DISCORD_BOT_TOKEN'),
    applicationId,
    ...(developmentGuildId ? { developmentGuildId } : {}),
    signalUrl: parsedSignalUrl.toString(),
    signalToken,
    selfDeaf: String(environment.TEMPEST_DISCORD_SELF_DEAF || '0') === '1',
    signalGraceMs: integer(environment, 'TEMPEST_DISCORD_SIGNAL_GRACE_MS', 30_000, 5_000, 300_000),
    reconnectMs: integer(environment, 'TEMPEST_DISCORD_RECONNECT_MS', 5_000, 1_000, 60_000),
    ...(radioUrl ? { radioUrl } : {}),
    radioVolume: integer(environment, 'TEMPEST_RADIO_VOLUME', 45, 1, 100),
    port: integer(environment, 'PORT', 8080, 1, 65_535)
  };
}
