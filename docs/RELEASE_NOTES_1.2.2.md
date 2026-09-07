# Tempest Streaming Studio 1.2.2

This patch release fixes the Discord Guests profile library layout at common Studio window sizes.

## Fixes

- **Readable guest cards:** saved Discord profiles now use a wider responsive grid instead of shrinking into clipped columns when several people are displayed.
- **Complete profile controls:** canvas X/Y fields and idle, speaking, mute, and deafen image controls remain visible inside each card.
- **Responsive actions:** Save Person, Hide Streamer, Reset Style, and Forget User controls wrap cleanly without being cut off.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.2.2-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.2.1 can open **Settings + About → Automatic updates**, check for version 1.2.2, download it, and approve the restart. Existing alerts, scenes, Discord guest profiles, credentials, and local media are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
