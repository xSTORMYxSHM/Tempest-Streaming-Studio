# Tempest Streaming Studio Twitch Extension

The viewer interface supports a Twitch **Video Component**, **Panel**, and **Mobile** surface. The Video Component stays beside the player during a stream; the Panel can be opened and tested while the channel is offline. Twitch's Local Test version paths map directly to:

- `video_component.html` — viewer signal drawer
- `panel.html` — offline-friendly channel panel
- `config.html` — broadcaster/local test configuration
- `https://localhost:8080/` — Local Test Base URI

## Channel-specific Panel design

Studio's **Panel Designer** provides a live 318 by 496 preview of the Twitch Panel. A streamer can safely customize the preset, channel/brand name, heading, title, accent/background/card/text colors, typography, grid or list cards, density, corner radius, and visibility of the logo, connection status, search, filters, and grid pattern.

Designs are stored as validated JSON in the Studio user-data directory. The local Extension includes the latest saved design in `runtime-config.json`; refreshing the Panel applies it without rebuilding Extension assets. The hosted universal Extension reads the same model from Twitch's broadcaster configuration segment or the channel's EBS record. The design model contains data only and does not accept arbitrary HTML or JavaScript.

For a public release, enable the Twitch Extension Configuration Service and allow the broadcaster configuration segment at version `1`. Each streamer then opens the Extension's **Configuration** page, designs their channel panel, and selects **Save Panel Appearance**. Twitch stores that appearance per channel while the Extension package remains universal.

For the installed channel panel, set **Panel Viewer Path** to `panel.html` and **Panel Height** to `496`. The panel is designed for Twitch's narrow 318-pixel surface and scrolls its signal catalog internally.

## Free Extension polls

When the streamer starts a numeric poll in **Live Desk**, the active question, numbered choices, and current totals are published to the free Tempest Mainframe Panel and Video Component. A viewer selects one option and, when needed, Twitch asks them to share identity. Studio records only one vote for that Twitch user across both the Extension and Twitch chat. Closing voting publishes final results; clearing the poll removes it from the Extension. Poll voting never opens a Bits purchase flow and is unavailable when the channel selects the Bits Extension edition.

## Free Extension 3D Dice

When Studio's 3D Dice overlay is enabled, the free Panel and Video Component publish d4, d6, d8, d10, d12, d20, 1–50, and d100 buttons plus a custom maximum from 2 through 100. The public service accepts only that bounded integer and constructs the safe 1–N request itself; it does not accept arbitrary dice expressions. Studio alone verifies the local Browser Source, access policy, busy state, and cooldown before starting Dice Box. One viewer roll locks every die option for that viewer for 30 seconds and the channel globally for 5 seconds. The settled result is produced only by the local physical Browser Source and is not stored by the hosted service.

## Free Extension counters

Up to 12 enabled Chatbot counter commands appear as read-only live cards with the streamer-defined label, total, and chat command. Chat increments, Studio adjustments, and counter-linked viewer interactions publish updated totals immediately. The Extension has no route that can alter a counter; it only reads the current aggregate catalog value. Disabling or deleting a counter command removes its card, and counters are not published to the Bits edition.

## Free Extension stream goal

When Studio's goal overlay is enabled, the active Twitch-native goal or Studio-managed goal appears as a compact read-only progress card in the free Panel and Video Component. The title, goal type, current and target values, unit, color, and server-recomputed percentage update through the existing Studio relay. Local overlay previews are never published, the Extension cannot change goal progress, and goals are not included in the Bits edition.

## Free Extension Now Playing

When the Chatbot has an AzuraCast Now Playing provider, Studio publishes the station name, public track metadata, provider state, last-check time, and public listen-page URL to a read-only card. The relay refreshes it every 15 seconds only while connected, uses the Chatbot's existing 15-second provider cache, and omits the provider API URL and direct audio stream URL. The **Listen** button uses Twitch's Extension URL action. The Twitch developer-console configuration must allow the broadcaster's listen-page domain for Twitch to open it. Now Playing is not published to the Bits edition.

## Run the Local Test

The recommended path is **Studio → Twitch Gateway → Single-channel Extension**. Authorize Twitch, select **Prepare HTTPS** once, paste the revealed Extension Secret into the masked field, and click **Start Local Panel**. Studio securely acquires and verifies the official mkcert helper, creates the trusted local certificate, and uses the authorized account's numeric channel ID while storing the secret with operating-system encryption. No separate certificate program or PowerShell step is required.

The commands below remain available for asset-only development and diagnostics.

Build the static package:

```powershell
pnpm extension:build
```

Create a localhost HTTPS certificate. The default command creates the certificate without trusting it:

```powershell
powershell -ExecutionPolicy Bypass -File tools/create-extension-certificate.ps1
```

If Twitch's iframe rejects the certificate, explicitly add it to the current Windows user's trusted root store:

```powershell
powershell -ExecutionPolicy Bypass -File tools/create-extension-certificate.ps1 -Trust
```

The `-Trust` switch changes the current user's Windows certificate trust store. Studio pins mkcert 1.4.4 by its official Windows x64 SHA-256 digest and falls back to Windows certificate APIs when it cannot acquire that exact build. The generated PFX, downloaded helper, and isolated CA are local development artifacts excluded from source control, Studio backups, diagnostics, and release packages. Never copy or share `rootCA-key.pem`.

Select **Remove HTTPS** in Studio when testing is complete, or use the diagnostic command below. Removal also deletes the isolated CA private key and the downloaded helper:

```powershell
powershell -ExecutionPolicy Bypass -File tools/create-extension-certificate.ps1 -Untrust
```

Start the HTTPS server:

```powershell
pnpm extension:start
```

For local visual inspection outside Twitch, an HTTP-only preview may be started on port 8081. This mode is not valid as Twitch's Base URI:

```powershell
$env:TEMPEST_EXTENSION_HTTP_PREVIEW='1'
pnpm extension:start
```

Open `https://localhost:8080/panel.html` once and accept/trust the local certificate if necessary. Keep the server running, then refresh the installed panel on Twitch. Use **View on Twitch and Install** from the Extension console if the panel is not installed yet.

## Local mock mode

`config.html` defaults to Local mock mode. It lets alert cards demonstrate accepted signals and cooldown timers without contacting a hosted service. Mock mode never calls the localhost Tempest Bridge and does not control the live stream.

Production mode requires an HTTPS Extension Backend Service URL. The Video Component sends only the selected `alertId` and a unique request ID, and supplies Twitch's current JWT through `X-Extension-JWT`.

## Production boundary

The hosted EBS now:

1. Verifies the Twitch JWT signature, expiry, `channel_id`, role, and opaque viewer identity.
2. Resolves the signed channel to a broadcaster-paired PostgreSQL installation.
3. Applies per-viewer and per-channel request limits and makes repeated request identifiers idempotent.
4. Restricts buttons to the viewer-safe catalog published by that channel's Studio and forwards accepted signals over its authenticated outbound connection.
5. Never exposes the local Tempest Bridge, relay credential, OAuth token, or local media to the Extension front end.

The public Extension Client ID belongs in front-end/EBS configuration. The shared secret belongs only in the EBS secret store. See [TWITCH_EBS.md](TWITCH_EBS.md) for deployment and Studio connection instructions.

## Build hosted assets

Official builds embed `https://signal.tempestmainframe.com` automatically. The value is public and contains no credentials or path-specific token.

```powershell
pnpm extension:build
Compress-Archive -Path 'apps/twitch-extension/dist/*' -DestinationPath 'apps/twitch-extension/tempest-twitch-extension-hosted.zip' -Force
```

Set `TEMPEST_EXTENSION_EBS_URL` only to override the official endpoint for development or self-hosting; set `TEMPEST_EXTENSION_MOCK_MODE=1` for an explicit mock build. The generated `runtime-config.json` disables mock mode by default and is shared by every viewer. Add `https://signal.tempestmainframe.com` to Twitch's **Allowlist for URL Fetching Domains** before uploading the ZIP. Twitch supplies the hosted Extension CSP, so the packaged HTML does not define its own CSP meta tag.
