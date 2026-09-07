# Discord Guests overlay

Tempest Streaming Studio provides a transparent, loopback-only Discord voice overlay at:

`http://127.0.0.1:4765/discord-voice`

Add that address to OBS, Tempest Broadcast, or another broadcaster as a Browser Source sized to the base canvas. The source contains no audio. It shows only participants in the Discord Desktop user's currently selected voice channel.

## Streamer setup

1. Open Discord Desktop and join the voice channel used on stream.
2. Open **Discord Guests** in Studio and choose **Connect Discord**.
3. Approve Tempest once in Discord.
4. Assign an idle PNG or GIF and, optionally, a speaking PNG or GIF to each participant.
5. Use **Preview Guests** before going live, then add the Browser Source URL to the broadcaster.

Viewers and guests do not need Tempest, a Discord developer account, a bot invite, or any server permissions. Tempest does not read messages. Local assignments and overlay settings are included in Studio backups; Discord OAuth credentials are excluded.

## Discord application approval

Discord restricts RPC access to approved applications and listed testers during development. The production Tempest Discord application must be approved for the `rpc`, `identify`, and `rpc.voice.read` scopes before the one-click connection can be enabled for every end user.

The desktop application uses Discord's local IPC transport and must never contain the Discord client secret. It sends the one-time authorization code to a narrow HTTPS token-exchange service and stores the resulting token with Windows encryption.

Development builds may configure:

- `TEMPEST_DISCORD_CLIENT_ID` — the public Discord application ID.
- `TEMPEST_DISCORD_TOKEN_EXCHANGE_URL` — an HTTPS endpoint that accepts authorization-code and refresh-token grants and returns an OAuth token response using camelCase or Discord's snake_case fields.

The exchange service must validate the supplied client ID against its single configured application before exchanging the code with Discord. Keep the client secret only in the hosted service's encrypted environment. Do not implement this feature with a user token or self-bot.

Tempest Signal includes this endpoint at `/v1/discord/oauth/exchange`. Configure its deployment with `TEMPEST_DISCORD_CLIENT_ID`, `TEMPEST_DISCORD_CLIENT_SECRET`, and, when required by the Discord application, `TEMPEST_DISCORD_REDIRECT_URI`. The desktop exchange URL should then be `https://signal.tempestmainframe.com/v1/discord/oauth/exchange`.
