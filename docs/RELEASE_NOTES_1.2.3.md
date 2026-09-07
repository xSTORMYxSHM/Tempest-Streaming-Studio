# Tempest Streaming Studio 1.2.3

This patch release stabilizes manual Discord Guest placement and removes visual refreshing from the live Browser Source.

## Fixes

- **Working manual placement:** profiles can be dragged immediately after selecting Manual canvas placement, and saved coordinates render in their correct canvas positions.
- **Stable editing:** the live Discord status refresh no longer rebuilds the profile editor while a streamer is typing or dragging. Unsaved names, order, colors, visibility, and X/Y values remain in place until saved.
- **No routine overlay flashing:** Discord Browser Source profiles and image elements are updated in place. PNGs and GIFs reload only when that person's selected visual state or assigned image actually changes.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.2.3-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.2.2 can open **Settings + About → Automatic updates**, check for version 1.2.3, download it, and approve the restart. Existing alerts, scenes, Discord guest profiles, credentials, and local media are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
