import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const tempestCommand = new SlashCommandBuilder()
  .setName('tempest')
  .setDescription('Connect this Discord server with Tempest Streaming Studio.')
  .setDMPermission(false)
  .addSubcommand((command) => command
    .setName('setup')
    .setDescription('Connect this server using the code shown in Tempest Studio.')
    .addStringOption((option) => option.setName('code').setDescription('Eight-character pairing code from Tempest Studio.').setMinLength(8).setMaxLength(8).setRequired(false)))
  .addSubcommand((command) => command
    .setName('status')
    .setDescription('Show the bot, Studio binding, and live voice-session status.'))
  .addSubcommand((command) => command
    .setName('privacy')
    .setDescription('Choose whether your profile may appear in Tempest guest overlays.')
    .addBooleanOption((option) => option.setName('visible').setDescription('Allow your profile in active Tempest guest overlays.').setRequired(true)))
  .addSubcommandGroup((group) => group
    .setName('session')
    .setDescription('Control the voice session connected to Studio.')
    .addSubcommand((command) => command
      .setName('start')
      .setDescription('Start the linked Studio voice session.')
      .addChannelOption((option) => option.setName('channel').setDescription('Voice channel to follow; defaults to your current channel.').addChannelTypes(ChannelType.GuildVoice).setRequired(false))
      .addStringOption((option) => option.setName('studio').setDescription('Studio alias when this server has more than one binding.').setMaxLength(60).setRequired(false)))
    .addSubcommand((command) => command
      .setName('stop')
      .setDescription('Stop the active Studio voice session.')))
  .addSubcommandGroup((group) => group
    .setName('radio')
    .setDescription('Play Storm Horizon Radio in a voice channel.')
    .addSubcommand((command) => command
      .setName('play')
      .setDescription('Start Storm Horizon Radio in a voice channel.')
      .addChannelOption((option) => option.setName('channel').setDescription('Voice channel; defaults to your current channel.').addChannelTypes(ChannelType.GuildVoice).setRequired(false)))
    .addSubcommand((command) => command
      .setName('stop')
      .setDescription('Stop Storm Horizon Radio and leave when no Studio session is active.'))
    .addSubcommand((command) => command
      .setName('status')
      .setDescription('Show the radio playback status for this server.'))
    .addSubcommand((command) => command
      .setName('volume')
      .setDescription('Set the active radio volume for this server.')
      .addIntegerOption((option) => option.setName('percent').setDescription('Playback volume from 1 to 100 percent.').setMinValue(1).setMaxValue(100).setRequired(true))))
  .addSubcommand((command) => command
    .setName('unlink')
    .setDescription('Remove one Studio binding from this server.')
    .addStringOption((option) => option.setName('studio').setDescription('Studio alias to unlink.').setMaxLength(60).setRequired(true)))
  .setDefaultMemberPermissions(null);

export const tempestCommandJson = tempestCommand.toJSON();

export function commandNeedsManageGuild(command: string): boolean {
  return command === 'setup' || command === 'unlink' || command === 'radio.play' || command === 'radio.stop' || command === 'radio.volume';
}

export function hasManageGuild(bitfield: bigint): boolean {
  return (bitfield & PermissionFlagsBits.ManageGuild) === PermissionFlagsBits.ManageGuild;
}
