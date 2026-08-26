# Tempest Streaming Studio 0.20.0 release audit

Audit date: 2026-08-25 (America/Los_Angeles)

## Result

The 0.20.0 Windows release candidate passed its automated build, test, packaging, resource, clean-profile, migration, and secret-boundary gates. The artifacts are ready for the repository/release publication step.

## Verified commands

- `pnpm install --frozen-lockfile`
- `pnpm check` — 52 tests passed across contracts, Extension, Bridge, EBS, Warudo adapter, and desktop packages.
- `pnpm package:win`
- Packaged `Tempest Streaming Studio.exe --smoke-test` with a new isolated Windows profile — exit code 0.

## Clean-profile result

- Product version 0.20.0 and data schema v3.
- No Twitch client ID, account identity, weather provider, now-playing provider, registered application, or registered asset.
- Six generic, media-free Interaction Alerts: Hype Pulse, Dance Break, Celebration, Dramatic Entrance, Victory Pose, and Chaos Mode.
- Warudo disabled for every starter alert.
- Optional creator workflow present only as a disabled compatibility example.
- Existing creator catalogs are preserved without injecting the new starter alerts; this behavior has a regression test.

## Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-0.20.0-x64.exe` | 100,750,191 | `e9ba29406b7a00b4dd6abf9adfd48f7b8bcf1a0fec63056b611858b0afb35979` |
| `Tempest-Streaming-Studio-0.20.0-x64.zip` | 129,962,980 | `4330096f8646da233a4f06e470bdb61266393fb299355ee080859e2ab4a74915` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` are generated from the final artifacts. Packaged resources contain the Twitch Extension assets, local certificate preparation script, installation guide, privacy notice, third-party notices, and license. No private certificate, OAuth token, API key, or machine-specific configuration is packaged.

## Publication notes

- The executable and installer are currently unsigned. A public download may trigger Windows SmartScreen until a trusted publisher certificate is applied. If publishing unsigned, disclose that clearly beside the download.
- The software remains licensed under GNU GPLv3 in `LICENSE`. Tempest and Storm Horizon names and brand assets remain governed separately by `TRADEMARKS.md`.
- Public Twitch Extension review and hosted EBS deployment are separate release tracks. Studio and its local panel can ship before Twitch approves the public Extension.
- The remaining manual checklist covers installer/uninstaller behavior on a non-developer Windows account, OBS track routing, Windows display scaling, and live Twitch/Extension verification.
