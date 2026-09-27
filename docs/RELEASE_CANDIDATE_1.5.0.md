# Tempest Streaming Studio 1.5.0 release-candidate record

Date: 2026-09-27

## Status

The replacement automated Studio candidate is valid, signed, and ready for the coordinated installed-build rehearsal. It is **not approved for publication**. Stream Together camera/microphone hardware, live Browser Source, dual-format output, Kick isolation, upgrade, and performance-soak gates in `RELEASE_CHECKLIST.md` remain mandatory.

## Source pair

- Studio branch: `release/1.5.0`
- Studio packaged source commit: `813388ab9c1b87e9f5a4091ab6c568ce1c38f9c8` (`Distinguish Unified Chat from Twitch Shared Chat`)
- Broadcast branch: `release/1.5.0-rc`
- Broadcast candidate commit: `fe8d6b9a4411836ffbc4d1387e5cfe6ad677cc3e`
- Shared protocol version: `1.0`
- Shared interaction render contract: `1.0`

## Studio automated evidence

- Frozen dependency install: passed
- Workspace build and test suite: passed (107 tests, 0 failures)
- Live Twitch Stream Together navigation smoke with a clean browser profile: passed (Chrome identity advertised; unsupported-browser page absent)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.5.0`)
- Signed packaged executable launch with a new isolated profile and independent loopback port: passed (`TEMPEST_STUDIO_SMOKE_OK`, exit code 0)
- Packaged Unified Chat visual capture: passed
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid, timestamped records across the installer, unpacked application/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Both Twitch Extension packages remain on independent version `0.1.0`

## Candidate artifacts

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe` | 132,224,280 | `cdf5bbfabb415d244b48d3dca2ee42308c1566ce94c5c2bdb7962baba574f318` |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe.blockmap` | 138,206 | `4621dd1e7bb5e8c1ef955627fad090425ada23e403d677015a497cfa46c2a8a9` |
| `latest.yml` | 385 | `05fd7a0b9df5553d5bf297e4694f23f64e8aa8d46f093f832e462aab3cdaedbf` |
| `Tempest-Streaming-Studio-1.5.0-x64.zip` | 166,126,017 | `196313b27fa73d41cd5cbb7705af11af65104b34dedc925080c581448b146925` |

These artifacts are local rehearsal candidates only. They must be rebuilt if code changes, and they must not be uploaded to the stable updater channel unless the coordinated manual gates pass.

## Confirmed cross-app contract

- Studio owns platform identity and stream information, chat/chatbot behavior, Stream Together, viewer-interaction policy, Browser Source overlays and status, counters, Dice Box, readiness, and orchestration.
- Broadcast owns capture, scene rendering, canvases, encoders, Enhanced Broadcasting, optional Kick RTMP output, recording, final audio routing, output recovery, and output health.
- Broadcast queries Studio's authenticated `/v1/emote-wall`, `/v1/chat-overlay`, `/v1/dice-overlay`, `/v1/twitch-experiences`, `/v1/discord-voice`, and `/v1/visual-alerts` status routes. Recovery is restricted to active/showing sources whose Studio status reports zero connected clients.
- Studio's Emote Wall uses the absolute `/emote-wall/events` EventSource path required by the current Broadcast Browser Source runtime.
- Twitch Enhanced Broadcasting carries the horizontal Main output and selected Tempest Portrait scene in one Twitch session. Kick remains independently stoppable/retryable without ending Twitch.
- Broadcast writes an atomic local OBS-health snapshot once per second for Tempest telemetry without enabling OBS WebSocket or opening another listener.
- Neither candidate changes production quality settings or the operator-controlled Vertical Canvas Backtrack option.
