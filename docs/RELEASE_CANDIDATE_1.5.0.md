# Tempest Streaming Studio 1.5.0 release-candidate record

Date: 2026-09-27

## Status

The replacement automated Studio candidate is valid, signed, and ready for the coordinated installed-build rehearsal. It is **not approved for publication**. Stream Together camera/microphone hardware, live Browser Source, Stream Goal operation, dual-format output, Kick isolation, upgrade, and performance-soak gates in `RELEASE_CHECKLIST.md` remain mandatory.

## Source pair

- Studio branch: `release/1.5.0`
- Studio packaged source commit: `23d557053957e112c1edfbaf89d03a27c7e6aeff` (`Fix OBS browser source alert audio`)
- Broadcast branch: `release/1.5.0-rc`
- Broadcast candidate commit: `b68ebed9b3075f948759512de4f89dd8ecd23c04`
- Shared protocol version: `1.0`
- Shared interaction render contract: `1.0`

## Studio automated evidence

- Frozen dependency install: passed
- Workspace build and test suite: passed (107 tests, 0 failures)
- Studio-managed Stream Goal validation, persistence, and Twitch-source isolation: passed
- Signed packaged Live Desk poll visual capture: passed
- Real Broadcast RC6 Browser Source audio regression: passed for Twitch and Interaction Alerts; both stayed OBS-owned, logged no playback failure, and the Twitch source remained healthy across a Studio restart without a Broadcast refresh
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.5.0`)
- Signed packaged executable launch with a new isolated profile and independent loopback port: passed (`TEMPEST_STUDIO_SMOKE_OK`, exit code 0)
- Electron fuse wire: `010011001`
- Signature coverage: valid, timestamped signatures across the installer, unpacked application/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Both Twitch Extension packages remain on independent version `0.1.0`

## Candidate artifacts

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe` | 132,227,600 | `56e7a5cda81b1c396afc5926ba4d1898e559afd1a3d78d72ef18c3f23486209a` |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe.blockmap` | 138,860 | `be5adde8353686bbe555edfb4faf4b9ef6a14fcf88e2ea2b6a86c2fa67bd617a` |
| `latest.yml` | 385 | `150f766e9d6a13bf1765456e3900306a51446dcaad8aca4aacddd22ebaf5baaa` |
| `Tempest-Streaming-Studio-1.5.0-x64.zip` | 166,130,652 | `b77098016442fac8678159eb5103a4e8d584ff3be9055d208bff79b75679e4e6` |

These artifacts are local rehearsal candidates only. They must be rebuilt if code changes, and they must not be uploaded to the stable updater channel unless the coordinated manual gates pass.

## Confirmed cross-app contract

- Studio owns platform identity and stream information, chat/chatbot behavior, Stream Together, viewer-interaction policy, Browser Source overlays and status, counters, Dice Box, readiness, and orchestration.
- Broadcast owns capture, scene rendering, canvases, encoders, Enhanced Broadcasting, optional Kick RTMP output, recording, final audio routing, output recovery, and output health.
- Broadcast queries Studio's authenticated `/v1/emote-wall`, `/v1/chat-overlay`, `/v1/dice-overlay`, `/v1/twitch-experiences`, `/v1/discord-voice`, and `/v1/visual-alerts` status routes. Recovery is restricted to active/showing sources whose Studio status reports zero connected clients.
- Studio's Emote Wall uses the absolute `/emote-wall/events` EventSource path required by the current Broadcast Browser Source runtime.
- Twitch Enhanced Broadcasting carries the horizontal Main output and selected Tempest Portrait scene in one Twitch session. Kick remains independently stoppable/retryable without ending Twitch.
- Broadcast writes an atomic local OBS-health snapshot once per second for Tempest telemetry without enabling OBS WebSocket or opening another listener.
- Studio serves alert media on a dedicated fixed loopback lane (`127.0.0.1:4766`) so OBS Browser Sources own all alert sound and mixer levels without competing with long-lived overlay event connections.
- Neither candidate changes production quality settings or the operator-controlled Vertical Canvas Backtrack option.
