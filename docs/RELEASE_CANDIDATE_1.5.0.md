# Tempest Streaming Studio 1.5.0 release-candidate record

Date: 2026-09-27

## Status

The replacement automated Studio candidate is valid, signed, and ready for the coordinated installed-build rehearsal. It is **not approved for publication**. Stream Together camera/microphone hardware, live Browser Source, dual-format output, Kick isolation, upgrade, and performance-soak gates in `RELEASE_CHECKLIST.md` remain mandatory.

## Source pair

- Studio branch: `release/1.5.0`
- Studio packaged source commit: `688c62b8d49b536751bee43ff21c1fbf4673b01a` (`Add dedicated Stream Together call window`)
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
- Packaged Live Desk visual capture: passed
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid, timestamped records across the installer, unpacked application/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Both Twitch Extension packages remain on independent version `0.1.0`

## Candidate artifacts

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe` | 132,224,176 | `ddb23babf1bac847d6c7365ea667cbe39af7bfdcddc0365215630b561b780d94` |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe.blockmap` | 138,703 | `4ecfd602e66f842b835ac689a0bb67c37916c953ca2cae4723a560bf53d514fe` |
| `latest.yml` | 385 | `8a2835ec8ebe0e8739c08de8bedbd6bd492d67619a027378dffa754199c871df` |
| `Tempest-Streaming-Studio-1.5.0-x64.zip` | 166,125,611 | `efad9526549025d56722b11abaa6ede867365f125ccbe06273260d3586b48d2c` |

These artifacts are local rehearsal candidates only. They must be rebuilt if code changes, and they must not be uploaded to the stable updater channel unless the coordinated manual gates pass.

## Confirmed cross-app contract

- Studio owns platform identity and stream information, chat/chatbot behavior, Stream Together, viewer-interaction policy, Browser Source overlays and status, counters, Dice Box, readiness, and orchestration.
- Broadcast owns capture, scene rendering, canvases, encoders, Enhanced Broadcasting, optional Kick RTMP output, recording, final audio routing, output recovery, and output health.
- Broadcast queries Studio's authenticated `/v1/emote-wall`, `/v1/chat-overlay`, `/v1/dice-overlay`, `/v1/twitch-experiences`, `/v1/discord-voice`, and `/v1/visual-alerts` status routes. Recovery is restricted to active/showing sources whose Studio status reports zero connected clients.
- Studio's Emote Wall uses the absolute `/emote-wall/events` EventSource path required by the current Broadcast Browser Source runtime.
- Twitch Enhanced Broadcasting carries the horizontal Main output and selected Tempest Portrait scene in one Twitch session. Kick remains independently stoppable/retryable without ending Twitch.
- Broadcast writes an atomic local OBS-health snapshot once per second for Tempest telemetry without enabling OBS WebSocket or opening another listener.
- Neither candidate changes production quality settings or the operator-controlled Vertical Canvas Backtrack option.
