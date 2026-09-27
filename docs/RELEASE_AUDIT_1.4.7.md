# Tempest Streaming Studio 1.4.7 release audit

Date: 2026-09-27

## Result

Release candidate 1.4.7 passed the frozen dependency install, automated workspace, packaging, integrity, signature, audio-regression, dice, and isolated-profile launch gates.

- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (100 tests, 0 failures)
- Signed packaged executable launch smoke with a new isolated profile and independent loopback port: passed (exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.4.7`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records (installer, unpacked executable/native payloads, and ZIP payload records)
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Existing free Twitch Extension package version: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.4.7-x64.exe` | 120,628,352 | `2fdadcf463d43867ea9ad4db3be658ebf05235b3e3bd750aeb23aefee01edb4e` |
| `Tempest-Streaming-Studio-Setup-1.4.7-x64.exe.blockmap` | 127,420 | `974397ef06515b44f2ce8c05a15880d082da55f49539e1fa6e4ed73349550399` |
| `latest.yml` | 385 | `2e12682a282a447cad9c78d4b77c0bba54b30f65bfd11c0827ea972d7462e992` |
| `Tempest-Streaming-Studio-1.4.7-x64.zip` | 153,438,911 | `c12bcaeaeffecc0f64b4dd2dbeb3cfeaa20a45d72e4e4d07593310945e209abc` |

The canonical checksum list is generated at `release/SHA256SUMS.txt`; signature details and the same artifact metadata are recorded in `release/release-manifest.json`.

## Scope

This maintenance release adds Studio-owned 3D Dice with a loopback-only transparent Browser Source, cryptographically resolved and fixed dice results, advantage/disadvantage, modifiers, operator context, three presentation materials, bounded timing/scale controls, and session-only history. It does not import or depend on Tempest Tabletop Engine.

Twitch and Interaction Alerts now fully fetch assigned media and play it through a blob-backed HTML media element captured by current Broadcast Browser Sources. Bounded Web Audio remains a compatibility fallback with explicit failure logging. The optional dice impact sound uses the same media-element route.

Broadcast source routing remains operator-owned. Live manual gates still require confirming source meters, Monitor and Output, selected stream/recording tracks, dice presentation, and the physical monitoring device before publication.
