# Tempest Streaming Studio 1.4.6 release audit

Date: 2026-09-27

## Result

Release candidate 1.4.6 passed the automated workspace, packaging, integrity, signature, audio-regression, and isolated-profile launch gates.

- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (96 tests, 0 failures)
- Signed packaged executable launch smoke with a new isolated profile and independent loopback port: passed (exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.4.6`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records (installer, unpacked executable/native payloads, and ZIP payload records)
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Existing free Twitch Extension package version: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.4.6-x64.exe` | 120,625,144 | `da5927d4a874e69b9161d6eff8c9867c02257feb17fe5bc0102612c5ecf221a4` |
| `Tempest-Streaming-Studio-Setup-1.4.6-x64.exe.blockmap` | 127,567 | `ec3001f2f7bf7f5f3497a81e0339ef7afb9f4c1b3c0ad3e4053a77b388bd8f4a` |
| `latest.yml` | 385 | `c24d3544d8c036688943564062c32d4e1e30d01fdb9204791ecc3b24ae62ea26` |
| `Tempest-Streaming-Studio-1.4.6-x64.zip` | 153,427,946 | `f5aac4f434a8d888d6035beefee18e73d3d14556adc6d66757e08627e4c749cf` |

The canonical checksum list is generated at `release/SHA256SUMS.txt`; signature details and the same artifact metadata are recorded in `release/release-manifest.json`.

## Scope

This release adds the Studio half of the Viewer Interactions platform: a Free/Bits Extension edition selector, generalized interaction catalog, viewer placement, access rules, per-viewer/global cooldowns, cross-platform counters, pre-purchase Bits reservations, and the aligned Broadcast interaction render contract.

The Browser Source alert-audio fix is retained and guarded by an automated assertion that exactly one `playAudio` implementation is emitted. Studio uses Web Audio as the normal source-native path, keeps the portrait Browser Source silent, and invokes legacy Broadcast audio only for an explicitly configured separate Broadcast audio source.

Tempest Broadcast System 1.4.6, the new Twitch Bits Extension submission, and deployment of the updated hosted EBS remain separate release/deployment operations. The Bits service's current reservation, cooldown, replay, and pending-delivery state is process-local and must move to durable shared storage before horizontal scaling or restart-resilient paid delivery.
