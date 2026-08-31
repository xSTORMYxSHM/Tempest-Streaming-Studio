# Tempest Streaming Studio 1.0.0 release audit

Audit date: 2026-08-30 (America/Los_Angeles)

## Result

The 1.0.0 Windows release passed its automated build, test, packaging, resource, clean-profile, migration, secret-boundary, and Authenticode gates. The installer, uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the Azure Artifact Signing profile `TempestSoftwarePublic`.

## Verified commands

- `pnpm install --frozen-lockfile`
- `pnpm check` — 66 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, and desktop packages.
- `pnpm package:win`
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile — exit code 0 and `TEMPEST_STUDIO_SMOKE_OK`.
- `Get-AuthenticodeSignature` against the installer and every `.exe`, `.dll`, and `.pyd` in the unpacked and extracted ZIP payloads — all report `Valid`, use the expected publisher, and include a timestamp.
- Publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`.
- Signing certificate thumbprint: `ECE29EA7CFD324FD377BD9AD872998BF18E47BC1`.

## Clean-profile result

- Product version 1.0.0 and data schema v4.
- No Twitch client ID, registered application, or registered asset.
- Six generic, media-free starter interactions and eight starter chatbot commands.
- Emote Wall and Twitch Experiences settings are initialized locally.
- The first-run profile applied the expected four data migrations.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.0.0-x64.exe` | 100,982,160 | `8d48af1dde0fd0bf15b22037cee1d0dfebd3b5b35fc2a14e305bd80cebc07dd0` |
| `Tempest-Streaming-Studio-1.0.0-x64.zip` | 130,211,668 | `8d8e85a4d45e695180f537b61820d924168fb4cf65fcdff6762643a6561f0f5d` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these artifacts. Packaged resources contain the Twitch Extension assets, local certificate preparation script, installation guide, privacy notice, third-party notices, and license. The verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication status

- Ready to publish the signed Windows installer and portable ZIP.
- Publish `SHA256SUMS.txt` and `release-manifest.json` beside the binaries so users can verify the artifacts before running them.
- The release verifier now fails packaging unless the installer and every native file in both portable payload views are valid, timestamped, and signed by the expected Tempest publisher.
