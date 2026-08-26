# Twitch Extension Backend Service

`services/twitch-ebs` is the public trust boundary between Twitch viewers and Tempest Streaming Studio. It verifies Twitch's HS256 Extension JWT with the base64-decoded Extension secret, resolves the JWT channel to a PostgreSQL-backed Studio installation, rejects anonymous viewers by default, rate-limits requests, deduplicates request IDs, and forwards normalized events only while that installation has an authenticated outbound connection.

The Extension shared secret and relay token never enter the Extension ZIP. The local Bridge remains bound to `127.0.0.1` and is never exposed through a tunnel or port forward.

## Required values

Create or collect these values before deployment:

- `TWITCH_EXTENSION_SECRETS` — comma-separated active base64 secrets from the Extension's **Secret Keys** settings. A comma-separated list permits safe secret rotation.
- `DATABASE_URL` — PostgreSQL connection URL used for channel installations, hashed relay credentials, and public-safe signal catalogs.
- `TEMPEST_EBS_TWITCH_CLIENT_IDS` — comma-separated public Twitch application client IDs accepted when Studio proves broadcaster ownership during pairing.
- `TEMPEST_EBS_ALLOWED_ORIGINS` — optional exact origins in addition to Twitch's `https://<extension-id>.ext-twitch.tv` origins. Add `https://localhost:8080` only when testing the production path locally.

Relay credentials are generated per Studio installation by the EBS, stored only as SHA-256 hashes in PostgreSQL, returned once over HTTPS, and encrypted by Studio with Windows credential protection. Public users never create or copy relay tokens.

## Deploy the EBS

Deploy the repository's root `Dockerfile`, use `services/twitch-ebs/Dockerfile` as an explicit custom Dockerfile, or run the compiled Node service behind an HTTPS reverse proxy. The hosting platform must support WebSocket upgrades on `/v1/studio`. Keep one live EBS replica during the initial public deployment because connected Studio sockets are process-local; PostgreSQL safely persists installation state across deployments.

Configure these secret/environment values on the host:

```text
TWITCH_EXTENSION_SECRETS=<base64 Extension secret>
DATABASE_URL=<PostgreSQL connection URL>
TEMPEST_EBS_TWITCH_CLIENT_IDS=<Studio Twitch application client ID>
```

### Railway

The repository's root `Dockerfile` is the Railway entry point and starts only the Twitch EBS. Connect Railway to the GitHub repository with the repository root as its source directory. Do not set a custom build or start command.

Add a PostgreSQL service to the same Railway project first. Railway normally names it `Postgres`; use a reference variable so the password remains managed by Railway rather than copied into Git or Studio.

In the service's **Variables** tab, add:

```text
TWITCH_EXTENSION_SECRETS=<base64 Extension secret>
DATABASE_URL=${{Postgres.DATABASE_URL}}
TEMPEST_EBS_TWITCH_CLIENT_IDS=<Studio Twitch application client ID>
```

Do not add `PORT`, TLS certificate, or TLS password variables on Railway. Railway supplies the port and terminates public HTTPS. Twitch Extension origins matching `https://<extension-id>.ext-twitch.tv` are accepted automatically, so `TEMPEST_EBS_ALLOWED_ORIGINS` is not needed for the hosted Extension.

In **Settings**:

1. Set the healthcheck path to `/health`.
2. Keep one replica for the initial WebSocket relay deployment. PostgreSQL persists installations; a future shared live-connection layer can enable horizontal replicas safely.
3. Generate a public Railway domain.
4. Prefer a US West region for a Seattle-based Studio connection when that region is available.

After deployment, open `https://<railway-domain>/health`. A successful response reports `"status":"online"`; `studioConnections` may remain `0` until Studio is configured with the relay URL and restarted.

The public endpoints are:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service and connected-channel readiness |
| `POST` | `/v1/installations/pair` | Validate Studio's Twitch OAuth identity and issue one per-installation relay credential |
| `GET` / `DELETE` | `/v1/installations/current` | Inspect or revoke the authenticated Studio installation |
| `GET` | `/v1/extension/status` | JWT-authenticated Studio connection state |
| `GET` | `/v1/extension/catalog` | Channel-scoped, viewer-safe signal catalog published by Studio |
| `POST` | `/v1/extension/alerts/{alertId}/trigger` | Trigger a Studio catalog Sound Alert |
| `POST` | `/v1/extension/interactions/{action}/trigger` | Trigger a generic action published in that installation's viewer-safe catalog |
| WebSocket | `/v1/studio` | Authenticated outbound Studio relay |

Confirm `https://<your-ebs-host>/health` returns `status: "online"`. Add `https://<your-ebs-host>` to the Twitch version's **Allowlist for URL Fetching Domains**.

## Connect Studio

Authorize the broadcaster in Studio's **Twitch Gateway**, enter the Railway HTTPS domain under **Public Extension Service**, and select **Pair Hosted Extension**. Studio sends the existing Twitch user access token directly to the EBS for validation, receives a unique relay credential, and stores it with Windows encryption. The EBS does not store the Twitch OAuth token.

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
3. The EBS verifies the JWT and channel, resolves the active PostgreSQL installation, checks anonymity policy, replay state, the channel-published catalog, and request rates, then sends a canonical event to that Studio.
4. Studio validates and deduplicates the event again, resolves the Sound Alert catalog, applies safety/concurrency/cooldowns, and creates a workflow run.
5. Warudo receives `avatar.performance.apply`; Tempest Broadcast receives `broadcast.reaction.trigger`. Both receive lease-based release commands when the performance ends.

For a real end-to-end test before public deployment, follow [LOCAL_TWITCH_TEST.md](LOCAL_TWITCH_TEST.md). It runs this EBS over trusted localhost HTTPS and uses the same Twitch JWT verification and Studio relay path.

If Studio, Warudo, or Broadcast is offline, the Bridge records unavailable delivery rather than exposing any local service publicly. Emergency Restore continues to stop local audio, release active actions, and disarm new viewer interactions.
