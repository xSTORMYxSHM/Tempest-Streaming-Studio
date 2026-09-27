# Tempest Streaming Studio 1.5.0 release-candidate record

Date: 2026-09-27

## Status

The automated Studio candidate is valid, signed, and ready for the coordinated installed-build rehearsal. It is **not approved for publication**. The live Browser Source, dual-format output, Kick isolation, upgrade, and performance-soak gates in `RELEASE_CHECKLIST.md` remain mandatory.

## Source pair

- Studio branch: `release/1.5.0`
- Studio packaged source commit: `1013b0a` (`Prepare Studio 1.5.0 release candidate`)
- Broadcast branch: `release/1.5.0-rc`
- Broadcast candidate commit: `b3ef758dd347de210ae78df882f71a289cfa00dc`
- Shared protocol version: `1.0`
- Shared interaction render contract: `1.0`

## Studio automated evidence

- Frozen dependency install: passed
- Workspace build and test suite: passed (103 tests, 0 failures)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.5.0`)
- Signed packaged executable launch with a new isolated profile and independent loopback port: passed (`TEMPEST_STUDIO_SMOKE_OK`, exit code 0)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid, timestamped records across the installer, unpacked application/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Both Twitch Extension packages remain on independent version `0.1.0`

## Candidate artifacts

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe` | 123,450,664 | `be01fed356bb3af185f28a5096b91c16b3878e118d4af4427b79ea3009402d41` |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe.blockmap` | 130,453 | `66e5798d55dfe50fc7a2d77562b49f71f112b0c25f9cd3f80177003d0ee844ea` |
| `latest.yml` | 385 | `cc3a44cb855e66a340b3d6c27c486835b73c5b2672aca3fec3dfdbc1dd14e7f3` |
| `Tempest-Streaming-Studio-1.5.0-x64.zip` | 157,137,075 | `7e345392f8b4f0e1bdf4b1778980b22be37968c7988f9742af7420e086466893` |

These artifacts are local rehearsal candidates only. They must be rebuilt if code changes, and they must not be uploaded to the stable updater channel unless the coordinated manual gates pass.

## Confirmed cross-app contract

- Studio owns platform identity and stream information, chat/chatbot behavior, Stream Together, viewer-interaction policy, Browser Source overlays and status, counters, Dice Box, readiness, and orchestration.
- Broadcast owns capture, scene rendering, canvases, encoders, Enhanced Broadcasting, optional Kick RTMP output, recording, final audio routing, output recovery, and output health.
- Broadcast queries Studio's authenticated `/v1/emote-wall`, `/v1/chat-overlay`, `/v1/dice-overlay`, `/v1/twitch-experiences`, `/v1/discord-voice`, and `/v1/visual-alerts` status routes. Recovery is restricted to active/showing sources whose Studio status reports zero connected clients.
- Studio's Emote Wall uses the absolute `/emote-wall/events` EventSource path required by the current Broadcast Browser Source runtime.
- Twitch Enhanced Broadcasting carries the horizontal Main output and selected Tempest Portrait scene in one Twitch session. Kick remains independently stoppable/retryable without ending Twitch.
- Broadcast writes an atomic local OBS-health snapshot once per second for Tempest telemetry without enabling OBS WebSocket or opening another listener.
- Neither candidate changes production quality settings or the operator-controlled Vertical Canvas Backtrack option.
