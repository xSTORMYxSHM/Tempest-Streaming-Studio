# Tempest Streaming Studio 1.7.0 coordinated release checklist

Studio 1.7.0 remains a release candidate until every required manual gate passes against the exact packaged build. Tempest Broadcast 1.5.0 is the compatibility target for this release; its separate product version does not need to match Studio.

## Scope and ownership

- [x] Keep protocol version `1.0` for Studio/Broadcast compatibility.
- [x] Keep scenes, capture, encoding, recording, output services, and final audio routing owned by Broadcast.
- [x] Keep interaction authorization, state, rules, safety, layouts, alerts, polls, avatars, pets, and games owned by Studio.
- [x] Keep Tempest Mainframe panel-only and Tempest Streaming video-overlay-first.
- [x] Keep both companion Extensions free of Bits purchase and receipt handling.
- [x] Freeze 1.7.0 features after the release candidate is packaged; any code fix creates a new candidate and repeats affected gates.

## Automated gates

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm check` (166 tests, 0 failures, including Studio 1.5/EBS compatibility, companion placement, and hosted catalog validation)
- [x] Mainframe `0.2.0` and Streaming `0.1.0` production ZIPs build successfully.
- [x] Extension package verifier confirms required assets, production Signal URL, mock mode disabled, no localhost URL, no private key material, no source maps, and no mock catalog.
- [x] Built EBS CLI starts from `services/twitch-ebs/dist/cli.js` using Railway's `PORT` contract and reports healthy.
- [x] Public `https://signal.tempestmainframe.com/health` reports online before deployment.
- [x] Build and verify the signed Studio installer and portable ZIP candidate.
- [x] Run the packaged executable with a new isolated profile; it exited 0 and wrote data version 1.7.0.
- [x] Record merged release commit `74be080`, signed artifact content commit `972e7af`, candidate hashes, signatures, and test count in the release audit.

## Railway and database gates

- [x] Root Dockerfile installs the frozen workspace, builds EBS dependencies, exposes port 8080, and starts `services/twitch-ebs/dist/cli.js`.
- [x] EBS uses Railway's `PORT`, binds `0.0.0.0`, exposes `/health`, and handles `SIGINT`/`SIGTERM` shutdown.
- [x] PostgreSQL initialization uses idempotent table creation and additive migrations; catalog companion and destination fields are stored in versioned JSON.
- [x] Stage `TEMPEST_STREAMING_EXTENSION_CLIENT_ID` and `TEMPEST_STREAMING_EXTENSION_SECRETS` as Railway references to the existing listing credentials without revealing or copying secret values.
- [ ] After the final candidate deploy and rollback window, remove the legacy `TEMPEST_BITS_EXTENSION_CLIENT_ID`, `TEMPEST_BITS_EXTENSION_SECRETS`, and obsolete paid-product mapping as a separately approved cleanup; keep `DATABASE_URL`, Mainframe secret, and allowed Twitch OAuth Client ID.
- [x] Confirm Railway uses the root Dockerfile, one US West replica, the production custom domain on port 8080, restart-on-failure, and PostgreSQL.
- [x] Stage `/health` as the Railway deployment healthcheck; the two variable aliases and healthcheck were deployed together with the final candidate.
- [x] Deploy the exact merged release source `74be080` to Railway.
- [x] Confirm Railway reports the deployment successful, EBS listens after database initialization, the public health endpoint returns HTTP 200/online, and no restart loop is present.
- [ ] Confirm the signed Studio build reconnects its relay after the Railway deployment.
- [ ] Disconnect Studio during a queued Extension action, reconnect it, and confirm exactly-once delivery or a safe rejection.
- [x] Confirm prior successful Railway deployments remain available for rollback until the live rehearsal passes.

## Companion Extension gates

- [x] Build and checksum `tempest-mainframe-0.2.0.zip`.
- [x] Build and checksum `tempest-streaming-0.1.0.zip`.
- [ ] Upload the Mainframe package to its panel-only Twitch version and complete hosted-file review.
- [ ] Upload the Streaming package to its Video Overlay Twitch version and complete hosted-file review.
- [ ] Verify Mainframe-only, Streaming-only, and both-active channel configurations.
- [ ] Test desktop panel, mobile panel, video component where enabled, Video Overlay, and configuration views at Twitch-supported sizes.
- [ ] Trigger an accepted free action through Twitch JWT validation, EBS, Studio, queue, and Unified Stage.
- [ ] Confirm catalog destination filtering prevents panel-only actions from appearing in Streaming and overlay-only actions from appearing in Mainframe.
- [ ] Confirm the Studio feature-placement toggles live-publish panel-only, overlay-only, both, and hidden states, including the Streaming-only Dice default.
- [ ] Capture final discovery image and Twitch screenshots from the approved layouts.

## Studio and Broadcast 1.5.0 gates

- [x] Development Studio 1.7.0 connected to installed Broadcast 1.5.0 through protocol `1.0` without a compatibility warning during the October 4 offline rehearsal.
- [x] EBS 1.7 accepts the exact Studio 1.5 protocol-1 catalog envelope without `companions`, maps legacy `free` to Mainframe and legacy `bits` to Streaming, returns a backward-compatible acknowledgement, delivers the new free Streaming action through the unchanged interaction/result envelope, fails safely while Studio is offline, and recovers after reconnect.
- [x] EBS CLI starts with both the staged `TEMPEST_STREAMING_EXTENSION_*` aliases and legacy `TEMPEST_BITS_EXTENSION_*` variables present, preserving the rollback window.
- [x] The `LIve Space` scene was migrated with recoverable backups to one Unified Stage visual source plus the optional Interaction Audio lane and streamer avatar capture.
- [x] Offline Unified Stage diagnostics reported one client, nine active modules, and no current Broadcast log errors; an offline physical d6 roll settled and returned one result without duplicate clients.
- [x] Repeat the handshake using the exact signed 1.7.0 unpacked payload: one Broadcast 1.5.0 connection, protocol 1.0, ready, offline, and no duplicate connection.
- [ ] Verify every enabled Unified Stage module once in Broadcast and confirm disabled modules have zero clients/renderers and no sustained CPU/GPU work.
- [ ] Verify Twitch-event audio and Interaction Audio meters independently, including VOD-track behavior.
- [ ] Restart Studio while Broadcast remains open; confirm the existing Unified Stage source reconnects once without UUID changes or duplicate clients.
- [ ] Restart Broadcast while Studio remains open; confirm state snapshots restore and temporary effects do not replay.
- [ ] Verify Emergency Stop clears queues, Stage actions, games, sensors, alerts, and audio leases.
- [ ] Confirm legacy individual Browser Source URLs still function for rollback but are not active in the migrated scene.

## Upgrade, accessibility, and soak gates

- [ ] Upgrade an installed 1.6.0 Studio profile to 1.7.0 and verify credentials, layouts, alerts, interactions, actor packs, viewer profiles, world state, companions, and encrypted secrets.
- [ ] Back up and restore a 1.7.0 profile, including actor packs and new world state, with a pre-restore snapshot.
- [ ] Review keyboard navigation, reduced motion/flashing, Windows scaling, and 1080p/1440p layouts.
- [ ] Run at least a 30-minute Broadcast soak with idle time, gameplay, alerts, polls, avatars, emotes, Dice Box, reconnects, and disabled-module checks.
- [ ] Compare CPU, memory, GPU 3D/encode, VRAM, render lag, encode skips, and dropped frames against the current live setup.
- [ ] Review complete Studio, Broadcast, and Railway logs; resolve unexpected exceptions, reconnect loops, queue growth, and resource growth.

## Publication gates

- [x] Timestamp-sign every required Windows executable and native payload with the expected Tempest publisher certificate.
- [x] Verify `latest.yml`, blockmap, installer, portable ZIP, checksums, release manifest, release notes, privacy notice, installation guide, and third-party notices.
- [ ] Publish Railway first, then Twitch hosted assets, then the Studio updater only after the coordinated rehearsal passes.
- [ ] Confirm the updater downloads, verifies, installs, restarts, retains settings, and displays 1.7.0.
- [ ] Keep the prior Studio installer, prior Railway deployment, and Broadcast scene backups available through the first stable live stream.
