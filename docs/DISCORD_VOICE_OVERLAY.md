# Discord Guests overlay

Tempest Streaming Studio provides a transparent, loopback-only Discord voice overlay at:

`http://127.0.0.1:4765/discord-voice`

Add that address to OBS, Tempest Broadcast, or another broadcaster as a Browser Source sized to the base canvas. The source contains no audio. It shows only participants in the Discord Desktop user's currently selected voice channel.

## Streamer setup

1. Open Discord Desktop and join the voice channel used on stream.
2. Open **Discord Guests** in Studio and choose **Connect Discord**.
3. Approve Tempest once in Discord.
4. Assign idle, speaking, muted, and deafened PNGs or GIFs to each participant. Speaking, mute, and deafen images are optional and fall back to the idle image or Discord avatar.
5. Select **Manual canvas placement** to drag each visible profile to its own position on the canvas preview, or keep one of the automatic layouts.
6. Turn off **Show streamer profile on canvas** or choose **Hide Streamer** if only guests should appear.
7. Use **Preview Guests** before going live, then add the Browser Source URL to the broadcaster.

Studio automatically saves every detected participant to the **Saved Guest Library** by Discord User ID. Their design remains editable after they leave voice, but an offline saved guest is never rendered in the Browser Source. **Reset Style** removes that person's custom name, images, color, placement, and visibility choices while keeping them in the library. **Forget User** removes the saved profile; an active person may be added again the next time Discord reports the channel.

For setup before a guest joins, enable **Developer Mode** in Discord, right-click the person, choose **Copy User ID**, and paste the 17–20 digit value into **Add someone before they join**. This creates an offline placeholder immediately. The streamer can assign all four state images and place the profile on the canvas, and Tempest fills in the Discord name and avatar without replacing those custom choices the next time it detects that ID in voice.

Viewers and guests do not need Tempest, a Discord developer account, a bot invite, or any server permissions. Tempest does not read messages. The saved guest library, local assignments, and overlay settings are included in Studio backups; Discord OAuth credentials are excluded.

## Discord application approval

Discord restricts RPC access to approved applications and listed testers during development. The production Tempest Discord application must be approved for the `rpc`, `identify`, and `rpc.voice.read` scopes before the one-click connection can be enabled for every end user.

The desktop application uses Discord's local IPC transport and must never contain the Discord client secret. It sends the one-time authorization code to a narrow HTTPS token-exchange service and stores the resulting token with Windows encryption.

Development builds may configure:

- `TEMPEST_DISCORD_CLIENT_ID` — the public Discord application ID.
- `TEMPEST_DISCORD_TOKEN_EXCHANGE_URL` — an HTTPS endpoint that accepts authorization-code and refresh-token grants and returns an OAuth token response using camelCase or Discord's snake_case fields.

The exchange service must validate the supplied client ID against its single configured application before exchanging the code with Discord. Keep the client secret only in the hosted service's encrypted environment. Do not implement this feature with a user token or self-bot.

Tempest Signal includes this endpoint at `/v1/discord/oauth/exchange`. Configure its deployment with `TEMPEST_DISCORD_CLIENT_ID`, `TEMPEST_DISCORD_CLIENT_SECRET`, and, when required by the Discord application, `TEMPEST_DISCORD_REDIRECT_URI`. The desktop exchange URL should then be `https://signal.tempestmainframe.com/v1/discord/oauth/exchange`.
