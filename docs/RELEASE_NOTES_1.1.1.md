# Tempest Streaming Studio 1.1.1

This patch release makes every sustained Twitch Experience customizable and introduces a built-in Mainframe Breach presentation for incoming raids.

## Highlights

- **Mainframe Breach raids:** Raid Portal now defaults to an animated security-perimeter breach with diagnostic code, scanlines, authorization alerts, the incoming broadcaster, and viewer count. The original circular Tempest Portal remains available from the Style menu.
- **Independent experience designers:** Hype Train Takeover, Raid Portal, and Goal Overlay each have their own Tempest, Mainframe, and Minimal style selection without changing the other experiences.
- **Local media layers:** assign PNG, JPG, GIF, WebP, AVIF, MP4, or WebM media independently to each experience, then choose foreground/background placement, fit, and opacity. Video remains muted inside the visual Browser Source.
- **Advanced creator controls:** each experience accepts separate HTML, CSS, and JavaScript with validation, stable element hooks, and event variables such as `{broadcaster}`, `{viewers}`, `{level}`, and `{percent}`. Custom code runs only inside the credential-free local Browser Source and should be used only when trusted.
- **Portable customization:** assigned Twitch Experience media and design settings are included in Studio backups without exposing the original computer's file paths.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.1.1-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.1.0 can open **Settings + About → Automatic updates**, check for version 1.1.1, download it, and approve the restart. Existing Twitch Experience enablement, duration, and colors are preserved. Raid Portal adopts the new Mainframe Breach style; choose **Tempest Portal** to retain the earlier circular appearance.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
