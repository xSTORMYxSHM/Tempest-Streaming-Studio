# Tempest Streaming Studio 1.7.4 release audit

Date: October 23, 2026

Status: public stable release published and updater feed verified

## Current result

The 1.7.4 source is committed and pushed at `48b2730c99bc96ff45e1451ba7a57622843f96a2`. The frozen workspace build and 173-test suite pass with zero failures. The Windows installer and portable payload were built from that source, timestamp-signed with the Tempest publisher certificate, hardened with the expected Electron fuse wire, and verified without private credentials or development-only files.

The packaged executable completed its hidden smoke test with exit code 0 using a fresh profile and isolated local Bridge port `48775`. It emitted `TEMPEST_STUDIO_SMOKE_OK` with no stderr output.

GitHub published `v1.7.4` as the latest non-draft, non-prerelease release with all 12 expected assets. The public stable updater feed returned HTTP 200 and advertised version `1.7.4` with `Tempest-Streaming-Studio-Setup-1.7.4-x64.exe` as its installation path.

## Included release areas

- Global `Ctrl+K` tool finding and direct nested navigation for Chatbot and Interactive Stage workspaces.
- Default-off viewer avatars, stream pets, and 3D Dice with explicit Twitch companion placement.
- Destination filtering that prevents intentionally hidden actions from rejecting unrelated Extension catalogs.
- Emote Wall heartbeat isolation and local remount recovery instead of full-canvas Stage failure.
- Optional Stormframe AudioLink playback for Twitch alerts and viewer interactions.
- Expanded Twitch configuration and reviewer walkthroughs for Tempest Mainframe `0.2.1` and Tempest Streaming `0.1.1`.

## Verification

- `pnpm install --frozen-lockfile`: passed.
- `pnpm check`: passed, 173 tests and 0 failures.
- Signed package verifier: `TEMPEST_RELEASE_VERIFIED 1.7.4`, hardened fuse wire `010011001`, all inspected executable and native payload signatures valid and timestamped.
- Packaged application smoke test: passed with exit code 0 using a fresh profile and `TEMPEST_BRIDGE_PORT=48775`.
- Studio/Broadcast protocol: remains `1.0`; Tempest Broadcast 1.5.0 compatibility is unchanged.
- Twitch companion package verifier: Mainframe `0.2.1` and Streaming `0.1.1` passed production checks; reviewer files are excluded from both upload ZIPs.
- Tempest Signal/Railway runtime contract and source are unchanged; no Railway deployment is required for this release.

## Signed Studio artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.7.4-x64.exe` | 135,013,464 | `3244ccc4df7796b9cab6b746e2e3fc266612c9abff9e86b26a45388798a3f489` |
| `Tempest-Streaming-Studio-Setup-1.7.4-x64.exe.blockmap` | 142,174 | `a98cd33de00e5dab2b21deb5431fd971943928838c65c4c6c126557811229ffc` |
| `latest.yml` | 385 | `a3161e0f1c31fb8556793c987738af1d1bbd1c92daaee96674dda9520ab6b552` |
| `Tempest-Streaming-Studio-1.7.4-x64.zip` | 169,005,342 | `47f7a8d6d96a7f793722af993a174fd8bcacbb3145914a82b45652c2232081bc` |

## Twitch companion and reviewer artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `tempest-mainframe-0.2.1.zip` | 95,102 | `8f96951582ae5910ee0738f87b853d9a80185945d5396504e5f53802738cb249` |
| `tempest-streaming-0.1.1.zip` | 14,340 | `ae5d6192882e5e552cee0e7e969991355917886f89d4752721aec5dbd6473026` |
| `Tempest-Mainframe-Reviewer-README.md` | 6,824 | `c326df402134601fad5b1af5cd8434c52c3681a3b8aa679f6514563942a231c9` |
| `Tempest-Streaming-Reviewer-README.md` | 5,916 | `5fc0dd64c407fbba844b2a57384922627057d6558f7ee9b74d1ce1be6d10c1fe` |
| `Tempest-Mainframe-Extension-Reviewer-Walkthrough.pdf` | 81,388 | `e48425699fc027af38ee2b10095e4096571bce91295188bcc42b2acc40aeb1e4` |
| `Tempest-Streaming-Extension-Reviewer-Walkthrough.pdf` | 81,152 | `96c65e546437446e4c132c5ec8a5a6c341d929f73ac1f076060fd6bc0fb336ec` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` contain the canonical Studio checksum, signature, and package records uploaded with the stable release.
