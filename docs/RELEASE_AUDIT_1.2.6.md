# Tempest Streaming Studio 1.2.6 release audit

Audit date: 2026-09-07 (America/Los_Angeles)

## Result

The 1.2.6 public-connection hardening release passed its frozen dependency install, build, 79-test suite, packaging, isolated-profile smoke, privacy-boundary, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 79 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- Regression coverage verifies official-service Twitch authorization handling, machine-readable EBS rejection codes, sanitized desktop errors, required Discord voice RPC scopes, and tester/approval guidance.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All unpacked and extracted ZIP `.exe`, `.dll`, and `.pyd` files report valid, timestamped signatures matching the private release-signing configuration.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, or signing identity on the main project pages.

## Public connection and updater result

- Installed users are routed to the official Tempest Signal Railway service automatically; the self-hosted Extension service field is absent from the public Studio interface.
- Upgraded custom Twitch authorizations are stopped before official-service pairing and receive a built-in sign-in recovery action.
- Discord RPC authorization errors distinguish the restricted application approval/tester requirement from local pipe failures. Public Discord voice access remains dependent on Discord approval for the required scopes.
- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.2.6-x64.exe` with the exact SHA-512 digest and 101,354,488-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- Existing 1.2.5 installations can discover this stable release through Studio's signed in-app updater.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.2.6-x64.exe` | 101,354,488 | `ca05710aff76204449a99910bd408e529f0ed3853faca9ec358780515cf670cd` |
| `Tempest-Streaming-Studio-Setup-1.2.6-x64.exe.blockmap` | 106,292 | `7ae3d7bb9ec30511a682b4a6cabeb657eaf4398005fb003668d10a764e1a0e8a` |
| `latest.yml` | 385 | `9a8a936e43f4f7cbbb803114fe54a0175a82b017d25035989a4e278c43ed6b63` |
| `Tempest-Streaming-Studio-1.2.6-x64.zip` | 130,749,131 | `e950d1859498b5884b8e655ba9d326e7b0ffa2f4049a23c5989a4144487d285f` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.2.6` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
