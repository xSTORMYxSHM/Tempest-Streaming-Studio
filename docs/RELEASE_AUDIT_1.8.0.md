# Tempest Streaming Studio 1.8.0 release audit

Date: October 24, 2026

Status: public stable release published and updater feed verified

## Current result

The 1.8.0 source is committed and pushed at `f95d88ebf377654ce17ff833c100895baff838ff`. The frozen workspace build and 168-test suite pass with zero failures. The Windows installer and portable payload were built from that source, timestamp-signed with the Tempest publisher certificate, hardened with the expected Electron fuse wire, and verified without private credentials or development-only files.

The packaged executable completed its hidden smoke test with exit code 0 using a fresh profile and isolated local Bridge port `48775`. It emitted `TEMPEST_STUDIO_SMOKE_OK` with no stderr output.

GitHub published `v1.8.0` as the latest non-draft, non-prerelease release with all 12 expected assets. The public stable updater feed returned HTTP 200 and advertised version `1.8.0` with `Tempest-Streaming-Studio-Setup-1.8.0-x64.exe` as its installation path.

## Included release areas

- Persistent On Air, Create, Setup + Connections, and System navigation with direct access to frequently used stream tools.
- Secure hosted Discord companion pairing through Tempest Signal with encrypted per-Studio credentials and multi-user aliases.
- Retirement of viewer avatars, pets, duels, Streamworld physics, gaze controls, and Stage Actor development assets while retaining the bounded Interactive Stage.
- Retirement of Kick account, chat, relay, poll, automation, and output controls from Studio while leaving historical user files untouched.
- Twitch- and Stream Together-focused chat, polls, automation, extension routing, and production supervision.
- Continued support for Discord Guests, VTube Studio, Warudo, Tempest2D, Stormframe, 3D Dice, alerts, emotes, and the Unified Stage.

## Verification

- `pnpm install --frozen-lockfile`: passed.
- `pnpm check`: passed, 168 tests and 0 failures.
- Signed package verifier: `TEMPEST_RELEASE_VERIFIED 1.8.0`, hardened fuse wire `010011001`, all inspected executable and native payload signatures valid and timestamped.
- Packaged application smoke test: passed with exit code 0 using a fresh profile and `TEMPEST_BRIDGE_PORT=48775`.
- Studio/Broadcast protocol: remains `1.0`; Tempest Broadcast 1.5.0 compatibility is unchanged.
- Twitch companions: Mainframe `0.2.1` and Streaming `0.1.1` remain independently versioned and passed their production tests.
- Reviewer PDFs: regenerated for the 1.8.0 release and visually inspected across all six rendered pages.
- Public release: <https://github.com/xSTORMYxSHM/Tempest-Streaming-Studio/releases/tag/v1.8.0>

## Signed Studio artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.8.0-x64.exe` | 132,671,512 | `1008371215ce799d9af8cdfea0f715a5a753c265c8f842bb13f5c6e4db38024a` |
| `Tempest-Streaming-Studio-Setup-1.8.0-x64.exe.blockmap` | 138,922 | `0d8bfee5aab05a7522cb7ee4b3f13c175ece4f0c6fae205d623d7fdbbb2914d0` |
| `latest.yml` | 385 | `6a339c2b8ff762e3edda8e5ceffa881e39a32e56a8b796655163b56e6789d8c2` |
| `Tempest-Streaming-Studio-1.8.0-x64.zip` | 166,636,711 | `487413af686243de3ea6e851ce5192354d2a801b36e9017d63e8011f3cb0004e` |

## Publication

- Release tag `v1.8.0` resolves to the exact release source commit.
- GitHub reports the release as stable, non-draft, and non-prerelease.
- `latest.yml` publicly advertises 1.8.0, the matching installer size, and SHA-512 digest.
- The release includes the signed installer, blockmap, updater metadata, portable ZIP, SHA-256 list, release manifest, both unchanged Twitch companion ZIPs, and both reviewer README/PDF pairs.
