# Tempest Streaming Studio 1.3.0

This release gives streamers a simpler default interface and makes Twitch panel designs reliably follow the paired channel.

## Improvements and fixes

- **Streamer Mode by default:** everyday alert, overlay, chatbot, Twitch, panel, and avatar controls now use a cleaner, more approachable interface.
- **Advanced Mode remains available:** technical status, self-hosting, custom code, routing, provider configuration, and diagnostics are available through an opt-in setting when needed.
- **Synced Twitch panel designs:** saving a Panel Designer theme now securely publishes the validated design to the paired channel through Tempest Signal.
- **Live theme refresh:** the public Twitch panel automatically refreshes the hosted channel design while it is visible.
- **Independent Extension versioning:** the public Twitch extension remains on its own `0.1.0` release line instead of inheriting Studio's desktop version.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.3.0-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.2.6 can open **Settings + About → Automatic updates**, check for version 1.3.0, download it, and approve the restart. Existing alerts, scenes, Discord guest profiles, credentials, local media, and channel designs are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
