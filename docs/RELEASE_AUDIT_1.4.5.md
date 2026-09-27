# Tempest Streaming Studio 1.4.5 release audit

Date: 2026-09-26

## Result

Release candidate 1.4.5 passed the automated workspace, packaging, integrity, signature, and launch gates from a clean release worktree.

- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (89 tests, 0 failures)
- Signed packaged executable launch smoke with a new isolated profile: passed (exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.4.5`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records (installer, 8 unpacked executable/native payloads, and 7 ZIP payload records)
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Twitch Extension package version: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.4.5-x64.exe` | 120,612,336 | `8287e292a2df5fd325bc69ea12efbcb0290064def8e329919f882dd2f649771b` |
| `Tempest-Streaming-Studio-Setup-1.4.5-x64.exe.blockmap` | 126,987 | `637fc5498c2fd37f284271dab5c7bd08bc2ced7b7dd09dccef3eaf415d533352` |
| `latest.yml` | 385 | `a2150d8e12e9b8c68969d0a7bef583a544a60b4f3030ea1801aa98eb042fe3ae` |
| `Tempest-Streaming-Studio-1.4.5-x64.zip` | 153,411,597 | `d4c6daa966d85dbb73a7e09aa0e808e9da70eef6e03e46d61ea7be25faca8022` |

The canonical checksum list is generated at `release/SHA256SUMS.txt`; signature details and the same artifact metadata are recorded in `release/release-manifest.json`.

## Scope

This release establishes one authoritative home for every production setting. Tempest Broadcast owns video canvases, encoders, platform output services, Kick stream credentials, upload budgeting, recording, and live output execution. Studio owns platform accounts and stream information, chat and chatbot behavior, Stream Together, alerts and workflows, operator sign-off, readiness, preview, guarded Go Live, recovery, and monitoring.

No saved-data migration or Twitch Extension update is required. The manual hardware, live-platform, and non-developer Windows-account checks remain documented in `docs/RELEASE_CHECKLIST.md` for operational validation against the deployment environment.
