# Tempest Streaming Studio 1.6.0

Tempest Streaming Studio 1.6.0 completes the current Extension roadmap and turns the no-Bits Tempest Streaming Extension into the primary viewer experience while preserving compatibility with the approved Tempest Mainframe Extension.

## Highlights

- Added reusable viewer groups for interaction access without exposing private group names or rosters to viewers.
- Added a Studio-managed Media Library for alert audio, images, GIFs, and videos, including deduplication, previews, favorites, collections, editable metadata, safe removal, legacy-media adoption, and portable backups.
- Unified GIPHY downloads and verified Alert Pack media with the managed library.
- Expanded the Twitch Panel Designer with safe controls for every viewer-facing module and a live panel preview.
- Added the missing Mobile and Video Fullscreen Twitch entry points required by Asset Hosting.
- Completed the terminology and workflow pivot from the earlier Free/Bits selector to the no-Bits Tempest Streaming Extension.
- Hardened the hosted release pipeline with a production-only non-root Railway image, an in-container health check, exact Twitch upload packaging, and Linux CI verification.

## Compatibility

- Existing 1.5.x Studio data and Browser Source URLs remain compatible.
- Tempest Mainframe and Tempest Streaming can both authenticate with Tempest Signal during the Twitch review transition.
- The Twitch Extension remains independently versioned at `0.1.0`; installing Studio 1.6.0 does not replace or deactivate the approved Twitch-hosted Mainframe release.
- The shared Tempest protocol remains version `1.0`.
- Broadcast continues to own video, canvases, encoding, platform outputs, recording, and final audio levels. Studio continues to own accounts, chat, viewer interactions, Browser Source overlays, and orchestration.

## Operations

The Windows installer and portable ZIP are signed and published through the stable GitHub updater channel. Twitch-hosted Extension review and Asset Hosting publication remain separate from the Studio desktop release.
