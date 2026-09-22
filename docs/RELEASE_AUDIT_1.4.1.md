# Tempest Streaming Studio 1.4.1 release audit

Date: 2026-09-22

## Result

Release candidate 1.4.1 passed the automated workspace, packaging, integrity, signature, and launch gates.

- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (89 tests, 0 failures)
- Signed packaged executable launch smoke with a new isolated profile: passed (exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.4.1`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records (installer, 8 unpacked executable/native payloads, and 7 ZIP payload records)
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Twitch Extension package version: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.4.1-x64.exe` | 120,615,976 | `64914cebef915598921c0a04a2a9bf6e559f74eb285576c2610fa46876498b48` |
| `Tempest-Streaming-Studio-Setup-1.4.1-x64.exe.blockmap` | 127,525 | `36572d988d98d9319380e5879b1e2690128eaeca15003d425b7dcc28c3438065` |
| `latest.yml` | 385 | `d32f555bfd143cffe8662a4a1ccaf6a03081b594d60c1d6718458123b54f3223` |
| `Tempest-Streaming-Studio-1.4.1-x64.zip` | 153,412,739 | `6b8a0577f9a4af93c4b497738ff5595063c910aa0e106f0a50d2f4a128b1e785` |

The canonical checksum list is generated at `release/SHA256SUMS.txt`; signature details and the same artifact metadata are recorded in `release/release-manifest.json`.

## Scope

This maintenance release changes Studio information architecture only. Existing platform credentials and settings retain the same storage and security boundaries. Tempest Broadcast remains responsible for video, canvases, encoders, output connections, and Kick stream-key encryption. No Twitch Extension update is required.
