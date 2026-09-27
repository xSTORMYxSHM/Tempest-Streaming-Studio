# Tempest Streaming Studio 1.5.0 release-candidate record

Date: 2026-09-27

## Status

The automated Studio candidate is valid, signed, and ready for the coordinated installed-build rehearsal. It is **not approved for publication**. The live Browser Source, dual-format output, Kick isolation, upgrade, and performance-soak gates in `RELEASE_CHECKLIST.md` remain mandatory.

## Source pair

- Studio branch: `release/1.5.0`
- Studio packaged source commit: `c766de2e12bc3570d120a3d5eb4d0bc505a57d54` (`Restore packaged UI capture verification`)
- Broadcast branch: `release/1.5.0-rc`
- Broadcast candidate commit: `fe8d6b9a4411836ffbc4d1387e5cfe6ad677cc3e`
- Shared protocol version: `1.0`
- Shared interaction render contract: `1.0`

## Studio automated evidence

- Frozen dependency install: passed
- Workspace build and test suite: passed (104 tests, 0 failures)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.5.0`)
- Signed packaged executable launch with a new isolated profile and independent loopback port: passed (`TEMPEST_STUDIO_SMOKE_OK`, exit code 0)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid, timestamped records across the installer, unpacked application/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Both Twitch Extension packages remain on independent version `0.1.0`

## Candidate artifacts

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe` | 132,222,232 | `6befad71ae7a59a564b9e4cd9ddd3e0121124ceb5386019d64bfbf2089f3c09b` |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe.blockmap` | 139,234 | `3a9570c2f12dd4a2f20ceac7a7f8c82fe2ad173d58ba31b9b5f8e6c1dc835fcb` |
| `latest.yml` | 385 | `b430c8ad447cc1d7a4bf7f80361381b2b6b969815607a3c9e2990aed445c3a06` |
| `Tempest-Streaming-Studio-1.5.0-x64.zip` | 166,122,495 | `dfaf850aa82fb8faf33ba68e544a4ff19b5516039c04f9f20b69cd3e2a892571` |

These artifacts are local rehearsal candidates only. They must be rebuilt if code changes, and they must not be uploaded to the stable updater channel unless the coordinated manual gates pass.

## Confirmed cross-app contract

- Studio owns platform identity and stream information, chat/chatbot behavior, Stream Together, viewer-interaction policy, Browser Source overlays and status, counters, Dice Box, readiness, and orchestration.
- Broadcast owns capture, scene rendering, canvases, encoders, Enhanced Broadcasting, optional Kick RTMP output, recording, final audio routing, output recovery, and output health.
- Broadcast queries Studio's authenticated `/v1/emote-wall`, `/v1/chat-overlay`, `/v1/dice-overlay`, `/v1/twitch-experiences`, `/v1/discord-voice`, and `/v1/visual-alerts` status routes. Recovery is restricted to active/showing sources whose Studio status reports zero connected clients.
- Studio's Emote Wall uses the absolute `/emote-wall/events` EventSource path required by the current Broadcast Browser Source runtime.
- Twitch Enhanced Broadcasting carries the horizontal Main output and selected Tempest Portrait scene in one Twitch session. Kick remains independently stoppable/retryable without ending Twitch.
- Broadcast writes an atomic local OBS-health snapshot once per second for Tempest telemetry without enabling OBS WebSocket or opening another listener.
- Neither candidate changes production quality settings or the operator-controlled Vertical Canvas Backtrack option.
