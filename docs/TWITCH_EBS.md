# Twitch Extension Backend Service

`services/twitch-ebs` is the public trust boundary between Twitch viewers and Tempest Streaming Studio. It verifies Twitch's HS256 Extension JWT with the base64-decoded Extension secret, resolves the JWT channel to a PostgreSQL-backed Studio installation, rejects anonymous viewers by default, rate-limits requests, deduplicates request IDs, and forwards normalized events only while that installation has an authenticated outbound connection.

The Extension shared secret and relay token never enter the Extension ZIP. The local Bridge remains bound to `127.0.0.1` and is never exposed through a tunnel or port forward.

## Required values

Create or collect these values before deployment:

- `TWITCH_EXTENSION_SECRETS` — comma-separated active base64 secrets from Tempest Mainframe's **Secret Keys** settings. A comma-separated list permits safe secret rotation.
- `TEMPEST_STREAMING_EXTENSION_SECRETS` — comma-separated active base64 secrets from the separate Tempest Streaming companion.
- `TEMPEST_STREAMING_EXTENSION_CLIENT_ID` — the public Client ID for the Tempest Streaming companion listing.
- `DATABASE_URL` — PostgreSQL connection URL used for channel installations, hashed relay credentials, and public-safe signal catalogs.
- `TEMPEST_EBS_TWITCH_CLIENT_IDS` — comma-separated public Twitch application client IDs accepted when Studio proves broadcaster ownership during pairing.
- `TEMPEST_EBS_ALLOWED_ORIGINS` — optional exact origins in addition to Twitch's `https://<extension-id>.ext-twitch.tv` origins. Add `https://localhost:8080` only when testing the production path locally.

Relay credentials are generated per Studio installation by the EBS, stored only as SHA-256 hashes in PostgreSQL, returned once over HTTPS, and encrypted by Studio with Windows credential protection. Public users never create or copy relay tokens.

## Deploy the EBS

Deploy the repository's root `Dockerfile`, use `services/twitch-ebs/Dockerfile` as an explicit custom Dockerfile, or run the compiled Node service behind an HTTPS reverse proxy. The hosting platform must support WebSocket upgrades on `/v1/studio`. Keep one live EBS replica during the initial public deployment because connected Studio sockets are process-local; PostgreSQL safely persists installation state across deployments.

Configure these secret/environment values on the host:

```text
TWITCH_EXTENSION_SECRETS=<base64 Extension secret>
TEMPEST_STREAMING_EXTENSION_CLIENT_ID=<streaming Extension client ID>
TEMPEST_STREAMING_EXTENSION_SECRETS=<base64 Streaming Extension secret>
DATABASE_URL=<PostgreSQL connection URL>
TEMPEST_EBS_TWITCH_CLIENT_IDS=n04l25zbygbsnq6nj7gupboyeji820
```

### Railway

The repository's root `Dockerfile` is the Railway entry point and starts only the Twitch EBS. Its final image contains the production EBS package and runtime dependencies rather than the desktop, Extension sources, tests, or monorepo development dependencies. It runs as the unprivileged Node user and includes an HTTP healthcheck. Connect Railway to the GitHub repository with the repository root as its source directory. Do not set a custom build or start command.

Add a PostgreSQL service to the same Railway project first. Railway normally names it `Postgres`; use a reference variable so the password remains managed by Railway rather than copied into Git or Studio.

In the service's **Variables** tab, add:

```text
TWITCH_EXTENSION_SECRETS=<base64 Extension secret>
TEMPEST_STREAMING_EXTENSION_CLIENT_ID=<streaming Extension client ID>
TEMPEST_STREAMING_EXTENSION_SECRETS=<base64 Streaming Extension secret>
DATABASE_URL=${{Postgres.DATABASE_URL}}
TEMPEST_EBS_TWITCH_CLIENT_IDS=n04l25zbygbsnq6nj7gupboyeji820
```

Do not add `PORT`, TLS certificate, or TLS password variables on Railway. Railway supplies the port and terminates public HTTPS. Twitch Extension origins matching `https://<extension-id>.ext-twitch.tv` are accepted automatically, so `TEMPEST_EBS_ALLOWED_ORIGINS` is not needed for the hosted Extension.

For an existing pre-1.7.0 Tempest Streaming deployment, copy the existing Streaming listing's Client ID and secret into `TEMPEST_STREAMING_EXTENSION_CLIENT_ID` and `TEMPEST_STREAMING_EXTENSION_SECRETS` before deploying this build. The old names `TEMPEST_BITS_EXTENSION_CLIENT_ID`, `TEMPEST_BITS_EXTENSION_SECRETS`, and `TEMPEST_BITS_PRODUCT_ACTIONS` belong only to the deprecated paid-action compatibility path. Remove those legacy variables after rollback compatibility is no longer required; do not expose or paste their values into source files, logs, or Twitch-hosted assets.

In **Settings**:

1. Set the healthcheck path to `/health`.
2. Keep one replica for the initial WebSocket relay deployment. PostgreSQL persists installations; a future shared live-connection layer can enable horizontal replicas safely.
3. Generate a public Railway domain.
4. Prefer a US West region for a Seattle-based Studio connection when that region is available.

Keep those Railway settings in the service dashboard. Do not add a new `railway.json` or `railway.toml`: Railway has deprecated its legacy Config-as-Code path for new services. The repository Dockerfile remains the versioned build boundary, while Railway owns its healthcheck path, replica count, region, domain, and secret references.

After deployment, open `https://<railway-domain>/health`. A successful response reports `"status":"online"`; `studioConnections` may remain `0` until Studio is configured with the relay URL and restarted.

The public endpoints are:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service and connected-channel readiness |
| `POST` | `/v1/installations/pair` | Validate Studio's Twitch OAuth identity and issue one per-installation relay credential |
| `GET` / `DELETE` | `/v1/installations/current` | Inspect or revoke the authenticated Studio installation |
| `GET` | `/v1/extension/status` | JWT-authenticated Studio connection state |
| `GET` | `/v1/extension/catalog` | Channel-scoped, viewer-safe signal catalog published by Studio |
| `GET` | `/v1/extension/streaming/catalog` | Destination-filtered free actions for the Tempest Streaming companion |
| `POST` | `/v1/extension/streaming/interactions/{action}/trigger` | Trigger a free Streaming action with optional normalized placement |
| `POST` | `/v1/extension/alerts/{alertId}/trigger` | Trigger a Studio catalog Sound Alert |
| `POST` | `/v1/extension/interactions/{action}/trigger` | Trigger a generic action published in that installation's viewer-safe catalog |
| WebSocket | `/v1/studio` | Authenticated outbound Studio relay |

Confirm `https://<your-ebs-host>/health` returns `status: "online"`. Add `https://<your-ebs-host>` to the Twitch version's **Allowlist for URL Fetching Domains**.

## Connect Studio

Authorize the broadcaster in Studio's **Twitch Gateway** and select **Connect My Channel**. Official builds always use `https://signal.tempestmainframe.com`; the service address is not exposed in the public user interface. Studio sends the existing Twitch user access token directly to the EBS for validation, receives a unique relay credential, and stores it with Windows encryption. The EBS does not store the Twitch OAuth token.

The official Tempest Signal service accepts only authorizations issued by the built-in Tempest Twitch application. Upgraded installations that still use a custom or legacy client ID are detected before pairing and show **Use Official Twitch Sign-In**. Public users are routed through Tempest Signal on Railway automatically. Self-hosted EBS installations may continue using their own allowlisted public Twitch applications through the internal API.

Studio's Twitch page reports **EXTENSION RELAY: CONNECTED** when the EBS accepts the connection. The relay reconnects with bounded exponential backoff if the network or EBS restarts.

Catalog synchronization uses an authenticated, 2 MiB-bounded WebSocket envelope. This accommodates the maximum validated interaction catalog and its per-viewer access lists while the service continues to cap the catalog at 200 items and each allow/block list at 100 numeric Twitch IDs. Viewer catalog responses never include those identity lists.

## Build and upload the companion Extensions

Build and verify both Twitch-hosted ZIPs against the official production EBS origin:

```powershell
pnpm extensions:package
```

This produces and verifies:

- `apps/twitch-extension/release-assets/tempest-mainframe-0.2.0.zip` for the panel-only Tempest Mainframe listing.
- `apps/twitch-bits-extension/release-assets/tempest-streaming-0.1.0.zip` for the Tempest Streaming Video Overlay listing. The legacy folder name is retained only for source-path compatibility.
- `release-assets/extension-package-manifest.json` with sizes and SHA-256 hashes for both packages.

Upload each ZIP to its matching Twitch listing's **Files** tab and move that version to Hosted Test. Each built `runtime-config.json` contains only the public EBS origin and locks mock mode off. Neither package contains an Extension secret or paid Bits flow.

## Runtime path

1. Twitch supplies a refreshed viewer JWT to the Mainframe panel or Streaming Video Overlay.
2. The active companion sends its JWT, selected free action, destination-specific route, and a UUID request ID to the EBS.
3. The EBS verifies the JWT and channel, resolves the active PostgreSQL installation, checks anonymity policy, replay state, the channel-published catalog, and request rates, then sends a canonical event to that Studio.
4. Studio validates and deduplicates the event again, resolves the Sound Alert catalog, applies safety/concurrency/cooldowns, and creates a workflow run.
5. Warudo receives `avatar.performance.apply`; Tempest Broadcast receives `broadcast.reaction.trigger`. Both receive lease-based release commands when the performance ends.

For a real end-to-end test before public deployment, follow [LOCAL_TWITCH_TEST.md](LOCAL_TWITCH_TEST.md). It runs this EBS over trusted localhost HTTPS and uses the same Twitch JWT verification and Studio relay path.

If Studio, Warudo, or Broadcast is offline, the Bridge records unavailable delivery rather than exposing any local service publicly. Emergency Restore continues to stop local audio, release active actions, and disarm new viewer interactions.

The in-process sliding-window limiter removes identities after their 60-second window and enforces a 50,000-key ceiling. This bounds memory across ordinary viewer interactions, pairing attempts, Discord OAuth exchange, and the separately keyed Bits reservation and transaction routes. Channel limits remain in force if a high-cardinality identity flood reaches the ceiling.
