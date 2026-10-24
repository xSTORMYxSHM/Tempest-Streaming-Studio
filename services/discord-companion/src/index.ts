import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import {
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  Guild,
  GuildMember,
  PermissionFlagsBits,
  REST,
  Routes
} from 'discord.js';
import { commandNeedsManageGuild, tempestCommandJson } from './commands';
import { DiscordCompanionConfig } from './config';
import { SignalToWorkerMessage } from './protocol';
import { TempestSignalClient } from './signal-client';
import { VoiceSessionManager } from './voice-sessions';

export { readDiscordCompanionConfig } from './config';
export type { DiscordCompanionConfig } from './config';
export { tempestCommandJson, commandNeedsManageGuild } from './commands';
export { discordCompanionProtocolVersion, parseSignalMessage } from './protocol';
export type { CommandRequest, SignalToWorkerMessage, VoiceParticipant, WorkerToSignalMessage } from './protocol';
export { TempestSignalClient } from './signal-client';
export { VoiceSessionManager } from './voice-sessions';

export interface DiscordCompanionRuntime {
  client: Client;
  baseUrl: string;
  close(): Promise<void>;
}

function guildMessage(guild: Guild) {
  return { type: 'guild.upsert' as const, guildId: guild.id, name: guild.name.slice(0, 100), ownerId: guild.ownerId, memberCount: guild.memberCount };
}

function roleIds(interaction: ChatInputCommandInteraction): string[] {
  const member = interaction.member;
  if (member instanceof GuildMember) return [...member.roles.cache.keys()];
  if (member && 'roles' in member && Array.isArray(member.roles)) return member.roles.map(String);
  return [];
}

type TempestCommandName = 'setup' | 'status' | 'privacy' | 'unlink' | 'session.start' | 'session.stop' | 'radio.play' | 'radio.stop' | 'radio.status' | 'radio.volume';

function requestedCommand(interaction: ChatInputCommandInteraction): TempestCommandName {
  const group = interaction.options.getSubcommandGroup(false);
  const command = interaction.options.getSubcommand(true);
  return group ? `${group}.${command}` as TempestCommandName : command as TempestCommandName;
}

async function handleInteraction(interaction: ChatInputCommandInteraction, signal: TempestSignalClient, voices: VoiceSessionManager, config: DiscordCompanionConfig): Promise<void> {
  if (interaction.commandName !== 'tempest') return;
  if (!interaction.inCachedGuild()) {
    await interaction.reply({ content: 'Tempest commands can only be used inside a Discord server.', ephemeral: true });
    return;
  }
  const command = requestedCommand(interaction);
  const manageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true;
  if (commandNeedsManageGuild(command) && !manageGuild) {
    await interaction.reply({ content: 'You need **Manage Server** to use this command.', ephemeral: true });
    return;
  }
  if (command.startsWith('radio.')) {
    await interaction.deferReply({ ephemeral: true });
    try {
      if (command === 'radio.play') {
        const selectedChannel = interaction.options.getChannel('channel', false);
        const voiceChannelId = selectedChannel?.id || interaction.member.voice.channelId;
        if (!voiceChannelId) throw new Error('Join a voice channel or choose one in the command first.');
        await voices.playRadio(interaction.guildId, voiceChannelId, config.radioUrl, config.radioVolume);
        await interaction.editReply(`Storm Horizon Radio is now playing in <#${voiceChannelId}> at ${config.radioVolume}% volume.`);
      } else if (command === 'radio.stop') {
        await interaction.editReply(voices.stopRadio(interaction.guildId) ? 'Storm Horizon Radio stopped.' : 'Storm Horizon Radio is not playing in this server.');
      } else if (command === 'radio.volume') {
        const percent = interaction.options.getInteger('percent', true);
        await interaction.editReply(voices.setRadioVolume(interaction.guildId, percent) ? `Storm Horizon Radio volume is now ${percent}%.` : 'Start Storm Horizon Radio before changing its volume.');
      } else {
        const status = voices.radioStatus(interaction.guildId);
        await interaction.editReply(status.playing ? `Storm Horizon Radio is playing in <#${status.channelId}> at ${status.volumePercent}% volume.` : 'Storm Horizon Radio is not playing in this server.');
      }
    } catch (error) {
      await interaction.editReply(error instanceof Error ? error.message : 'Storm Horizon Radio could not complete that request.');
    }
    return;
  }
  let channelId = interaction.channelId;
  const options: Record<string, string | boolean> = {};
  if (command === 'setup') {
    const code = interaction.options.getString('code', false)?.trim().toUpperCase();
    if (code) options.code = code;
  }
  if (command === 'privacy') options.visible = interaction.options.getBoolean('visible', true);
  if (command === 'unlink' || command === 'session.start') {
    const studio = interaction.options.getString('studio', false)?.trim();
    if (studio) options.studio = studio;
  }
  if (command === 'session.start') {
    const selectedChannel = interaction.options.getChannel('channel', false);
    const memberChannelId = interaction.member.voice.channelId;
    const voiceChannelId = selectedChannel?.id || memberChannelId;
    if (!voiceChannelId) {
      await interaction.reply({ content: 'Join a voice channel or choose one in the command first.', ephemeral: true });
      return;
    }
    options.voiceChannelId = voiceChannelId;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    const signalCommand = command as Exclude<TempestCommandName, `radio.${string}`>;
    const response = await signal.request({
      command: signalCommand,
      guildId: interaction.guildId,
      channelId,
      userId: interaction.user.id,
      roleIds: roleIds(interaction),
      manageGuild,
      options
    });
    await interaction.editReply(response.message);
  } catch (error) {
    await interaction.editReply(error instanceof Error ? error.message : 'Tempest could not complete that request.');
  }
}

async function registerCommands(config: DiscordCompanionConfig): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.developmentGuildId
    ? Routes.applicationGuildCommands(config.applicationId, config.developmentGuildId)
    : Routes.applicationCommands(config.applicationId);
  await rest.put(route, { body: [tempestCommandJson] });
}

export async function startDiscordCompanion(config: DiscordCompanionConfig, logger: Pick<Console, 'info' | 'warn' | 'error'> = console): Promise<DiscordCompanionRuntime> {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  let signalGraceTimer: NodeJS.Timeout | null = null;
  let voices: VoiceSessionManager;
  const signal: TempestSignalClient = new TempestSignalClient({
    url: config.signalUrl,
    token: config.signalToken,
    applicationId: config.applicationId,
    reconnectMs: config.reconnectMs,
    guildIds: () => [...client.guilds.cache.keys()],
    sessionCount: (): number => voices?.size || 0,
    logger
  });
  voices = new VoiceSessionManager(client, { selfDeaf: config.selfDeaf, publish: (message): boolean => signal.send(message), logger });
  signal.on('ready', () => {
    if (signalGraceTimer) clearTimeout(signalGraceTimer);
    signalGraceTimer = null;
    for (const guild of client.guilds.cache.values()) signal.send(guildMessage(guild));
  });
  signal.on('disconnect', () => {
    if (signalGraceTimer) clearTimeout(signalGraceTimer);
    signalGraceTimer = setTimeout(() => voices.stopAll('Tempest Signal remained unavailable.'), config.signalGraceMs);
  });
  signal.on('message', (message: SignalToWorkerMessage) => {
    void voices.handleSignalMessage(message).catch((error: unknown) => logger.error(error));
  });
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Discord Companion signed in as ${readyClient.user.tag} in ${readyClient.guilds.cache.size} server(s).`);
    await registerCommands(config).then(
      () => logger.info(`Registered ${config.developmentGuildId ? 'development-guild' : 'global'} Discord commands.`),
      (error) => logger.error(`Discord command registration failed: ${error instanceof Error ? error.message : String(error)}`)
    );
    signal.start();
  });
  client.on(Events.GuildCreate, (guild) => signal.send(guildMessage(guild)));
  client.on(Events.GuildUpdate, (_oldGuild, guild) => signal.send(guildMessage(guild)));
  client.on(Events.GuildDelete, (guild) => {
    voices.stop(guild.id, undefined, 'Bot removed from Discord server.');
    voices.stopRadio(guild.id);
    signal.send({ type: 'guild.remove', guildId: guild.id });
  });
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) void handleInteraction(interaction, signal, voices, config).catch((error) => logger.error(error));
  });

  const healthServer = createServer((request, response) => {
    if (request.method !== 'GET' || !['/healthz', '/readyz'].includes(request.url || '')) {
      response.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: 'Not found.' }));
      return;
    }
    const ready = client.isReady() && signal.connected;
    const status = request.url === '/healthz' || ready ? 200 : 503;
    response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ status: status === 200 ? 'ok' : 'unavailable', discord: client.isReady(), signal: signal.connected, guilds: client.guilds.cache.size, sessions: voices.size, radios: voices.radioCount }));
  });
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      healthServer.once('error', reject);
      healthServer.listen(config.port, '0.0.0.0', () => resolve());
    }),
    client.login(config.token).then(() => undefined)
  ]);
  const address = healthServer.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  return {
    client,
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      if (signalGraceTimer) clearTimeout(signalGraceTimer);
      voices.stopAll('Discord Companion is stopping.');
      voices.stopAllRadios();
      await signal.close();
      client.destroy();
      await closeServer(healthServer);
    }
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
