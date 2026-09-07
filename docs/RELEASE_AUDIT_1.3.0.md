# Tempest Streaming Studio 1.3.0 release audit

Audit date: 2026-09-07 (America/Los_Angeles)

## Result

The 1.3.0 Streamer Mode and synced Twitch panel release passed its frozen dependency install, build, 80-test suite, packaging, isolated-profile smoke, privacy-boundary, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 80 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- Regression coverage verifies paired-channel Panel Designer synchronization, hosted theme refresh, Streamer Mode visibility boundaries, and the independent public Extension version.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All 20 inspected Authenticode records across the installer, unpacked payload, and extracted ZIP payload report valid, timestamped signatures from one expected publisher.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, or signing identity on the main project pages.

## Streamer experience and updater result

- Streamer Mode is now the default interface, while Advanced Mode preserves technical diagnostics, provider, routing, self-hosting, and custom-code controls.
- Saving a paired Twitch Panel Designer theme publishes validated, channel-scoped appearance data to Tempest Signal, and the viewer panel refreshes it while visible.
- The public Twitch extension retains its independent `0.1.0` version while the desktop application and internal services advance to 1.3.0.
- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.3.0-x64.exe` with the exact SHA-512 digest and 101,356,952-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- Existing 1.2.6 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.3.0-x64.exe` | 101,356,952 | `52508de3b201bddf1ecfc766a7ea2867df3343e1c5a9cd38d913ff136e71027c` |
| `Tempest-Streaming-Studio-Setup-1.3.0-x64.exe.blockmap` | 106,733 | `9954d3754f2c700054dd29dd91721722ebdde6b309d6dcc9a34e01a2bcb1fc17` |
| `latest.yml` | 385 | `adcc8995d58b9d4bd920af26c5deefac4cf9f0b430c0042d59277dea6091ac9c` |
| `Tempest-Streaming-Studio-1.3.0-x64.zip` | 130,753,240 | `363820f6b38858319b88566dac69950e2a39fae23a25def61696950bcab9bb5d` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.3.0` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
