# Tempest Streaming Studio 1.2.1 release audit

Audit date: 2026-09-06 (America/Los_Angeles)

## Result

The 1.2.1 Windows patch release passed its frozen dependency install, build, 73-test suite, packaging, resource, isolated-profile smoke, privacy-boundary, updater-metadata, backup portability, Discord Guest profile, media-streaming, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 73 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All unpacked and extracted ZIP `.exe`, `.dll`, and `.pyd` files report valid, timestamped signatures matching the private release-signing configuration.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, or signing identity on the main project pages.

## Updater and bundled-resource result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.2.1-x64.exe` with the exact SHA-512 digest and 101,349,264-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- The packaged app contains live Discord profile thumbnails, independent idle/speaking/mute/deafen artwork, manual per-person canvas placement, streamer-profile visibility control, and portable backup support for the new settings.
- Existing 1.2.0 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.2.1-x64.exe` | 101,349,264 | `34799580e3ff006634ebfbc2360e8cfb87a23b86b46f7412d9ed3b2ab460ec20` |
| `Tempest-Streaming-Studio-Setup-1.2.1-x64.exe.blockmap` | 106,487 | `054563f45995c314bcafcbc5ec70c6185afbd88273bd131336252165d583f565` |
| `latest.yml` | 385 | `e4cd433b77a161892a3621a53cc8d68b9e89be5b0b91ded6292c79e05a594a0a` |
| `Tempest-Streaming-Studio-1.2.1-x64.zip` | 130,741,823 | `cd5c3644c2293b24b106f5037d5de333dc60d8324e5cbe29a66568a7b9ce31b4` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.2.1` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
