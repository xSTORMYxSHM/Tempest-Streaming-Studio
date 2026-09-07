# Tempest Streaming Studio 1.2.0 release audit

Audit date: 2026-09-06 (America/Los_Angeles)

## Result

The 1.2.0 Windows release passed its locked install, build, 73-test suite, packaging, resource, isolated-profile smoke, privacy-boundary, updater-metadata, backup portability, Discord OAuth, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 73 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All unpacked and extracted ZIP `.exe`, `.dll`, and `.pyd` files report valid, timestamped signatures matching the private release-signing configuration.
- Tempest Signal reports Discord OAuth configured, and its public token-exchange boundary rejects invalid client IDs without disclosing credentials.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, or signing identity on the main project pages.

## Updater and bundled-resource result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.2.0-x64.exe` with the exact SHA-512 digest and 101,346,520-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- The packaged app contains the official public Discord application ID, hosted Signal exchange URL, persistent Saved Guest Library, offline profile creation, independent idle/speaking artwork, and reset/forget controls.
- Existing 1.1.1 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.2.0-x64.exe` | 101,346,520 | `80e49d75365a105a20931f72006dad53a7a608c804db5510dc46f57665308d8e` |
| `Tempest-Streaming-Studio-Setup-1.2.0-x64.exe.blockmap` | 106,439 | `43025f26bf04e9034d78e34cccf0219b4ebb47878f442834a7500fc7bec6158f` |
| `latest.yml` | 385 | `bc03397dc21172adbf6a4df51fa8448e10b8557eef1afa6a4980d52e0785354f` |
| `Tempest-Streaming-Studio-1.2.0-x64.zip` | 130,738,873 | `82bc06566205f7783616612205d1ab000f442a9ad02eed29d2b8b25d0ec10380` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.2.0` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
