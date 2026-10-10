# Tempest Twitch Companion Extensions

Tempest Streaming Studio uses two free Twitch Extension listings that may run independently or together on one channel.

| Extension | Primary surfaces | Purpose |
| --- | --- | --- |
| Tempest Mainframe | Panel only | Detailed viewer hub, catalog, history, accessibility, progression, and deeper controls |
| Tempest Streaming | Video Overlay | In-player live actions, normalized click/tap targeting, polls, battles, avatars, and current-stream context |

The Twitch component is a control surface over the Twitch player. Stream-visible output is rendered by Studio's loopback Browser Sources, so it is also present in recordings and on other streaming platforms.

Neither companion uses Bits products, purchases, receipts, or paid actions.

## Shared installation model

Studio pairs the broadcaster once with Tempest Signal. The installation stores one channel-scoped catalog and one safety policy, with independent `mainframe` and `streaming` enablement flags. Catalog entries declare their destinations, so the EBS returns only the entries intended for the requesting companion.

The two Twitch listings keep separate Client IDs, shared secrets, review packages, and release versions. Tempest Mainframe JWTs are verified with `TWITCH_EXTENSION_SECRETS`; Tempest Streaming JWTs are verified with `TEMPEST_STREAMING_EXTENSION_SECRETS`.

The 1.7.0 protocol continues to accept the old `extensionEdition: free|bits` field while installations migrate. A legacy `free` catalog maps to Mainframe-only and a legacy `bits` catalog maps to Streaming-only. New Studio builds publish the companion manifest and destination list as the source of truth.

## Build and package

- Mainframe: `pnpm extension:build`
- Streaming: `pnpm extension:streaming:build`
- Streaming local preview: `pnpm extension:streaming:start`
- Twitch-hosted ZIP: run `pnpm package:hosted` from `apps/twitch-bits-extension`

The `apps/twitch-bits-extension` directory name is retained temporarily so existing workspaces and release automation do not lose their path during the 1.7.0 migration. Its package name and built product are Tempest Streaming, and the active client contains no Bits APIs.

For a local no-network preview, set `TEMPEST_STREAMING_EXTENSION_MOCK_MODE=1` before building. The production EBS defaults to `https://signal.tempestmainframe.com`; override it only for controlled development with `TEMPEST_STREAMING_EXTENSION_EBS_URL`.

## EBS configuration

```text
TWITCH_EXTENSION_SECRETS=<mainframe-base64-secret>
TEMPEST_STREAMING_EXTENSION_CLIENT_ID=<streaming-extension-client-id>
TEMPEST_STREAMING_EXTENSION_SECRETS=<streaming-base64-secret>
```

Keep the secrets only on Railway. They must never be placed in Studio, runtime-config.json, Extension assets, screenshots, or documentation committed with real values.

Tempest Streaming uses:

- `GET /v1/extension/streaming/status`
- `GET /v1/extension/streaming/catalog`
- `POST /v1/extension/streaming/interactions/:action/trigger`

Tempest Mainframe keeps its existing `/v1/extension/*` routes. Both paths share request validation, channel pairing, rate limits, Studio relay delivery, access rules, Emergency Stop behavior, and the activity ledger.

## Twitch surface configuration

Use `video_overlay.html` as the Tempest Streaming viewer surface. Compatibility assets remain buildable for local testing and migration, but the Twitch listing split is Mainframe as a panel-only hub and Streaming as the in-player overlay. The Twitch overlay is a viewer interaction layer over Twitch video; Studio's `/interactive-stage` Browser Source remains responsible for elements that must appear in the encoded stream, recordings, and other platforms.

Add `https://signal.tempestmainframe.com` to the Extension allowlist for URL fetching. Use the public legal URLs:

- `https://tempestmainframe.com/legal#privacy`
- `https://tempestmainframe.com/legal#terms`

Before submission, verify Mainframe-only, Streaming-only, and both-active states on a real channel. Confirm that disabled companions receive a machine-readable `EXTENSION_COMPANION_INACTIVE` response and that a destination-specific action never appears in the other companion's catalog.
