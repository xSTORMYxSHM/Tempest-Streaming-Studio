# Tempest Streaming Studio 1.2.5 release audit

Audit date: 2026-09-07 (America/Los_Angeles)

## Result

The 1.2.5 Windows compatibility release passed its frozen dependency install, build, 75-test suite, packaging, isolated-profile smoke, privacy-boundary, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 75 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- The Discord IPC regression test confirms both Windows named-pipe forms are tried across all ten Discord endpoint slots without duplicates.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All unpacked and extracted ZIP `.exe`, `.dll`, and `.pyd` files report valid, timestamped signatures matching the private release-signing configuration.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, or signing identity on the main project pages.

## Updater and Discord compatibility result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.2.5-x64.exe` with the exact SHA-512 digest and 101,353,232-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- Windows Discord RPC discovery now tries both `\\.\pipe\discord-ipc-{n}` and `\\?\pipe\discord-ipc-{n}` for endpoint slots zero through nine.
- Missing and permission-blocked local endpoints now return end-user recovery guidance instead of a raw final pipe path.
- Existing 1.2.4 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.2.5-x64.exe` | 101,353,232 | `8c969ff804a709ee9feb1445255eb454b93a3ff373fbef60d8c7e214f13e4ff3` |
| `Tempest-Streaming-Studio-Setup-1.2.5-x64.exe.blockmap` | 106,637 | `ff1af2d2236574c74465a81abefd099a4dbf22765f71ff572ab5d70017a5030c` |
| `latest.yml` | 385 | `8935999ff00dcd4bf8bda551a24ca5d586bfeeb5f1f31ba33ac97ed5e3421184` |
| `Tempest-Streaming-Studio-1.2.5-x64.zip` | 130,747,447 | `fe655a041641133886ff01cd1d263dde4b0d8895d137460cf5dffdc686f77b05` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.2.5` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
