# Local Twitch interaction test

This phase tests the real chain without deploying a public backend:

`Twitch Local Test -> HTTPS EBS on localhost -> Studio -> Broadcast + Warudo`

The Extension secret is stored with operating-system encryption. It is never written into the Extension ZIP, Studio registry, Broadcast profile, Warudo script, or ordinary configuration files.

## One-time setup

Use **Twitch Gateway → Single-channel Extension → Prepare Certificate**. Studio asks for confirmation before adding the localhost certificate to the current Windows user's trust store. The diagnostic command-line equivalent is:

```powershell
powershell -ExecutionPolicy Bypass -File tools/create-extension-certificate.ps1 -Trust
```

In Warudo, copy `integrations/warudo/TempestPerformanceNode.cs` into the Playground folder and add **Tempest Performance Cue** to the Sound Alert blueprint. Set an exact cue, a comma-separated cue list, or a trailing wildcard such as `sound-alert.*` in **Cue Filter**. Connect Activate to the performance and Release to the restore animation. Use the node's **Test Activate** and **Test Release** buttons to validate those two flows inside Warudo before involving Studio or Twitch. The node status reports the last received cue and whether the filter accepted it; **Connections → Connect Warudo** in Studio shows the live socket status.

In Tempest Broadcast, create or reuse these sources in the scene that will be active during the test:

- an OBS Media Source for the song or sound;
- an OBS Image Source or Media Source for the image, animated GIF, or video.

Hide the visual source initially. Studio will show it, restart controllable media, and hide it when the alert duration ends. Source-name matching is exact.

## Start the local stack from Studio

The normal workflow does not require PowerShell:

1. Open **Twitch Gateway** in Studio and finish Twitch authorization.
2. In **Single-channel Extension**, confirm the numeric channel ID automatically filled from the authorized account.
3. Click **Prepare Certificate** once if the certificate status is not ready.
4. Reveal the base64 key under **Extension Client Configuration → Extension Secrets** and paste it into Studio's masked **Extension Secret Key** field.
5. Click **Start Local Panel**.

Studio validates the key without displaying it, stores it with operating-system encryption, and starts the Extension asset server, localhost EBS, and authenticated outbound relay together. The setup is restricted to the single authorized channel ID. Click **Stop** to stop the services or **Forget Secret** to stop them and remove the encrypted key.

The CLI remains available for diagnostics. Close any running Studio instance first, then set the secret and channel ID in a local PowerShell process:

```powershell
$env:TWITCH_EXTENSION_SECRET = '<your base64 Extension secret>'
$env:TEMPEST_TWITCH_CHANNEL_ID = '546679431'
pnpm local:twitch
```

The command builds the Extension for `https://localhost:8090`, then starts:

- the Extension asset server at `https://localhost:8080`;
- the local HTTPS EBS at `https://localhost:8090`;
- Tempest Streaming Studio with its authenticated EBS relay;
- the embedded Warudo adapter, which connects to the Tempest Playground node at `ws://localhost:4770`.

Keep that terminal open when using the CLI path. `Ctrl+C` stops its local services.

## Configure and test an alert

Open **Sound Alerts** in Studio. For the alert being tested:

1. Enter the exact Broadcast audio source name.
2. Enter the exact Broadcast visual source name.
3. Optionally assign local audio only if Studio itself should also play a monitor copy. Leave it unassigned to avoid doubled stream audio.
4. Save, then select **Test Full Alert**.

The Test button now requires real connected adapters. Confirm that Broadcast restarts the audio source, shows then hides the visual, and Warudo activates then releases the avatar behavior.

After that downstream test passes, open the Twitch Extension's **Local Test** view and trigger the same alert. That second test exercises the Twitch-signed JWT and the local EBS in addition to Studio, Broadcast, and Warudo.

For Twitch Local Test assets, continue using:

- Base URI: `https://localhost:8080/`
- Configuration path: `config.html`
- Viewer component path: `video_component.html`
- Panel viewer path: `panel.html` (set Panel Height to `496`)

Before submitting the Extension for review, add `https://localhost:8090` to **Allowlist for URL Fetching Domains** for this local phase. Replace it with the public EBS HTTPS origin in the hosted build. Twitch locks these allowlists after review submission.

The localhost EBS URL is compiled into `runtime-config.json`; it does not need to be typed into the Extension configuration page.

## Ready for hosted test

Localhost is only for this test phase. A hosted Twitch test still requires a public HTTPS EBS URL, a newly built Extension ZIP containing that URL, and that origin in Twitch's URL Fetching Domains allowlist.
