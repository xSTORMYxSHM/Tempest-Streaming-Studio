# Tempest Streaming Studio 1.2.4

This release adds portable Discord Guest Profiles and gives every Twitch and Interaction Alert a clear maximum runtime.

## Discord Guest Profile sharing

- **Portable profiles:** export a guest's Discord ID, overlay name, accent, and idle, speaking, mute, and deafen images as one `.tempest-discord-profile` file.
- **Automatic matching:** another Tempest Streaming Studio user can import the profile before or after the guest joins; Studio matches it by Discord User ID.
- **Private by design:** shared profiles do not contain Discord authorization, server or channel history, original file paths, canvas placement, visibility, or ordering.
- **Verified media:** embedded PNG, GIF, JPG, WebP, and AVIF files are content-hashed and copied into Studio-managed storage during import. Existing profiles require confirmation before replacement.

## Alert runtime control

- **One hard stop:** the visible Maximum runtime setting now limits sound, visuals, text-to-speech, avatar reactions, safety leases, and shared queue playback.
- **All alert types:** the runtime is available on Interaction Alerts, Twitch Alerts, and Twitch Alert variants.
- **Long-audio fix:** Browser Source audio is stopped at the configured runtime even when the visual leaves the canvas sooner.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.2.4-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Users already running 1.2.3 can open **Settings + About → Automatic updates**, check for version 1.2.4, download it, and approve the restart. Existing alerts, scenes, Discord guest profiles, credentials, and local media are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.
