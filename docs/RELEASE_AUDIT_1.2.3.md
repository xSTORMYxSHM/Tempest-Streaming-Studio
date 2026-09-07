# Tempest Streaming Studio 1.2.3 release audit

Audit date: 2026-09-06 (America/Los_Angeles)

## Result

The 1.2.3 Windows patch release passed its frozen dependency install, build, 73-test suite, packaging, isolated-profile smoke, privacy-boundary, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 73 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All unpacked and extracted ZIP `.exe`, `.dll`, and `.pyd` files report valid, timestamped signatures matching the private release-signing configuration.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, or signing identity on the main project pages.

## Updater and Discord Guest result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.2.3-x64.exe` with the exact SHA-512 digest and 101,350,024-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- Manual Discord Guest positions now render at their saved canvas coordinates, and live refreshes no longer replace fields while the streamer is typing or dragging.
- The Discord Browser Source reuses existing image nodes, so routine voice-state updates no longer reload PNG or GIF sources and flash the overlay.
- Existing 1.2.2 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.2.3-x64.exe` | 101,350,024 | `452778a9969651186816103dfec9446976a3c5c4780741d34c628c4f8beb87bb` |
| `Tempest-Streaming-Studio-Setup-1.2.3-x64.exe.blockmap` | 106,336 | `eb4a92d3712f2bf7b3d96c84e989c0606cb41fe4e26b50b115caec2a655ee442` |
| `latest.yml` | 385 | `10aac538478aee9029dd7fc90677ab21b4d61b1d387c0356cca32307ab8bd29c` |
| `Tempest-Streaming-Studio-1.2.3-x64.zip` | 130,743,196 | `70afe592479a895e53b7bb42dc68b54c093168476377623aa8cfcc559fbe1456` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.2.3` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
