# Tempest Streaming Studio 1.0.1 release audit

Audit date: 2026-08-31 (America/Los_Angeles)

## Result

The 1.0.1 Windows release passed its install, build, test, packaging, resource, clean-profile smoke, secret-boundary, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from Azure Trusted Signing profile `TempestSoftwarePublic`.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 70 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile — exit code 0.
- `Get-AuthenticodeSignature` against the installer and every `.exe`, `.dll`, and `.pyd` in the unpacked and extracted ZIP payloads — all report `Valid`, use the expected publisher, and include a timestamp.
- Publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`.
- Signing certificate thumbprint: `ECE29EA7CFD324FD377BD9AD872998BF18E47BC1`.

## Updater and bundled-resource result

- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.0.1-x64.exe` with the exact SHA-512 digest and 101,316,200-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- The packaged app contains the Warudo `TempestPerformanceNode.cs` receiver as a saveable resource.
- The packaged ASAR contains the VTube Studio adapter and its direct Plugin API client.
- Version 1.0.0 predates the updater, so users install 1.0.1 manually once. Version 1.0.1 then checks the stable GitHub release channel in-app for future updates.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.0.1-x64.exe` | 101,316,200 | `ec8e932f02553becb03d3a35f221d3ba4eb609f7e158b2d70cb71195c1dc2f45` |
| `Tempest-Streaming-Studio-Setup-1.0.1-x64.exe.blockmap` | 106,342 | `20bd3bad1dfca9c7541ccc941b69364a33b6e78624f703a153f989e1db375f92` |
| `latest.yml` | 385 | `41ca75c75affd31c1d5eaf0f7f99ddefb3bd47bbd657f70dd1634544dcc98af0` |
| `Tempest-Streaming-Studio-1.0.1-x64.zip` | 130,688,525 | `b4cc4ff48910745369d850d35f377a468031f4f0e88fa1313883752787268d1f` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication status

- Ready to publish the stable `v1.0.1` GitHub release with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
- Public Extension review and hosted EBS publication remain separate from the Studio desktop release.
