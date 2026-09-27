# Tempest Streaming Studio 1.5.0 release audit

Date: 2026-09-27

## Result

Tempest Streaming Studio 1.5.0 passed the automated workspace, signed packaging, integrity, isolated-profile launch, and paired Studio/Broadcast Dice Browser Source recovery gates.

- Packaged Studio source commit: `1663109a88005a8bdbc80019f3e7d5b39501e47d`
- Matching Broadcast source commit: `8c3d117f9408fb4c03aa6c27235fd407cee45933`
- `pnpm check`: passed (112 tests, 0 failures)
- Signed packaged executable launch with a new isolated profile and independent loopback port: passed (exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.5.0`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records across the installer, unpacked executable/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Free and Bits Twitch Extension package versions: unchanged at `0.1.0`

## Paired runtime gate

The final Studio candidate and stock-compatible Broadcast candidate completed a live recovery rehearsal before packaging:

- The Dice Browser Source reached exactly one ready client over the OBS long-poll transport with the onscreen Dice Box renderer.
- The Browser Source audio test returned `ready` through the media-element path.
- A physical d20 roll settled, returned `9`, entered Studio history, and cleared on schedule.
- Studio alone was restarted while Broadcast remained open. Broadcast recovered the existing source to one ready client without a reconnect loop or duplicate client.
- A second physical d20 roll settled, returned `17`, entered Studio history, and visibly cleared from the Broadcast canvas on schedule.
- The Broadcast log contained no Dice error after recovery.

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe` | 132,242,608 | `f9e904831fb775ee4cfe424cdd875248440944ce4bc22cd9e9e8cf6a621bea55` |
| `Tempest-Streaming-Studio-Setup-1.5.0-x64.exe.blockmap` | 138,388 | `fb42b58d0c5aa93a11139ac97e044e20416046cd43085f9caac8beb07f493a15` |
| `latest.yml` | 385 | `360d577c130090dd8c824678834316f050d2a6140092ec417102f98aa8b469f5` |
| `Tempest-Streaming-Studio-1.5.0-x64.zip` | 166,155,869 | `1b1e09f7c1219deb9badc737f9f56c54a971d7df335f7022bf05cbc49f9d7f41` |

The canonical checksum list is in `release/SHA256SUMS.txt`; signature details and the same artifact metadata are recorded in `release/release-manifest.json`.

## Scope

Version 1.5.0 coordinates Studio's operator-facing additions with Broadcast while preserving ownership boundaries. Studio owns accounts, stream information, unified chat and chatbot behavior, alerts and viewer interactions, counters, polls, Stream Together, Stream Goals, GIPHY assignments, and the hardened Dice Box overlay. Broadcast continues to own canvases, encoders, platform outputs, recording, and final stream audio levels.

The Dice Browser Source now uses server-held long polling in OBS, retains SSE for ordinary browsers, reports physical results, verifies media audio, clears presentations from the server timer, and recovers after a Studio restart without requiring a private OBS Browser plug-in fork.

The desktop release does not deploy either Twitch Extension or the hosted Extension backend. Those remain separate review and deployment tracks.
