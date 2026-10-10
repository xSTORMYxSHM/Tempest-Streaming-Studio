# Tempest Streaming Studio 1.7.0 release audit

Date: October 10, 2026  
Status: release candidate preparation; not yet approved for public release

## Current result

The exact 1.7.0 source commit `972e7af` passes the complete frozen workspace build/test gate, both Twitch companion packages pass production-asset verification, and a freshly rebuilt signed Windows candidate passes signature, fuse, and isolated-profile smoke verification. A prior development runtime rehearsal also confirmed protocol 1.0 communication with installed Tempest Broadcast 1.5.0 and the migrated Unified Stage scene.

Publication remains blocked on Railway deployment of this source, live Twitch surface tests, clean-upgrade validation, and the final on-air soak. Passing automated tests does not waive those gates.

## Source and automated verification

- Candidate commit: `972e7af` (`Package Mainframe as a panel-only extension`), including merge commit `dc6e349`.
- Candidate state: clean working tree at artifact build time.
- `pnpm install --frozen-lockfile`: passed.
- `pnpm check`: passed (166 tests, 0 failures).
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
| `apps/twitch-extension/release-assets/tempest-mainframe-0.2.0.zip` | 94,025 | `d429b23c11e0b9a5fa85775fe3470c842821d9414263019796a4bd447a84bb35` |
| `apps/twitch-bits-extension/release-assets/tempest-streaming-0.1.0.zip` | 11,776 | `5f18c0eacc25892ffbef680090385b6b072cc3ba61318ba8c400470f989d18c3` |

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
| `Tempest-Streaming-Studio-Setup-1.7.0-x64.exe` | 135,004,560 | `7199cacf354a2d4d386f677b1c92f2547db186c86a7f2be2108738850fd2973c` |
| `Tempest-Streaming-Studio-Setup-1.7.0-x64.exe.blockmap` | 141,844 | `e3b114cbd661b5e178d70a548aadcc60e3bbd2992885d047ede1e12094d2ca99` |
| `latest.yml` | 385 | `17615da18c7ae910a6657aa0cbb3f1a53584a86854fee63dec333f91db16ed4c` |
| `Tempest-Streaming-Studio-1.7.0-x64.zip` | 168,992,550 | `0556b5370aa86a4082c3c1ef5b77274594ad6442bd197b560afca6fd948135d3` |

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

1. Inspect Railway variables privately, deploy the candidate, and verify health, migration, reconnect, and rollback.
2. Upload and test both Twitch packages in Mainframe-only, Streaming-only, and both-active configurations.
3. Complete clean 1.6.0 upgrade, backup/restore, accessibility/scaling, reconnect, audio-routing, and 30-minute soak gates.
4. Record final deployment logs and approvals before publishing the updater.
