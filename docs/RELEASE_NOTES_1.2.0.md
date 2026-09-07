# Tempest Streaming Studio 1.2.0

This release makes Discord Guests practical for end users with the official Tempest Discord application and a persistent offline guest library.

## Highlights

- **Normal Discord sign-in:** Studio now includes the public Tempest Discord application ID and uses the hosted Tempest Signal exchange. Streamers do not need to create a Discord developer application or store its client secret locally.
- **Saved Guest Library:** everyone detected in the selected voice channel is remembered by Discord User ID, allowing idle and speaking artwork to be edited after they leave.
- **Offline preparation:** add a guest by their Discord User ID before they join, assign separate idle and speaking PNG, JPG, GIF, WebP, or AVIF artwork, and let Studio fill in their Discord identity when it detects them later.
- **Safe live behavior:** saved offline guests never appear in the Browser Source. Only people currently present in the selected Discord voice channel render on stream.
- **Clear profile controls:** reset a guest's styling without losing the saved identity, or forget the profile entirely. Saved guest designs remain local and are included in Studio backups; Discord OAuth credentials remain excluded.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.2.0-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.1.1 can open **Settings + About → Automatic updates**, check for version 1.2.0, download it, and approve the restart. Existing alerts, scenes, Discord guest styling, Twitch Experiences, credentials, and local media are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
