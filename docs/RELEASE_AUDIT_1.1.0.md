# Tempest Streaming Studio 1.1.0 release audit

Audit date: 2026-09-06 (America/Los_Angeles)

## Result

The 1.1.0 Windows release passed its locked install, build, test, packaging, resource, clean-profile smoke, privacy-boundary, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 73 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile — exit code 0.
- `Get-AuthenticodeSignature` against the installer and every `.exe`, `.dll`, and `.pyd` in the unpacked and extracted ZIP payloads — all report `Valid`, use the expected private signing configuration, and include a timestamp.
- The changed source and public documentation contain no developer machine paths, private signing files, or signing identity on the main project pages.

## Updater and bundled-resource result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.1.0-x64.exe` with the exact SHA-512 digest and 101,337,936-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- The packaged app contains the Discord Guests local Browser Source and Discord Desktop RPC connector.
- Existing 1.0.1 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.1.0-x64.exe` | 101,337,936 | `640f2dbdd2813daefdfb0fde3003d4d35f566196e3ea2f8acf3bda1dccf0357e` |
| `Tempest-Streaming-Studio-Setup-1.1.0-x64.exe.blockmap` | 106,672 | `be2a62bb254d6b64318a0a9ec23970eea508ba25dc993cab0844f40e14630cf4` |
| `latest.yml` | 385 | `5ef824bc7984145805c4433142286bd87de501c7fb15fc898b99adb13e6a8178` |
| `Tempest-Streaming-Studio-1.1.0-x64.zip` | 130,723,924 | `eacf297400127cf49d1a3edb0efeac74af917bed7dba2071cc437a9e5946bbee` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.1.0` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
- Public Twitch Extension review, hosted EBS publication, and Discord application approval remain separate from the Studio desktop release.
