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

## Run the Local Test

The recommended path is **Studio → Twitch Gateway → Single-channel Extension**. Authorize Twitch, prepare the certificate once, paste the revealed Extension Secret into the masked field, and click **Start Local Panel**. Studio uses the authorized account's numeric channel ID and stores the secret with operating-system encryption.

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

The `-Trust` switch changes the current user's Windows certificate trust store. The generated PFX and certificate are local development artifacts under `.tempest-extension/` and are excluded from source control.

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

1. Verify the Twitch JWT signature with the Extension shared secret.
2. Validate expiry, `channel_id`, role, and opaque viewer identity.
3. Applies per-viewer and per-channel request limits and makes repeated request identifiers idempotent.
4. Forward accepted signals over an authenticated outbound connection maintained by Studio.
5. Never expose the local Tempest Bridge or its installation token to the Extension front end.

The public Extension Client ID belongs in front-end/EBS configuration. The shared secret belongs only in the EBS secret store. See [TWITCH_EBS.md](TWITCH_EBS.md) for deployment and Studio connection instructions.

## Build hosted assets

Set the public EBS origin before building. This value is public; it must not contain credentials or a path-specific token.

```powershell
$env:TEMPEST_EXTENSION_EBS_URL='https://extensions.example.com'
pnpm extension:build
Compress-Archive -Path 'apps/twitch-extension/dist/*' -DestinationPath 'apps/twitch-extension/tempest-twitch-extension-hosted.zip' -Force
```

The generated `runtime-config.json` disables mock mode and is shared by every viewer. Add the same HTTPS origin to Twitch's **Allowlist for URL Fetching Domains** before uploading the ZIP. Twitch supplies the hosted Extension CSP, so the packaged HTML does not define its own CSP meta tag.
