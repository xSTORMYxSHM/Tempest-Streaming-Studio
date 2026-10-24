# Tempest Discord Companion

This service is the hosted, multi-server Discord side of Tempest Streaming Studio. It is designed to run continuously on PebbleHost while Tempest Signal owns installation, Studio pairing, authorization, and tenant routing.

## MVP features

- Installs once per Discord server and operates in many servers concurrently.
- Registers Studio pairing/session commands plus `/tempest radio play`, `/tempest radio stop`, `/tempest radio status`, and `/tempest radio volume`.
- Streams Storm Horizon Radio independently in many Discord servers, with one player and volume setting per server. Radio playback can share a channel with an active Studio guest session.
- Maintains at most one active voice session per guild while supporting sessions in many guilds at once.
- Relays bounded participant snapshots containing Discord ID, display names, avatar URL, bot/self flags, mute/deafen state, and speaking state.
- Applies privacy exclusions before a snapshot leaves the bot worker.
- Joins voice self-muted, uses DAVE encryption, and never subscribes to, decrypts, decodes, records, or stores audio. Discord must deliver encrypted voice packets because packet arrival is how the supported library determines speaking state; the packets are discarded before decryption.
- Exposes `/healthz` and `/readyz` for hosting supervision without exposing secrets or user data.
- Stops active voice sessions if Tempest Signal stays disconnected beyond the configured grace period.

## Discord access

The bot uses only the `Guilds` and `GuildVoiceStates` gateway intents. The install should request the `bot` and `applications.commands` OAuth scopes and only these bot permissions:

- View Channels
- Connect
- Speak
- Send Messages (only if a control/status text channel is enabled)
- Embed Links (only if rich session cards are enabled)

Do not grant Administrator, Speak, Move Members, Mute Members, Deafen Members, Manage Messages, Read Message History, or Message Content.

The bot intentionally appears muted but not deafened while a Studio session is active. This is required for speaking-state detection. The user-facing setup and privacy notices must disclose that encrypted voice packets reach the worker transiently even though their audio payloads are not opened or retained.

## Signal protocol

The worker makes an outbound authenticated WebSocket connection to `TEMPEST_SIGNAL_DISCORD_WORKER_URL`. All session and voice messages include a Discord guild ID and session/binding IDs. Signal must reject cross-tenant identifiers, authorize configured operator roles, persist privacy choices, and route snapshots only to the bound Studio installation.

The worker token is a service credential, not a Studio credential. Rotate it independently of the Discord bot token.

## PebbleHost

Use Node.js 24 and these commands:

```text
Install: pnpm install --frozen-lockfile
Build: pnpm --filter @tempest/discord-companion build
Start: pnpm --filter @tempest/discord-companion start
```

Copy the variables from `.env.example` into PebbleHost's secret/environment settings. Never upload a populated `.env` file or paste either token into Discord, Studio, source control, screenshots, or support messages.

The Signal worker endpoint must exist before `/readyz` reports ready. Discord application creation and the Signal endpoint are the next deployment steps; no production token is required to build or test this package.
