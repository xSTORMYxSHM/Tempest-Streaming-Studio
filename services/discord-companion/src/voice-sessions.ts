import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus
} from '@discordjs/voice';
import { ChildProcess, spawn, spawnSync } from 'node:child_process';
import { Client, Guild, VoiceState } from 'discord.js';
import ffmpegPath from 'ffmpeg-static';
import { SignalToWorkerMessage, VoiceParticipant, VoiceSessionStart, WorkerToSignalMessage } from './protocol';

interface ActiveVoiceSession {
  bindingId: string;
  sessionId: string;
  channelId: string;
  streamerUserId?: string;
  hiddenUserIds: Set<string>;
  speakingUserIds: Set<string>;
  connection: VoiceConnection;
  sequence: number;
}

interface ActiveRadioSession {
  channelId: string;
  player: AudioPlayer;
  volumePercent: number;
  connection: VoiceConnection;
  ffmpeg?: ChildProcess;
  ffmpegLog: string;
}

export interface VoiceSessionManagerOptions {
  selfDeaf: boolean;
  publish(message: WorkerToSignalMessage): boolean;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export class VoiceSessionManager {
  private readonly sessions = new Map<string, ActiveVoiceSession>();
  private readonly radios = new Map<string, ActiveRadioSession>();
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>;
  private readonly ffmpegExecutable: string;
  private readonly ffmpegBackend: 'configured' | 'system' | 'static';

  constructor(private readonly client: Client, private readonly options: VoiceSessionManagerOptions) {
    this.logger = options.logger || console;
    const configuredFfmpeg = String(process.env.TEMPEST_FFMPEG_PATH || process.env.FFMPEG_PATH || '').trim();
    if (configuredFfmpeg && this.canRunFfmpeg(configuredFfmpeg)) {
      this.ffmpegExecutable = configuredFfmpeg;
      this.ffmpegBackend = 'configured';
    } else if (this.canRunFfmpeg('ffmpeg')) {
      this.ffmpegExecutable = 'ffmpeg';
      this.ffmpegBackend = 'system';
    } else if (ffmpegPath) {
      this.ffmpegExecutable = ffmpegPath;
      this.ffmpegBackend = 'static';
    } else {
      this.ffmpegExecutable = 'ffmpeg';
      this.ffmpegBackend = 'system';
    }
    if (configuredFfmpeg && this.ffmpegBackend !== 'configured') {
      this.logger.warn('Configured FFmpeg could not be started; using the available fallback.');
    }
    this.logger.info(`Storm Horizon Radio FFmpeg backend: ${this.ffmpegBackend}.`);
    client.on('voiceStateUpdate', (oldState, newState) => this.onVoiceStateUpdate(oldState, newState));
  }

  get size(): number {
    return this.sessions.size;
  }

  get radioCount(): number {
    return this.radios.size;
  }

  radioStatus(guildId: string): { playing: boolean; channelId?: string; volumePercent?: number } {
    const radio = this.radios.get(guildId);
    return radio ? { playing: true, channelId: radio.channelId, volumePercent: radio.volumePercent } : { playing: false };
  }

  async playRadio(guildId: string, channelId: string, streamUrl: string | undefined, volumePercent: number): Promise<void> {
    if (!streamUrl) throw new Error('Storm Horizon Radio is not configured on this bot yet.');
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('This Discord server is unavailable.');
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isVoiceBased() || channel.isDMBased()) throw new Error('Choose a valid voice channel.');
    const studioSession = this.sessions.get(guildId);
    if (studioSession && studioSession.channelId !== channelId) {
      throw new Error(`The active Tempest Studio session is using <#${studioSession.channelId}>. Start the radio there or stop the Studio session first.`);
    }
    const previous = this.radios.get(guildId);
    previous?.player.stop(true);
    this.radios.delete(guildId);
    let connection = getVoiceConnection(guildId);
    if (connection && connection.joinConfig.channelId !== channelId) {
      connection.destroy();
      connection = undefined;
    }
    connection ||= joinVoiceChannel({
      channelId,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfMute: false,
      selfDeaf: studioSession ? this.options.selfDeaf : true,
      daveEncryption: true
    });
    connection.rejoin({ channelId, selfMute: false, selfDeaf: studioSession ? this.options.selfDeaf : true });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play, maxMissedFrames: 250 } });
    const radio: ActiveRadioSession = { channelId, player, volumePercent, connection, ffmpegLog: '' };
    this.radios.set(guildId, radio);
    player.on('error', (error) => {
      if (this.radios.get(guildId) !== radio) return;
      this.logger.error(`Storm Horizon Radio player failed for guild ${guildId}: ${error.message}`);
      this.stopRadio(guildId);
    });
    player.on('stateChange', (oldState, newState) => {
      if (this.radios.get(guildId) !== radio || oldState.status === newState.status) return;
      this.logger.info(`Storm Horizon Radio player for guild ${guildId}: ${oldState.status} -> ${newState.status}.`);
      if (oldState.status !== AudioPlayerStatus.Idle && newState.status === AudioPlayerStatus.Idle) this.stopRadio(guildId);
    });
    connection.on('error', (error) => {
      if (this.radios.get(guildId) !== radio) return;
      this.logger.error(`Storm Horizon Radio voice connection failed for guild ${guildId}: ${error.message}`);
      this.stopRadio(guildId);
    });
    connection.on('stateChange', (_oldState, newState) => {
      if (newState.status !== VoiceConnectionStatus.Destroyed || this.radios.get(guildId) !== radio) return;
      player.stop(true);
      this.radios.delete(guildId);
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      const subscription = connection.subscribe(player);
      if (!subscription) throw new Error('Discord refused the radio audio subscription. Check the bot\'s Speak permission.');
      const resource = this.createRadioResource(guildId, radio, streamUrl);
      resource.volume?.setVolume(volumePercent / 100);
      player.play(resource);
      await entersState(player, AudioPlayerStatus.Playing, 15_000);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      if (player.state.status !== AudioPlayerStatus.Playing || this.radios.get(guildId) !== radio) {
        const detail = radio.ffmpegLog.trim();
        throw new Error(`The radio stream ended before playback stabilized.${detail ? ` FFmpeg: ${detail.slice(-500)}` : ''}`);
      }
      this.logger.info(`Storm Horizon Radio connected and playing for guild ${guildId}.`);
    } catch (error) {
      if (this.radios.get(guildId) === radio) this.stopRadio(guildId);
      throw error;
    }
  }

  stopRadio(guildId: string): boolean {
    const radio = this.radios.get(guildId);
    if (!radio) return false;
    this.radios.delete(guildId);
    radio.player.stop(true);
    if (radio.ffmpeg && !radio.ffmpeg.killed) radio.ffmpeg.kill('SIGKILL');
    const studioSession = this.sessions.get(guildId);
    if (studioSession) radio.connection.rejoin({ channelId: studioSession.channelId, selfMute: true, selfDeaf: this.options.selfDeaf });
    else if (radio.connection.state.status !== VoiceConnectionStatus.Destroyed) radio.connection.destroy();
    this.logger.info(`Storm Horizon Radio stopped for guild ${guildId}.`);
    return true;
  }

  setRadioVolume(guildId: string, volumePercent: number): boolean {
    const radio = this.radios.get(guildId);
    if (!radio) return false;
    radio.volumePercent = Math.max(1, Math.min(100, Math.round(volumePercent)));
    const resource = radio.player.state.status === 'idle' ? undefined : radio.player.state.resource;
    resource?.volume?.setVolume(radio.volumePercent / 100);
    return true;
  }

  stopAllRadios(): void {
    for (const guildId of [...this.radios.keys()]) this.stopRadio(guildId);
  }

  async handleSignalMessage(message: SignalToWorkerMessage): Promise<void> {
    if (message.type === 'session.start') await this.start(message);
    else if (message.type === 'session.stop') this.stop(message.guildId, message.sessionId, message.reason || 'Stopped by Tempest Signal.');
    else if (message.type === 'privacy.changed') this.setPrivacy(message.guildId, message.userId, message.hidden);
  }

  async start(input: VoiceSessionStart): Promise<void> {
    const guild = this.client.guilds.cache.get(input.guildId);
    if (!guild) {
      this.publishState(input.guildId, input.sessionId, 'failed', 'The bot is not installed in that server.');
      return;
    }
    const channel = guild.channels.cache.get(input.channelId);
    if (!channel?.isVoiceBased() || channel.isDMBased()) {
      this.publishState(input.guildId, input.sessionId, 'failed', 'The configured voice channel is unavailable.');
      return;
    }
    const existing = this.sessions.get(input.guildId);
    if (existing) this.stop(input.guildId, undefined, 'Replaced by a new session.');
    const radio = this.radios.get(input.guildId);
    if (radio && radio.channelId !== input.channelId) this.stopRadio(input.guildId);
    this.publishState(input.guildId, input.sessionId, 'connecting');
    try {
      const connection = joinVoiceChannel({
        channelId: input.channelId,
        guildId: input.guildId,
        adapterCreator: guild.voiceAdapterCreator,
        selfMute: !this.radios.has(input.guildId),
        selfDeaf: this.options.selfDeaf,
        daveEncryption: true
      });
      const session: ActiveVoiceSession = {
        bindingId: input.bindingId,
        sessionId: input.sessionId,
        channelId: input.channelId,
        ...(input.streamerUserId ? { streamerUserId: input.streamerUserId } : {}),
        hiddenUserIds: new Set(input.hiddenUserIds || []),
        speakingUserIds: new Set(),
        connection,
        sequence: 0
      };
      this.sessions.set(input.guildId, session);
      connection.receiver.speaking.on('start', (userId) => {
        if (this.sessions.get(input.guildId) !== session || session.hiddenUserIds.has(userId)) return;
        session.speakingUserIds.add(userId);
        this.publishSnapshot(guild, session);
      });
      connection.receiver.speaking.on('end', (userId) => {
        if (this.sessions.get(input.guildId) !== session) return;
        session.speakingUserIds.delete(userId);
        this.publishSnapshot(guild, session);
      });
      connection.on('stateChange', (_oldState, newState) => {
        if (this.sessions.get(input.guildId) !== session) return;
        if (newState.status === VoiceConnectionStatus.Destroyed) {
          this.sessions.delete(input.guildId);
          const activeRadio = this.radios.get(input.guildId);
          activeRadio?.player.stop(true);
          this.radios.delete(input.guildId);
        }
      });
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      this.publishState(input.guildId, input.sessionId, 'connected');
      this.publishSnapshot(guild, session);
      this.logger.info(`Discord voice session connected for guild ${input.guildId}.`);
    } catch (error) {
      const active = this.sessions.get(input.guildId);
      if (active?.sessionId === input.sessionId) {
        active.connection.destroy();
        this.sessions.delete(input.guildId);
      }
      this.publishState(input.guildId, input.sessionId, 'failed', error instanceof Error ? error.message : 'Discord voice connection failed.');
    }
  }

  stop(guildId: string, sessionId?: string, reason = 'Session stopped.'): void {
    const session = this.sessions.get(guildId);
    if (!session || (sessionId && session.sessionId !== sessionId)) return;
    this.sessions.delete(guildId);
    const connection = getVoiceConnection(guildId) || session.connection;
    const radio = this.radios.get(guildId);
    if (radio) connection.rejoin({ channelId: radio.channelId, selfMute: false, selfDeaf: true });
    else if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
    this.publishState(guildId, session.sessionId, 'stopped', reason);
    this.logger.info(`Discord voice session stopped for guild ${guildId}.`);
  }

  stopAll(reason: string): void {
    for (const guildId of [...this.sessions.keys()]) this.stop(guildId, undefined, reason);
  }

  setPrivacy(guildId: string, userId: string, hidden: boolean): void {
    const session = this.sessions.get(guildId);
    if (!session) return;
    if (hidden) {
      session.hiddenUserIds.add(userId);
      session.speakingUserIds.delete(userId);
    } else session.hiddenUserIds.delete(userId);
    const guild = this.client.guilds.cache.get(guildId);
    if (guild) this.publishSnapshot(guild, session);
  }

  private onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const guildId = newState.guild.id || oldState.guild.id;
    const session = this.sessions.get(guildId);
    if (!session) return;
    if (oldState.channelId !== session.channelId && newState.channelId !== session.channelId) return;
    if (newState.channelId !== session.channelId) session.speakingUserIds.delete(newState.id);
    this.publishSnapshot(newState.guild, session);
  }

  private createRadioResource(guildId: string, radio: ActiveRadioSession, streamUrl: string): AudioResource {
    const ffmpeg = spawn(this.ffmpegExecutable, [
      '-hide_banner',
      '-loglevel',
      'warning',
      '-reconnect',
      '1',
      '-reconnect_streamed',
      '1',
      '-reconnect_delay_max',
      '5',
      '-i',
      streamUrl,
      '-vn',
      '-ac',
      '2',
      '-ar',
      '48000',
      '-f',
      's16le',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    radio.ffmpeg = ffmpeg;
    ffmpeg.stderr?.setEncoding('utf8');
    ffmpeg.stderr?.on('data', (chunk: string) => {
      radio.ffmpegLog = `${radio.ffmpegLog}${chunk}`.slice(-4_000);
    });
    ffmpeg.on('error', (error) => {
      radio.ffmpegLog = `${radio.ffmpegLog}\n${error.message}`.slice(-4_000);
      ffmpeg.stdout?.destroy(error);
    });
    ffmpeg.on('exit', (code, signal) => {
      if (this.radios.get(guildId) !== radio) return;
      this.logger.warn(`Storm Horizon Radio FFmpeg exited for guild ${guildId} (code ${String(code)}, signal ${String(signal)}).${radio.ffmpegLog.trim() ? ` ${radio.ffmpegLog.trim().slice(-500)}` : ''}`);
    });
    if (!ffmpeg.stdout) throw new Error('FFmpeg did not provide a radio audio stream.');
    return createAudioResource(ffmpeg.stdout, { inputType: StreamType.Raw, inlineVolume: true });
  }

  private canRunFfmpeg(executable: string): boolean {
    const probe = spawnSync(executable, ['-version'], {
      stdio: 'ignore',
      timeout: 5_000,
      windowsHide: true
    });
    return !probe.error && probe.status === 0;
  }

  private participants(guild: Guild, session: ActiveVoiceSession): VoiceParticipant[] {
    return [...guild.voiceStates.cache.values()]
      .filter((state) => state.channelId === session.channelId && !session.hiddenUserIds.has(state.id))
      .map((state) => {
        const user = state.member?.user;
        return {
          id: state.id,
          username: user?.username || 'Discord user',
          displayName: state.member?.displayName || user?.globalName || user?.username || 'Discord user',
          avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 256 }) || '',
          bot: user?.bot === true,
          self: state.id === session.streamerUserId,
          mute: state.selfMute === true || state.serverMute === true,
          deaf: state.selfDeaf === true || state.serverDeaf === true,
          speaking: session.speakingUserIds.has(state.id)
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private publishSnapshot(guild: Guild, session: ActiveVoiceSession): void {
    session.sequence += 1;
    this.options.publish({
      type: 'voice.snapshot',
      guildId: guild.id,
      guildName: guild.name,
      channelId: session.channelId,
      channelName: guild.channels.cache.get(session.channelId)?.name || 'Discord voice',
      bindingId: session.bindingId,
      sessionId: session.sessionId,
      sequence: session.sequence,
      generatedAt: new Date().toISOString(),
      participants: this.participants(guild, session)
    });
  }

  private publishState(guildId: string, sessionId: string, state: 'connecting' | 'connected' | 'stopped' | 'failed', reason?: string): void {
    this.options.publish({ type: 'session.state', guildId, sessionId, state, ...(reason ? { reason: reason.slice(0, 200) } : {}) });
  }
}
