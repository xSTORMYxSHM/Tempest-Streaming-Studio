# Tempest Streaming Studio 1.1.1 release audit

Audit date: 2026-09-06 (America/Los_Angeles)

## Result

The 1.1.1 Windows release passed its locked install, build, 73-test suite, Browser Source visual review, packaging, resource, clean-profile smoke, privacy-boundary, updater-metadata, backup portability, media-streaming, custom-code validation, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 73 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- Live 1440 × 920 Studio designer review and Mainframe Breach Browser Source review completed.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile — exit code 0.
- All unpacked and extracted ZIP `.exe`, `.dll`, and `.pyd` files report valid, timestamped signatures matching the private release-signing configuration.
- The changed source and public documentation contain no developer machine paths, private signing files, or signing identity on the main project pages.

## Updater and bundled-resource result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.1.1-x64.exe` with the exact SHA-512 digest and 101,343,904-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- The packaged app contains the Mainframe Breach preset, all three Twitch Experience designers, local media serving, and advanced HTML/CSS/JavaScript support.
- Existing 1.1.0 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.1.1-x64.exe` | 101,343,904 | `6d5c51c18779a7989d0c272c2e16bd415a9945fbfc186a56df5891d5bb927884` |
| `Tempest-Streaming-Studio-Setup-1.1.1-x64.exe.blockmap` | 106,658 | `230dc6172be7fb5a0b295382f23feb239c5391d6f774aa5cc3ba5d141d64633a` |
| `latest.yml` | 385 | `aca468264b79fe5b0b8dfdc32b282bc24736ff40a8cb7a887ade778cdd3167a8` |
| `Tempest-Streaming-Studio-1.1.1-x64.zip` | 130,734,355 | `c2a863fb4b9d481aeeca4bcb4e339af114e601363a533618744674886908be3c` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.1.1` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
