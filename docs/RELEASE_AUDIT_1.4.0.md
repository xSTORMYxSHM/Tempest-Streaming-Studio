# Tempest Streaming Studio 1.4.0 release audit

Date: 2026-09-14

## Result

Release candidate 1.4.0 passed the automated workspace, packaging, integrity, signature, and launch gates.

- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (89 tests, 0 failures)
- Development launch smoke with a new isolated profile: passed (`TEMPEST_STUDIO_SMOKE_OK`)
- Signed packaged executable launch smoke with a new isolated profile: passed (exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.4.0`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records (installer, 8 unpacked executable/native payloads, and 7 ZIP payload records)
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Twitch Extension package version: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.4.0-x64.exe` | 120,615,344 | `a37891a44a8a24de5bfd4c7c8a8316527fb07f8ec1586b9d5d69ce9fc4ee776e` |
| `Tempest-Streaming-Studio-Setup-1.4.0-x64.exe.blockmap` | 127,125 | `c1bd45ba38a5be768d530212882e57317c1aae69cd8e999ffa7003d5be5f7e5a` |
| `latest.yml` | 385 | `1965f433c743ca5d5f8799509cdbdeaf3d31495c42f9a2c52c78689d21579f81` |
| `Tempest-Streaming-Studio-1.4.0-x64.zip` | 153,411,803 | `a94fa799a9ae9f34aef4ddcfa3a35d1fc3096353d382ff1e81691ed454b7ae39` |

The canonical checksum list is generated at `release/SHA256SUMS.txt`; signature details and the same artifact metadata are recorded in `release/release-manifest.json`.

## Scope boundary

Studio is the production control plane. Tempest Broadcast remains responsible for video capture, horizontal and vertical canvases, scene rendering, encoders, platform output connections, and secure Kick stream-key storage. Studio adds configuration, preflight, monitoring, chat, and guarded recovery controls around those Broadcast capabilities.

The manual hardware, physical-phone, live-platform, and non-developer Windows-account checks remain documented in `docs/RELEASE_CHECKLIST.md` for operational validation against the deployment environment.
