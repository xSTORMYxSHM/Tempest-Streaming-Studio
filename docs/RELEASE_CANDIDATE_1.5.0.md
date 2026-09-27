# Tempest Streaming Studio 1.5.0 release-candidate record

Date: 2026-09-27

## Status

The automated Studio candidate is valid, signed, and ready for the coordinated installed-build rehearsal. It is **not approved for publication**. The live Browser Source, dual-format output, Kick isolation, upgrade, and performance-soak gates in `RELEASE_CHECKLIST.md` remain mandatory.

## Source pair

- Studio branch: `release/1.5.0`
- Studio packaged source commit: `6907053f1344f0e980aff40457c69c8ea82b52e8` (`Add numeric chat polls and complete Dice Box rolls`)
- Broadcast branch: `release/1.5.0-rc`
- Broadcast candidate commit: `734e952e88f532097dd0249608d61566a275b297`
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
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe` | 132,220,080 | `549b7134096e3e7441902587fd520570f32c4fadb5654b9c46bb1b8a052b5cf3` |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe.blockmap` | 139,283 | `72c2aeafae7c1f12c161b5a923d5a90c6adea0621818828a6668ca524c0d5293` |
| `latest.yml` | 385 | `daec3f1476ee621fb66ee57f7121bc7d61802e62e33322bea7d23747eadf02f3` |
| `Tempest-Streaming-Studio-1.5.0-x64.zip` | 166,120,573 | `96f8f2ed31f4d3f5821880fc3cbd21f0766207f86b3ee8ef4ec3dc70487be966` |

These artifacts are local rehearsal candidates only. They must be rebuilt if code changes, and they must not be uploaded to the stable updater channel unless the coordinated manual gates pass.

## Confirmed cross-app contract

- Studio owns platform identity and stream information, chat/chatbot behavior, Stream Together, viewer-interaction policy, Browser Source overlays and status, counters, Dice Box, readiness, and orchestration.
- Broadcast owns capture, scene rendering, canvases, encoders, Enhanced Broadcasting, optional Kick RTMP output, recording, final audio routing, output recovery, and output health.
- Broadcast queries Studio's authenticated `/v1/emote-wall`, `/v1/chat-overlay`, `/v1/dice-overlay`, `/v1/twitch-experiences`, `/v1/discord-voice`, and `/v1/visual-alerts` status routes. Recovery is restricted to active/showing sources whose Studio status reports zero connected clients.
- Studio's Emote Wall uses the absolute `/emote-wall/events` EventSource path required by the current Broadcast Browser Source runtime.
- Twitch Enhanced Broadcasting carries the horizontal Main output and selected Tempest Portrait scene in one Twitch session. Kick remains independently stoppable/retryable without ending Twitch.
- Broadcast writes an atomic local OBS-health snapshot once per second for Tempest telemetry without enabling OBS WebSocket or opening another listener.
- Neither candidate changes production quality settings or the operator-controlled Vertical Canvas Backtrack option.
