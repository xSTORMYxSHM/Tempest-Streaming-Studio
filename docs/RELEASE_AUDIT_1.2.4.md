# Tempest Streaming Studio 1.2.4 release audit

Audit date: 2026-09-07 (America/Los_Angeles)

## Result

The 1.2.4 Windows release passed its frozen dependency install, build, 74-test suite, packaging, isolated-profile smoke, privacy-boundary, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 74 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All unpacked and extracted ZIP `.exe`, `.dll`, and `.pyd` files report valid, timestamped signatures matching the private release-signing configuration.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, or signing identity on the main project pages.

## Updater, profiles, and alert runtime result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.2.4-x64.exe` with the exact SHA-512 digest and 101,352,304-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- Discord Guest Profiles export as self-contained, integrity-checked files and import into Studio-managed storage by Discord User ID without carrying authorization, server history, source paths, or recipient-specific canvas settings.
- Interaction Alerts, Twitch Alerts, and Twitch variants expose a maximum runtime that bounds visuals, audio, TTS, reactions, safety leases, and queue playback.
- Browser Source audio stops at the configured maximum runtime even when the visual leaves the canvas earlier.
- Existing 1.2.3 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.2.4-x64.exe` | 101,352,304 | `e992478af27a539c3c8aa1c16dc1cff9151bbe6fb11c942b15a64cb87a0c7ae1` |
| `Tempest-Streaming-Studio-Setup-1.2.4-x64.exe.blockmap` | 106,450 | `c7e737cc85d644934dabae5c8846d64f8d6db9a11edb9f23553baf7e17f825af` |
| `latest.yml` | 385 | `1c5a3f614efe5fd002cc64f59446511ae2d5107a6f149b857d7b56e76855f5aa` |
| `Tempest-Streaming-Studio-1.2.4-x64.zip` | 130,747,249 | `2d8bd2eea8d57ad8d53b2287cac89b0e831fd61f07718d8b4f538c4940958cdc` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.2.4` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
