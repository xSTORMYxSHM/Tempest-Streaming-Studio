# Tempest Streaming Studio 1.4.5

Tempest Streaming Studio 1.4.5 aligns its production controls with Tempest Broadcast so every output setting has one clear home.

## What changed

- Kick ingest, protected stream key, encoder, upload budget, and coordinated recording settings are configured only in Tempest Broadcast.
- Twitch Dual Format canvas selection, resolution, frame rate, scene links, audio routing, and Enhanced Broadcasting setup remain in Tempest Broadcast.
- Studio now presents those Broadcast-owned settings as read-only readiness and live-health information.
- Studio retains Twitch and Kick account authorization, stream title/category/tags/notifications, shared chat and chatbot tools, Stream Together, preflight, vertical preview, guarded Go Live, Kick-only recovery, emergency stop, and live monitoring.
- Compatibility command routes remain available to authenticated local clients, so the shared Studio/Broadcast production contract stays stable.

## Compatibility

- Use the matching production-capable Tempest Broadcast release for Dual Format and coordinated Twitch + Kick output.
- Existing Studio profiles, platform accounts, chat settings, alerts, workflows, and local media are preserved.
- No Twitch Extension update is required. The Extension remains on its independent `0.1.0` version line.

## Release integrity

The Windows installer and portable payload are timestamped with the Tempest publisher certificate. SHA-256 checksums and a machine-readable release manifest are included with the release assets.
