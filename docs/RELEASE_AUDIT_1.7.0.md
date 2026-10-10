# Tempest Streaming Studio 1.7.0 release audit

Date: October 4, 2026  
Status: release candidate preparation; not yet approved for public release

## Current result

The 1.7.0 working source passes the complete frozen workspace build/test gate, both Twitch companion packages pass production-asset verification, the built EBS CLI passes a local Railway-style startup and health check, and the already deployed Signal service is online. A prior development runtime rehearsal also confirmed protocol 1.0 communication with installed Tempest Broadcast 1.5.0 and the migrated Unified Stage scene.

The signed Windows candidate and isolated-profile smoke test now pass. Publication remains blocked on a final clean commit/rebuild, Railway deployment of that source, live Twitch surface tests, clean-upgrade validation, and the final on-air soak. Passing automated tests does not waive those gates.

## Source and automated verification

- Base commit at audit start: `cf6d99517f864c313f2db2edfc1ed2e43ca4d30b`
- Candidate state: working tree contains the 1.7.0 development changes and must receive a final commit before artifact approval.
- `pnpm install --frozen-lockfile`: passed.
- `pnpm check`: passed (135 tests, 0 failures after the compatibility and per-feature Extension placement regressions were added).
- Package versions: Studio/services/contracts `1.7.0`; Mainframe `0.2.0`; Streaming `0.1.0`.
- Extension package verification: passed.
- Local built EBS CLI startup using `PORT=4808`: passed; `/health` returned online.
- Public Signal health before deployment: online, three installations, no Studio relay connected at the time of inspection.
- Signed package verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.7.0`, hardened fuse wire `010011001`, 16 valid timestamped signature records).
- Packaged executable smoke test: passed with exit code 0 and a fresh isolated profile at data version 1.7.0.
- Docker and Railway CLIs are not installed on this workstation, so an image build and CLI deployment were not claimed.

## Extension candidate artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `apps/twitch-extension/release-assets/tempest-mainframe-0.2.0.zip` | 85,863 | `05eb721f05531ccb047c0fa97069b0dc576fb3fdd1ffbe5431f5bfda36c33979` |
| `apps/twitch-bits-extension/release-assets/tempest-streaming-0.1.0.zip` | 11,421 | `0be49c9b96e1bedae0795568cdf384e54bd393b73e6b4c34104219cadd0174a7` |

The generated machine-readable record is `release-assets/extension-package-manifest.json`. Rebuild and re-audit both ZIPs after any Extension source change; the hashes above identify only this candidate.

## Studio/Broadcast development rehearsal

- Target pair: Studio 1.7.0 development source and installed Tempest Broadcast 1.5.0.
- Integration protocol: `1.0`; no compatibility warning observed.
- Scene: `LIve Space`, backed up before migration.
- Consolidated sources: Unified Stage visual source, optional Interaction Audio lane, and streamer avatar capture.
- Unified diagnostics: one client, nine active modules, Dice ready, one interaction-audio client, and no current Unified Stage Broadcast log error.
- Offline physical d6 rehearsal: completed with one settled result and no duplicate client.

The exact signed unpacked 1.7.0 payload was then launched against the same installed Broadcast 1.5.0 build. It reported product 1.7.0, protocol 1.0, one ready Broadcast connection, one Unified Stage client, four intentionally enabled modules, and zero clients for disabled Chat Overlay, Emote Wall, Dice Box, Twitch Experiences, and Discord Voice modules. This validates the packaged payload handshake and true-off renderer behavior; the sustained soak is still required.

## Signed Studio candidate artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.7.0-x64.exe` | 134,962,424 | `92689e318d57719991fd621f4edcce0845df2913f5d75dd04d45329c9398c0dc` |
| `Tempest-Streaming-Studio-Setup-1.7.0-x64.exe.blockmap` | 142,208 | `1856b083ccc608aa1e24473fba6b8226d5d518d71a6f675346627c31405a5c6c` |
| `latest.yml` | 385 | `84c010e9c0550617f80c79e734335538b13db92f4c42dde7fb2ab6fe45a12715` |
| `Tempest-Streaming-Studio-1.7.0-x64.zip` | 168,925,651 | `ea7e3439940c64963956916d93f232f8364e4cafb887d2027797d84e38da63dc` |

The canonical checksum and signature records are in `release/SHA256SUMS.txt` and `release/release-manifest.json`.

## Railway/EBS assessment

- The root Dockerfile uses Node 24 Alpine, Corepack, frozen lockfile installation, the EBS dependency build, `EXPOSE 8080`, and `node services/twitch-ebs/dist/cli.js`.
- The CLI honors Railway's `PORT`, defaults to `0.0.0.0`, performs PostgreSQL initialization before listening, exposes `/health`, and closes on platform termination signals.
- Mainframe and Streaming secrets are separate server environment variables. Built hosted assets contain only the public Signal origin and no Extension secret.
- Companion manifests and per-item destinations are stored inside the existing versioned JSON catalog, so this release does not require a destructive database migration.
- Studio now persists per-feature panel/overlay placement locally and publishes catalog changes immediately. Each action can target Mainframe, Streaming, both, or neither; Dice defaults to Streaming only.
- Read-only Railway inspection confirmed Postgres online, one US West replica, automatic root Dockerfile detection, the production custom domain targeting port 8080, and restart-on-failure. `/health` is staged as the next deployment's healthcheck and has not been deployed separately.
- The live deployment still uses the legacy `TEMPEST_BITS_EXTENSION_CLIENT_ID`, `TEMPEST_BITS_EXTENSION_SECRETS`, and paid-product mapping names. The new `TEMPEST_STREAMING_EXTENSION_CLIENT_ID` and `TEMPEST_STREAMING_EXTENSION_SECRETS` names are now staged as Railway references to those existing values, so no secret value was displayed or copied. Together with `/health`, Railway reports three staged changes; they have not been deployed. Retire the paid mapping and legacy aliases only after the rollback window closes.

### Studio 1.5 compatibility result

The 1.7 EBS now has a permanent regression test built from the exact Studio 1.5 wire format:

- Protocol remains `1`; the WebSocket authorization, channel header, welcome, heartbeat, interaction, result, and catalog message types are unchanged.
- A 1.5 catalog has `extensionEdition` but no `companions`, destinations, or catalog revision. EBS 1.7 accepts it and maps `free` to Mainframe-only or `bits` to Streaming-only.
- Extra fields in the 1.7 catalogue acknowledgement are additive; the 1.5 client explicitly ignores acknowledgement contents.
- A free Streaming action from the new overlay was delivered to the simulated 1.5 client and acknowledged with its unchanged result envelope.
- While the 1.5 client was disconnected the EBS returned 503 rather than losing or misrouting the request; after reconnect and catalog republish, delivery resumed.
- The built CLI also started successfully with the staged new aliases and old rollback variables simultaneously present.

Studio 1.5 therefore remains supported after the Railway update. Its UI can select Mainframe or Streaming using the old mutually exclusive edition selector, so it can test either submitted Extension but cannot enable both simultaneously. Studio 1.7 is required for both companion toggles to be active together.

## Open release gates

1. Commit the final candidate and rebuild every artifact from that exact commit.
2. Inspect Railway variables privately, deploy the candidate, and verify health, migration, reconnect, and rollback.
3. Upload and test both Twitch packages in Mainframe-only, Streaming-only, and both-active configurations.
4. Complete clean 1.6.0 upgrade, backup/restore, accessibility/scaling, reconnect, audio-routing, and 30-minute soak gates.
5. Record final post-commit hashes, logs, and approvals before publishing the updater.
