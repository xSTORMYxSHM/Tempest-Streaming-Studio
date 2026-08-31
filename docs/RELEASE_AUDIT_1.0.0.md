# Tempest Streaming Studio 1.0.0 release audit

Audit date: 2026-08-30 (America/Los_Angeles)

## Result

The 1.0.0 Windows release passed its automated build, test, packaging, resource, clean-profile, migration, and secret-boundary gates. The installer and packaged executable are unsigned, and the public release must disclose that they may trigger Microsoft Defender SmartScreen.

## Verified commands

- `pnpm install --frozen-lockfile`
- `pnpm check` — 66 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, and desktop packages.
- `pnpm package:win`
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile — exit code 0 and `TEMPEST_STUDIO_SMOKE_OK`.
- `Get-AuthenticodeSignature` against the installer and packaged executable — both currently report `NotSigned`.

## Clean-profile result

- Product version 1.0.0 and data schema v4.
- No Twitch client ID, registered application, or registered asset.
- Six generic, media-free starter interactions and eight starter chatbot commands.
- Emote Wall and Twitch Experiences settings are initialized locally.
- The first-run profile applied the expected four data migrations.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.0.0-x64.exe` | 100,873,885 | `d5cd3804c52af59bb1f4b15d43d85eba5c7bf94c14bddaba636846d8b34159ef` |
| `Tempest-Streaming-Studio-1.0.0-x64.zip` | 130,137,009 | `7246b4c6bd2f260e0680b21eab2a7779ac5861e89bb59163ed17c92bf358a714` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these artifacts. Packaged resources contain the Twitch Extension assets, local certificate preparation script, installation guide, privacy notice, third-party notices, and license. The verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication status

- Publish the installer as unsigned and identify it that way beside the download.
- Publish `SHA256SUMS.txt` and `release-manifest.json` so users can verify the artifacts before running them.
- A future release should use a trusted Windows code-signing certificate and require both Authenticode checks to report `Valid` before setting `signed: true`.
