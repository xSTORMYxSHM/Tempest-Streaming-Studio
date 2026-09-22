# Tempest Streaming Studio 1.4.1

Tempest Streaming Studio 1.4.1 reorganizes the multi-platform controls introduced in 1.4.0 so every setting is easier to find during setup and live production.

## What changed

- Added a dedicated Twitch platform group and home for Twitch account setup, alerts, viewer-panel tools, Dual Format, and Stream Together Shared Chat access.
- Added a dedicated Kick platform page that keeps OAuth, signed-webhook chat delivery, ingest URL, stream key, upload capacity, and Broadcast destination settings together.
- Simplified Go Live into the shared production workspace for preflight, coordinated start, destination monitoring, and recovery after each platform is configured.
- Renamed the shared workspace to Chatbot + Live Chat and clarified the combined Twitch, Stream Together, and Kick workflow.
- Added direct navigation between each platform page and the shared production tools.

## Upgrade notes

- Existing Twitch, Kick, chatbot, Dual Format, and simulcast settings are preserved. This update changes where controls appear; it does not change their stored format or security boundary.
- Tempest Broadcast still owns video, canvases, encoders, output connections, and the encrypted Kick stream key.
- No Twitch Extension update is required. The Extension remains on its independent `0.1.0` version line.

## Release integrity

The Windows installer and portable payload are timestamped with the Tempest publisher certificate. SHA-256 checksums and a machine-readable release manifest are included with the release assets.
