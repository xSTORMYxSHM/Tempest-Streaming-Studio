# Tempest Streaming Studio 1.5.0 release-candidate record

Date: 2026-09-27

## Status

The replacement automated Studio candidate is valid, signed, and ready for the coordinated installed-build rehearsal. It is **not approved for publication**. Stream Together camera/microphone hardware, live Browser Source, Stream Goal operation, dual-format output, Kick isolation, upgrade, and performance-soak gates in `RELEASE_CHECKLIST.md` remain mandatory.

## Source pair

- Studio branch: `release/1.5.0`
- Studio packaged source commit: `f4e1642f5aa2a51b4a4ec2fb06d81d0be4ad1905` (`Align Live Desk poll styling`)
- Broadcast branch: `release/1.5.0-rc`
- Broadcast candidate commit: `fe8d6b9a4411836ffbc4d1387e5cfe6ad677cc3e`
- Shared protocol version: `1.0`
- Shared interaction render contract: `1.0`

## Studio automated evidence

- Frozen dependency install: passed
- Workspace build and test suite: passed (107 tests, 0 failures)
- Studio-managed Stream Goal validation, persistence, and Twitch-source isolation: passed
- Signed packaged Live Desk poll visual capture: passed
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.5.0`)
- Signed packaged executable launch with a new isolated profile and independent loopback port: passed (`TEMPEST_STUDIO_SMOKE_OK`, exit code 0)
- Electron fuse wire: `010011001`
- Signature coverage: valid, timestamped signatures across the installer, unpacked application/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Both Twitch Extension packages remain on independent version `0.1.0`

## Candidate artifacts

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe` | 132,227,064 | `42c8f604801f302be4c1673d06f44d5500ea62e6e1c12aa33aa9c5d4316f3197` |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe.blockmap` | 138,572 | `e80902ea38f9a175492fad09bc658c0c2ee1f5107e6bb762ea65a92e9e13a845` |
| `latest.yml` | 385 | `5f677b04c524631368d8920327926b537a0b0e75b2f417349a10571e14fc762e` |
| `Tempest-Streaming-Studio-1.5.0-x64.zip` | 166,129,610 | `911850737d67d39bfae951d1f0005512419a1f60243a9e3363a01138c8ed0cb2` |

These artifacts are local rehearsal candidates only. They must be rebuilt if code changes, and they must not be uploaded to the stable updater channel unless the coordinated manual gates pass.

## Confirmed cross-app contract

- Studio owns platform identity and stream information, chat/chatbot behavior, Stream Together, viewer-interaction policy, Browser Source overlays and status, counters, Dice Box, readiness, and orchestration.
- Broadcast owns capture, scene rendering, canvases, encoders, Enhanced Broadcasting, optional Kick RTMP output, recording, final audio routing, output recovery, and output health.
- Broadcast queries Studio's authenticated `/v1/emote-wall`, `/v1/chat-overlay`, `/v1/dice-overlay`, `/v1/twitch-experiences`, `/v1/discord-voice`, and `/v1/visual-alerts` status routes. Recovery is restricted to active/showing sources whose Studio status reports zero connected clients.
- Studio's Emote Wall uses the absolute `/emote-wall/events` EventSource path required by the current Broadcast Browser Source runtime.
- Twitch Enhanced Broadcasting carries the horizontal Main output and selected Tempest Portrait scene in one Twitch session. Kick remains independently stoppable/retryable without ending Twitch.
- Broadcast writes an atomic local OBS-health snapshot once per second for Tempest telemetry without enabling OBS WebSocket or opening another listener.
- Neither candidate changes production quality settings or the operator-controlled Vertical Canvas Backtrack option.
