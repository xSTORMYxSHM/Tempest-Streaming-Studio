# Tempest Streaming Studio 1.5.1 release audit

Date: 2026-09-29

## Result

Tempest Streaming Studio 1.5.1 passed the frozen-install, full workspace, production dependency, signed packaging, integrity, and isolated-profile launch gates.

- Packaged source commit: `bf0189ddc9eab7330c23527076692f6871a56aac`
- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (134 tests, 0 failures)
- `pnpm audit --prod --audit-level=moderate`: passed (no known vulnerabilities)
- Signed packaged executable launch with a new isolated profile and independent loopback port: passed (`TEMPEST_STUDIO_SMOKE_OK`, exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.5.1`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records across the installer, unpacked executable/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Free and Bits Twitch Extension package versions: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.5.1-x64.exe` | 132,268,488 | `02ecdafc1ed8343c4256e13a795c97930266dc8f3317d8cf6fa300d0a8c13f56` |
| `Tempest-Streaming-Studio-Setup-1.5.1-x64.exe.blockmap` | 138,924 | `dda04c89c9aa2e5891b3254e156fc5d5b281f4d5813f1b98798ef83ab11beaa4` |
| `latest.yml` | 385 | `374729b44975a96c834acac01102846b4fe5f2e27350cf5aa2b857f4b2f02bc8` |
| `Tempest-Streaming-Studio-1.5.1-x64.zip` | 166,196,061 | `82ad4ae9fe86b264f113d1c5ac5f088fa18687d0a8adae903b64ec5874c943c0` |

The canonical checksum list is in `release/SHA256SUMS.txt`; complete signature details and the same artifact metadata are in `release/release-manifest.json`.

## Scope and compatibility

Version 1.5.1 adds the free Extension poll, physical 3D Dice, counters, goals, Now Playing, schedule, current-stream, command-directory, viewer-placement, and identity-consent surfaces. It also reduces Studio and Extension background work, bounds long-session runtime state, streams large local assets, and hardens provider response bodies across Studio, the Bridge, and Tempest Signal.

The shared protocol remains version `1.0`; Broadcast ownership of video, canvases, encoding, platform outputs, recording, and final audio levels is unchanged. Studio continues to own accounts, chat, viewer interactions, Browser Source overlays, and orchestration.

The desktop release packages the updated free Extension assets but does not deploy them to Twitch. Twitch-hosted Extension publication remains a separate Developer Console review and release step.
