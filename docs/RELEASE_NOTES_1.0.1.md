# Tempest Streaming Studio 1.0.1

This release makes Studio friendlier for streamers, adds signed in-app updates, and expands avatar control.

## Highlights

- **Normal Twitch sign-in:** the official Public Tempest Twitch application is built in. Streamers no longer need a Twitch developer account, Client ID, or Client Secret. Self-hosters can still provide a custom Public Client ID under Advanced settings.
- **Signed in-app updater:** Studio can check the stable GitHub release channel, show release notes, download with visible progress after approval, verify the Tempest Windows publisher, and restart to install after approval.
- **Simpler navigation:** developer-oriented Workflows, Software, and Assets pages are removed from the end-user interface while their internal runtime support remains available where needed.
- **Avatar Controllers:** save the bundled Warudo Playground receiver directly from Studio, or authorize VTube Studio once and assign loaded-model hotkeys to Interaction Alerts. VTube Studio tokens are protected with Windows encryption.

## Installing and upgrading

Download and run `Tempest-Streaming-Studio-Setup-1.0.1-x64.exe`. The installer and packaged Windows binaries are timestamped with Azure Trusted Signing and verified against the configured Tempest Windows publisher.

Version 1.0.0 did not yet contain the updater, so 1.0.0 users need to install 1.0.1 manually once. After that upgrade, use **Settings + About → Automatic updates** for future stable releases. Existing per-user settings and media are preserved.

The portable ZIP is also provided. `SHA256SUMS.txt` and `release-manifest.json` can be used to verify downloads and signatures.

Public Twitch Extension review and hosted EBS availability are separate from this desktop Studio release.
