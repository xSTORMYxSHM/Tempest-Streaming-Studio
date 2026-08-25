# Twitch Extension Backend Service

`services/twitch-ebs` is the public trust boundary between Twitch viewers and Tempest Streaming Studio. It verifies Twitch's HS256 Extension JWT with the base64-decoded Extension secret, restricts requests to explicitly configured channel IDs, rejects anonymous viewers by default, rate-limits requests, deduplicates request IDs, and forwards normalized events only while Studio has an authenticated outbound connection.

The Extension shared secret and relay token never enter the Extension ZIP. The local Bridge remains bound to `127.0.0.1` and is never exposed through a tunnel or port forward.

## Required values

Create or collect these values before deployment:

- `TWITCH_EXTENSION_SECRETS` — comma-separated active base64 secrets from the Extension's **Secret Keys** settings. A comma-separated list permits safe secret rotation.
- `TEMPEST_EBS_RELAY_TOKEN` — a new random value of at least 32 characters, shared only by the EBS and Studio.
- `TEMPEST_EBS_CHANNEL_IDS` — comma-separated numeric Twitch channel IDs allowed to use this installation.
- `TEMPEST_EBS_ALLOWED_ACTIONS` — optional comma-separated generic workflow actions such as `tempest.blackhole`. Sound Alert catalog IDs are handled by their dedicated route and do not belong here.
- `TEMPEST_EBS_ALLOWED_ORIGINS` — optional exact origins in addition to Twitch's `https://<extension-id>.ext-twitch.tv` origins. Add `https://localhost:8080` only when testing the production path locally.

Generate a relay token in PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
```

## Deploy the EBS

Deploy from the repository root with `services/twitch-ebs/Dockerfile`, or run the compiled Node service behind an HTTPS reverse proxy. The hosting platform must support WebSocket upgrades on `/v1/studio` and should keep one service instance active for this single-channel deployment.

Configure these secret/environment values on the host:

```text
TWITCH_EXTENSION_SECRETS=<base64 Extension secret>
TEMPEST_EBS_RELAY_TOKEN=<random relay token>
TEMPEST_EBS_CHANNEL_IDS=<numeric channel ID>
TEMPEST_EBS_ALLOWED_ACTIONS=tempest.blackhole
PORT=8080
```

The public endpoints are:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service and connected-channel readiness |
| `GET` | `/v1/extension/status` | JWT-authenticated Studio connection state |
| `POST` | `/v1/extension/alerts/{alertId}/trigger` | Trigger a Studio catalog Sound Alert |
| `POST` | `/v1/extension/interactions/{action}/trigger` | Trigger an explicitly allowlisted generic workflow action |
| WebSocket | `/v1/studio` | Authenticated outbound Studio relay |

Confirm `https://<your-ebs-host>/health` returns `status: "online"`. Add `https://<your-ebs-host>` to the Twitch version's **Allowlist for URL Fetching Domains**.

## Connect Studio

Set the relay URL, the same relay token, and the numeric channel ID before starting Studio:

```powershell
$env:TEMPEST_EXTENSION_RELAY_URL='wss://extensions.example.com/v1/studio'
$env:TEMPEST_EXTENSION_RELAY_TOKEN='<same random relay token>'
$env:TEMPEST_EXTENSION_CHANNEL_ID='<numeric channel ID>'
pnpm dev
```

Studio's Twitch page reports **EXTENSION RELAY: CONNECTED** when the EBS accepts the connection. The relay reconnects with bounded exponential backoff if the network or EBS restarts.

## Build and upload the Extension

Build the viewer ZIP against the public EBS origin:

```powershell
$env:TEMPEST_EXTENSION_EBS_URL='https://extensions.example.com'
pnpm extension:build
Compress-Archive -Path 'apps/twitch-extension/dist/*' -DestinationPath 'apps/twitch-extension/tempest-twitch-extension-hosted.zip' -Force
```

Upload the ZIP on Twitch's **Files** tab and move the version to Hosted Test. The built `runtime-config.json` contains only the public EBS origin and locks mock mode off.

## Runtime path

1. Twitch supplies a refreshed viewer JWT to the Video Component.
2. The component sends the JWT, selected alert ID, and a UUID request ID to the EBS.
3. The EBS verifies the JWT and channel, checks anonymity policy, replay state, action allowlists, and request rates, then sends a canonical event to Studio.
4. Studio validates and deduplicates the event again, resolves the Sound Alert catalog, applies safety/concurrency/cooldowns, and creates a workflow run.
5. Warudo receives `avatar.performance.apply`; Tempest Broadcast receives `broadcast.reaction.trigger`. Both receive lease-based release commands when the performance ends.

For a real end-to-end test before public deployment, follow [LOCAL_TWITCH_TEST.md](LOCAL_TWITCH_TEST.md). It runs this EBS over trusted localhost HTTPS and uses the same Twitch JWT verification and Studio relay path.

If Studio, Warudo, or Broadcast is offline, the Bridge records unavailable delivery rather than exposing any local service publicly. Emergency Restore continues to stop local audio, release active actions, and disarm new viewer interactions.
