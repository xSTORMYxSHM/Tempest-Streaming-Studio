# Tempest Streaming Studio 1.2.2 release audit

Audit date: 2026-09-06 (America/Los_Angeles)

## Result

The 1.2.2 Windows patch release passed its frozen dependency install, build, 73-test suite, packaging, resource, isolated-profile smoke, privacy-boundary, responsive Discord Guest layout, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 73 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All unpacked and extracted ZIP `.exe`, `.dll`, and `.pyd` files report valid, timestamped signatures matching the private release-signing configuration.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, or signing identity on the main project pages.

## Updater and bundled-resource result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.2.2-x64.exe` with the exact SHA-512 digest and 101,349,136-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- The packaged app keeps Discord Guest profile cards at a readable responsive width and wraps every card action without clipping canvas fields or reactive-image controls.
- Existing 1.2.1 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.2.2-x64.exe` | 101,349,136 | `87526298ceda42d558325cc2cdc2e5c421091ea6fc6d9ec905d92654293d3d0d` |
| `Tempest-Streaming-Studio-Setup-1.2.2-x64.exe.blockmap` | 106,712 | `2640747e76e1d423fdfd96919f2838eaa0fc5ada9d1362a25a260af716046a66` |
| `latest.yml` | 385 | `b207758cde66c56ba0a52309137710996e4772d2f230ffa04c736b348a8a72ca` |
| `Tempest-Streaming-Studio-1.2.2-x64.zip` | 130,741,941 | `aa7c728f4fb2ced50941339325e42452406fa62b1e30a8e180083464f8ff9ab8` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.2.2` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
