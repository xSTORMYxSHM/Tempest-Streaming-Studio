# Tempest Streaming Studio 1.3.1 release audit

Audit date: 2026-09-07 (America/Los_Angeles)

## Result

The 1.3.1 Browser Source alert-audio maintenance release passed its frozen dependency install, build, 80-test suite, Chromium playback diagnostic, packaging, isolated-profile smoke, privacy-boundary, updater-metadata, and Authenticode gates. The installer, embedded uninstaller, elevation helper, desktop executable, and every native DLL in both the unpacked and ZIP payloads have valid, timestamped signatures from the configured Azure Trusted Signing profile.

## Verified commands and gates

- `pnpm install --frozen-lockfile`
- `pnpm check` — 80 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, VTube Studio adapter, and desktop packages.
- Regression coverage verifies that the alert overlay ships Web Audio decoding, abortable local fetches, a bounded compatibility fallback, maximum-runtime cancellation, and visible final playback errors.
- The failing Chromium path was reproduced with the prior media element stuck at zero seconds and no metadata. The same loopback audio was fetched, decoded, and started successfully through the replacement Web Audio path.
- `pnpm package:win` — completed with the repository's Windows Application Control-safe NSIS extraction preparation and release verifier.
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile and independent loopback port — exit code 0.
- All 20 inspected Authenticode records across the installer, unpacked payload, and extracted ZIP payload report valid, timestamped signatures from one expected publisher.
- The changed source and public documentation contain no developer machine paths, private signing files, Discord client secret, OAuth token, or API key.

## Alert audio and updater result

- Twitch and Interaction Alert sounds now fetch and decode through Web Audio instead of relying on the Chromium media-element path that stalled in Broadcast.
- Alert volume, sound delay, queue order, visual duration, clearing, and maximum-runtime cancellation remain intact.
- A bounded media-element fallback remains available, and final playback failure details now reach the Broadcast log.
- `latest.yml` identifies `Tempest-Streaming-Studio-Setup-1.3.1-x64.exe` with the exact SHA-512 digest and 101,357,528-byte size of the signed installer.
- The matching installer blockmap was generated for Electron's differential updater.
- Existing 1.3.0 installations can discover this stable release through Studio's signed in-app updater after publication.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.3.1-x64.exe` | 101,357,528 | `225772884a91797007bdc8fed91e6a196df4ddec2e09e570bd5e805130581622` |
| `Tempest-Streaming-Studio-Setup-1.3.1-x64.exe.blockmap` | 106,538 | `192127d01aa06f61cb8295f4eb731f336c2e066458249702dc4a5abf13c13d5d` |
| `latest.yml` | 385 | `f9f761a50caadcd05eefaf4eb2ee24b2886c37432c7b176f23430fb7c38ad9c9` |
| `Tempest-Streaming-Studio-1.3.1-x64.zip` | 130,754,875 | `fbd4df8baaa22db0d9d18b55b4108af0df8558a85b10f81eb58c330e78171dc8` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` were generated from these exact artifacts. The release verifier found no private certificate, OAuth token, API key, or machine-specific configuration in the packaged resources.

## Publication target

- Stable, non-draft GitHub release `v1.3.1` with the installer, blockmap, updater metadata, portable ZIP, checksums, and signed-payload manifest.
