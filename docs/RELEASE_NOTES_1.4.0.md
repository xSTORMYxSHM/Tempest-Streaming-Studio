# Tempest Streaming Studio 1.4.0

Tempest Streaming Studio 1.4.0 adds production control and monitoring for Twitch + Kick streams while keeping video responsibilities where they belong: Tempest Broadcast continues to own canvases, scenes, encoders, output connections, and the Kick stream key. Studio coordinates the workflow, reports readiness, and gives the streamer safe operational controls.

## Highlights

- Coordinate Twitch and Kick from one production Go Live page, with readiness checks for both destinations and configured upload headroom.
- Prepare and monitor Twitch Dual Format for horizontal and mobile-first 9:16 viewing. Studio controls supported Broadcast settings and previews; Broadcast performs the actual rendering and encoding.
- Use Twitch Stream Together Shared Chat inside Studio's Collaboration Center without keeping a separate browser window open.
- Monitor Twitch, Shared Chat, and Kick messages together while keeping replies and message identifiers on their originating platform.
- Connect Kick through OAuth with encrypted local credentials and signed webhook delivery through the paired Tempest Signal service.
- Run an off-air simulcast preflight and a session-only operator checklist before going live.
- Recover without unnecessarily interrupting Twitch: retry or stop only the Kick output, or use the guarded emergency stop for all outputs.
- Monitor live duration, delayed or lost Broadcast telemetry, output health, and a session-only incident timeline.

## Upgrade notes

- Existing Studio profiles and settings are preserved and migrated in place. Studio will not silently downgrade data written by a newer release.
- A compatible Tempest Broadcast build is required for Dual Format and coordinated Twitch + Kick output controls.
- The Kick stream key remains encrypted and owned by Broadcast; Studio never returns it through status, backup, or diagnostic data.
- Existing Twitch and bot connections may be reused. Kick must be connected separately before its chat and production readiness become available.

## Twitch Extension

No Twitch Extension update is required for this release. The public extension remains on its independent `0.1.0` version line because Dual Format, Stream Together Shared Chat, Kick, and simulcast coordination are Studio/Bridge/Broadcast features rather than viewer-panel changes.

## Release integrity

The Windows installer and portable payload are timestamped with the Tempest publisher certificate. SHA-256 checksums and a machine-readable release manifest are included with the release assets.
