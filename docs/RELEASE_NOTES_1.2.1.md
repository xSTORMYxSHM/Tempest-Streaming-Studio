# Tempest Streaming Studio 1.2.1

This patch release improves the Discord Guests designer so reactive profiles are easier to recognize, customize, and place on stream.

## Highlights

- **Visible profile artwork:** assigned images now appear directly in each saved guest profile and on the canvas preview.
- **Four reactive states:** every person can have independent idle, speaking, muted, and deafened PNG, JPG, GIF, WebP, or AVIF artwork. Missing state artwork falls back safely to idle or the Discord avatar.
- **Manual canvas placement:** choose Manual canvas placement and drag each visible profile to its intended stream position. Percentage-based placement scales with the Broadcast canvas.
- **Hide the streamer:** the streamer's own reactive profile can be hidden while keeping every guest visible.
- **Portable settings:** all four image assignments and per-person canvas positions are included in Studio backups.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.2.1-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.2.0 can open **Settings + About → Automatic updates**, check for version 1.2.1, download it, and approve the restart. Existing alerts, scenes, Discord guest profiles, credentials, and local media are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
