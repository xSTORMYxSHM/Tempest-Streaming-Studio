# Installing Tempest Streaming Studio 0.21.0

## Windows installation

1. Download `Tempest-Streaming-Studio-Setup-0.21.0-x64.exe` from the official release.
2. Run the per-user installer and choose an installation directory if desired.
3. Open Tempest Streaming Studio and complete **Guided Setup**.
4. In OBS or compatible broadcast software, add these transparent Browser Sources using the base-canvas dimensions shown by Guided Setup:
   - Twitch Alerts: `http://127.0.0.1:4765/visual-alerts/twitch`
   - Interaction Alerts: `http://127.0.0.1:4765/visual-alerts/interactions`
   - Chat Overlay, optional: `http://127.0.0.1:4765/chat-overlay`
5. Enable **Control audio via OBS** for both alert sources. Keep Twitch Alert audio on live and recording tracks. Route Interaction Alert audio to the live track and exclude it from the VOD track when its media may be copyrighted.

The ZIP artifact is a portable application directory for testing or users who do not want an installer. Studio settings remain in the Windows per-user application-data directory, not beside the executable.

## Twitch setup

Create a **Public** application in the Twitch Developer Console and paste its Client ID into Twitch Gateway. Tempest Streaming Studio uses Device Code authorization and never needs the Twitch application client secret.

The Chatbot is optional and uses a second, separate Twitch user authorization. Its credentials are encrypted and stored separately from the broadcaster.

The Twitch Extension/Panel is a universal Extension whose appearance is configured per channel. Its public-safe starter interactions correspond to a clean Studio catalog; publishing a separately tailored interaction catalog requires a matching Extension asset build and Studio configuration. Public Extension review and hosted EBS deployment are separate from installing Studio.

## Upgrading

Create a Studio backup before installing a newer build. The NSIS installer preserves per-user data. On first launch, Studio snapshots known configuration files, applies versioned data migrations, and refuses unsafe downgrades from a newer data version.

## Uninstalling

The Windows uninstaller removes application files. Per-user settings and media are retained so reinstalling does not erase a streamer configuration. Open **Settings + About → Open Data Folder** before uninstalling if you intend to archive or manually remove that data.
