# Tempest Streaming Studio 1.7.0 release notes

Tempest Streaming Studio 1.7.0 establishes one control and rendering foundation for viewer-driven stream experiences. It is designed to work with Tempest Broadcast 1.5.0 through the existing protocol 1.0 integration while Tempest Broadcast continues to own capture, scenes, encoders, recording, and platform outputs.

## Unified Stage

- One `/unified-stage` Browser Source can render Twitch alerts, viewer interactions, on-stream polls, chat avatars, pets, games, Discord guests, emotes, Twitch experiences, and Dice Box results.
- Modules that are disabled in Studio do not create their renderer or event connection. Dice Box does not initialize WebGL until a roll begins.
- A separate optional Interaction Audio source preserves live-only/VOD-safe audio routing without recreating every visual Browser Source.
- Existing Broadcast scenes can be migrated with a backup-safe tool; legacy routes remain available for compatibility and rollback.

## Interactive Stage and avatars

- Added persistent, platform-scoped viewer profiles and an orientation-aware 2D stage with a default floor, gravity, platforms, collision correction, autonomous movement, direct controls, and protected regions.
- Added validated code-free Stage Actor packs, legacy sprite-strip and rig compatibility, and a canonical row-atlas format for predictable user-authored animation sets.
- Added the Storm Wisp starter actor, viewer palette and cosmetic choices, streamer crowd-size controls, Channel Point avatar unlocks, and Mainframe closet support.
- Added foundations for the community pet, duels and boss encounters, viewer attacks, gaze effects, shared safety limits, and Emergency Stop cleanup. Advanced content remains an iterative post-1.7.0 track.

## Studio workflow

- Reorganized everyday controls around Live Desk, Alerts, Interactive Stage, Chatbot, platform connections, and Settings.
- Unified Twitch-event and viewer-interaction alerts behind one queue, shared readiness and safety controls, and adjacent editors.
- Kept Twitch-event audio and viewer-interaction audio on separate routes for Broadcast track control.
- Added on-stream polls and consolidated previously separate visual surfaces into the Unified Stage.

## Twitch companion Extensions

- Tempest Mainframe `0.2.0` is the panel-only viewer hub.
- Tempest Streaming `0.1.0` is the free Video Overlay for live quick actions and placement targeting.
- A streamer can enable Mainframe, Streaming, or both. Studio publishes one channel installation, companion manifest, and destination-filtered catalog through Tempest Signal.
- Every viewer-facing feature has an independent placement toggle for the Mainframe panel and Streaming overlay. A feature may appear in either surface, both surfaces, or neither without disabling its local Studio system. The new viewer d20 action defaults to Streaming only.
- Neither companion uses Bits products, purchases, receipts, or paid actions.
- Production packages contain only Twitch-hosted assets and point to `https://signal.tempestmainframe.com`; Extension secrets remain server-side.

## Compatibility

- Studio product and service packages are versioned `1.7.0`; the public Extensions retain their independent versions.
- The Studio/Broadcast wire protocol remains `1.0`, preserving compatibility with the installed Tempest Broadcast 1.5.0 bridge release.
- The hosted EBS continues to accept Studio 1.5's legacy Extension catalog and interaction envelopes. Studio 1.5 may switch between Mainframe and Streaming through its old edition selector; Studio 1.7 enables both companions at once.
- Existing Stage Actor v1/v2 packs, legacy Extension edition data, saved layouts, and legacy Browser Source routes remain readable.

Railway production now runs merged release commit `74be080` with the `/health` deployment check and backward-compatible Extension variable aliases. Before publishing the desktop updater, complete the remaining live Twitch surface rehearsal, Studio relay reconnection, clean upgrade, and sustained on-air soak gates in `docs/RELEASE_CHECKLIST_1.7.0.md`.
