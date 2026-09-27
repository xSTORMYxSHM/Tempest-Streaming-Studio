# Tempest Streaming Studio 1.4.7 release audit

Date: 2026-09-27

## Result

Release candidate 1.4.7 passed the frozen dependency install, automated workspace, packaging, integrity, signature, audio-regression, dice, and isolated-profile launch gates.

- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (100 tests, 0 failures)
- Signed packaged executable launch smoke with a new isolated profile and independent loopback port: passed (exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.4.7`)
- Packaged Dice Box payload inspection: passed (27 package entries, including the minified engine, offscreen world, default theme, and Ammo WebAssembly binary)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records (installer, unpacked executable/native payloads, and ZIP payload records)
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Existing free Twitch Extension package version: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.4.7-x64.exe` | 123,446,648 | `5111ffd71b0139e126f7b3d931854b1ef0e713e7b52b51b4b8e26f8d72b97f94` |
| `Tempest-Streaming-Studio-Setup-1.4.7-x64.exe.blockmap` | 130,255 | `cc864b0bd5c88d8e88e0888ef6ea92c860fe2f7add173934af28c2edda6c5bc2` |
| `latest.yml` | 385 | `82d6375513a753b9c46b3c4e00d56b2ff37a30ddefaf4d87402e75913175cec3` |
| `Tempest-Streaming-Studio-1.4.7-x64.zip` | 157,131,812 | `87b9db3cabd6136c130436e5fe32949d8574859d4d25baa4f64cfcbec95bb971` |

The canonical checksum list is generated at `release/SHA256SUMS.txt`; signature details and the same artifact metadata are recorded in `release/release-manifest.json`.

## Scope

This maintenance release adds Studio-owned 3D Dice with a loopback-only transparent Browser Source powered by the unmodified MIT-licensed Dice Box 1.1.4 package. Babylon.js and Ammo provide the visible physics, and Studio records the faces that settle. Custom 1–N ranges use physical rejection rerolls against the next supported die, preserving an unbiased result. The feature also includes advantage/disadvantage, modifiers, operator context, three presentation colors, bounded timing/scale controls, and session-only history. It does not import or depend on Tempest Tabletop Engine.

Twitch and Interaction Alerts now fully fetch assigned media and play it through a blob-backed HTML media element captured by current Broadcast Browser Sources. Bounded Web Audio remains a compatibility fallback with explicit failure logging. The optional dice impact sound uses the same media-element route.

Broadcast source routing remains operator-owned. Live manual gates still require confirming source meters, Monitor and Output, selected stream/recording tracks, dice presentation, and the physical monitoring device before publication.
