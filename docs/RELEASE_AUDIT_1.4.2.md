# Tempest Streaming Studio 1.4.2 release audit

Date: 2026-09-25

## Result

Release candidate 1.4.2 passed the automated workspace, packaging, integrity, signature, and launch gates.

- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (89 tests, 0 failures)
- Signed packaged executable launch smoke with a new isolated profile: passed (exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.4.2`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records (installer, 8 unpacked executable/native payloads, and 7 ZIP payload records)
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Twitch Extension package version: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.4.2-x64.exe` | 120,616,312 | `c0f44a84bb1e9945be88884257a1b34eb364b70e125e4030455800c8ce96149b` |
| `Tempest-Streaming-Studio-Setup-1.4.2-x64.exe.blockmap` | 127,302 | `c63cd85c4ae7a1ea6a0862891d099823f5dea58b9513cc1c9354a8c2045fabc3` |
| `latest.yml` | 385 | `f84788a049ba94cc166b0b2e7f54f9ca4c49459b72dc8f2b1a73d4aac40ff685` |
| `Tempest-Streaming-Studio-1.4.2-x64.zip` | 153,413,785 | `d4dc0dd1f82bb7595cd6b026d2dfb69b4306a2213bab02ddf78925554259b356` |

The canonical checksum list is generated at `release/SHA256SUMS.txt`; signature details and the same artifact metadata are recorded in `release/release-manifest.json`.

## Scope

This maintenance release reduces Studio renderer, filesystem-diagnostic, and idle Browser Source work without changing Bridge APIs, saved-data formats, or platform behavior. Tempest Broadcast remains responsible for video capture, canvases, rendering, encoders, and platform output connections. No Twitch Extension update is required.

The manual hardware, live-platform, and non-developer Windows-account checks remain documented in `docs/RELEASE_CHECKLIST.md` for operational validation against the deployment environment.
