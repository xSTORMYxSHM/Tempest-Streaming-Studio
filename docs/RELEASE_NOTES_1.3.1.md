# Tempest Streaming Studio 1.3.1

This maintenance release restores reliable alert sound playback in Tempest Broadcast Browser Sources.

## Improvements and fixes

- **Reliable alert audio:** Twitch and Interaction Alert sounds now use Web Audio fetch and decoding, avoiding the Chromium media-element stall that could leave Broadcast mixer meters flat.
- **Compatibility fallback:** Studio retains a time-bounded media-element fallback when Web Audio is unavailable.
- **Visible diagnostics:** final playback failures are written to the Broadcast log instead of being silently hidden.
- **Preserved timing:** volume, sound delay, visual duration, queue order, clearing, and maximum-runtime limits continue to apply to alert audio.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.3.1-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.3.0 can open **Settings + About → Automatic updates**, check for version 1.3.1, download it, and approve the restart. Existing alerts, scenes, Discord guest profiles, credentials, local media, and channel designs are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
