# Tempest Streaming Studio 1.1.0

This release adds a local Discord guest overlay and makes Twitch and Interaction Alert placement practical across different Broadcast scenes.

## Highlights

- **Discord Guests:** add one local transparent Browser Source for the people in your selected Discord voice channel. Assign separate idle and speaking PNG, GIF, JPG, WebP, or AVIF images, use Discord avatars as fallbacks, arrange responsive layouts, and show names plus mute/deafen state. Local assignments are included in Studio backups; Discord credentials are not.
- **Scene-specific alert placement:** Twitch and Interaction Alerts can keep a global placement plus overrides for individual Tempest Broadcast scenes. Studio follows Broadcast's current scene automatically, so the same alert can fit different layouts without changing every scene.
- **Better positioning tools:** safe-edge and configurable grid snapping, exact horizontal and vertical centering, visible center guides, arrow-key nudging with undo history, and a silent persistent **Show on Canvas** mode make the real Browser Source usable as a positioning preview.
- **Private Discord authorization boundary:** the supported Discord Desktop RPC connector stores OAuth credentials with Windows encryption and exchanges authorization codes through the hosted service so the Discord client secret is never included in Studio. Production voice-channel connection requires the approved Tempest Discord application; the local overlay preview is available independently.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.1.0-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.0.1 can also open **Settings + About → Automatic updates**, check for version 1.1.0, download it, and approve the restart. Existing per-user settings, media, and alert placements are preserved; saved global alert positions become the fallback for every scene until a scene-specific override is added.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.

Public Twitch Extension review, hosted EBS availability, and Discord application approval are separate from this desktop Studio release.
