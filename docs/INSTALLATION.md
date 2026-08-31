# Installing Tempest Streaming Studio 1.0.0

## Windows installation

1. Download `Tempest-Streaming-Studio-Setup-1.0.0-x64.exe` from the official release.
2. Run the per-user installer and choose an installation directory if desired.
3. Open Tempest Streaming Studio and complete **Guided Setup**.
4. In OBS or compatible broadcast software, add these transparent Browser Sources using the base-canvas dimensions shown by Guided Setup:
   - Twitch Alerts: `http://127.0.0.1:4765/visual-alerts/twitch`
   - Interaction Alerts: `http://127.0.0.1:4765/visual-alerts/interactions`
   - Chat Overlay, optional: `http://127.0.0.1:4765/chat-overlay`
   - Emote Wall, optional: `http://127.0.0.1:4765/emote-wall`
   - Twitch Experiences, optional: `http://127.0.0.1:4765/twitch-experiences`
5. Enable **Control audio via OBS** for both alert sources. Keep Twitch Alert audio on live and recording tracks. Route Interaction Alert audio to the live track and exclude it from the VOD track when its media may be copyrighted.

The ZIP artifact is a portable application directory for testing or users who do not want an installer. Studio settings remain in the Windows per-user application-data directory, not beside the executable.

## Twitch setup

Open **Twitch Gateway** and select **Connect Twitch**, then sign in with the Twitch account that owns the channel and approve the requested permissions. The official Public Tempest application is built in, so streamers do not need a Twitch developer account, Client ID, or Client Secret.

Self-hosters and developers can expand **Advanced → Custom Twitch application and reward mappings** to supply a different Public Client ID. Tempest uses Device Code authorization and never accepts a Twitch application Client Secret.

Hype Train Takeover and Goal Overlay use broadcaster EventSub scopes. After upgrading from a build that predates Twitch Experiences, disconnect and reconnect the broadcaster once to authorize the added `channel:read:goals` permission.

The Chatbot is optional and uses a second, separate Twitch user authorization. Its credentials are encrypted and stored separately from the broadcaster.

The Twitch Extension/Panel is a universal Extension whose appearance is configured per channel. Its public-safe starter interactions correspond to a clean Studio catalog; publishing a separately tailored interaction catalog requires a matching Extension asset build and Studio configuration. Public Extension review and hosted EBS deployment are separate from installing Studio.

## Avatar controllers

Open **Apps + Connections → Avatar Controllers** to connect an optional avatar app.

- **Warudo:** select **Save Warudo Receiver**. Studio copies the bundled `TempestPerformanceNode.cs` file to the location you choose. Copy that file into Warudo's Playground folder, add **Tempest Performance Cue** to the blueprint, and connect its Activate and Release flows. The installer always carries this receiver with Studio.
- **VTube Studio:** enable **Allow Plugin API access** in VTube Studio, then select **Authorize in VTube Studio** in Tempest and approve the one-time prompt. No separate plugin file is required because the installed Tempest Studio application is the VTube Studio plugin client. The authorization token is stored with Windows encryption. After authorization, assign a loaded-model hotkey on each Interaction Alert that should control the Live2D avatar.

VTube Studio hotkey timing and auto-deactivation remain configured in VTube Studio. Refresh the hotkey list after changing models or adding hotkeys.

## Upgrading

Version 1.0.0 predates the in-app updater. Install the first updater-enabled release manually from the official GitHub release. After that one-time upgrade, Studio checks the stable release channel shortly after launch and every six hours while running. Open **Settings + About → Automatic updates** to check at any time.

Studio never downloads or restarts for an update without the user's approval. The downloaded Windows installer is verified against the expected Tempest publisher signature before Studio offers **Restart and Install**. The NSIS installer preserves per-user data. On first launch, Studio snapshots known configuration files, applies versioned data migrations, and refuses unsafe downgrades from a newer data version. Creating a Studio backup before a major upgrade remains recommended.

## Uninstalling

The Windows uninstaller removes application files. Per-user settings and media are retained so reinstalling does not erase a streamer configuration. Open **Settings + About → Open Data Folder** before uninstalling if you intend to archive or manually remove that data.
