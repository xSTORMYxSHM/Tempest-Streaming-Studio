# Tempest Mainframe 0.2.1 - Twitch Review Walkthrough

- Primary surface: Twitch Panel
- Required desktop application: Tempest Streaming Studio 1.8.0
- Studio release: https://github.com/xSTORMYxSHM/Tempest-Streaming-Studio/releases/tag/v1.8.0
- Public source repository: https://github.com/xSTORMYxSHM/Tempest-Streaming-Studio
- Service endpoint: `https://signal.tempestmainframe.com`

## What the Extension does

Tempest Mainframe is the free, detailed Twitch Panel companion for Tempest Streaming Studio. It gives viewers a channel-branded signal deck containing live stream information and streamer-enabled utilities. Depending on the broadcaster's Studio configuration, the panel can show Current Stream, Now Playing, Schedule, Goals, Polls, Counters, Commands, 3D Dice, Viewer Interactions, and Performances.

The Extension is a viewer control and information surface. Tempest Streaming Studio remains authoritative for live content, permissions, individual or group access, cooldowns, safety limits, and on-stream rendering. Tempest Signal carries the channel-scoped catalog and viewer requests between Twitch and Studio.

All actions are free. This version has no paid flow.

## Reviewer test - under two minutes

1. Open the live review channel with Tempest Mainframe activated in a Twitch Panel slot.
2. Open the Tempest Mainframe panel.
3. Confirm the panel header reports that Studio is online.
4. Confirm Current Stream and any enabled informational modules display the latest Studio data.
5. Select an enabled free interaction, poll, counter, command, or dice control.
6. Confirm the panel reports that the action was accepted or displays its result.
7. If the control requires a known viewer, select **Share Twitch Identity** when prompted and repeat the action.
8. Confirm restricted and cooling-down controls explain why they are unavailable.

No additional viewer account, password, or test credentials are required. Twitch authorization supplies the viewer identity used for one-vote polls, per-viewer cooldowns, access rules, and interaction attribution.

## Broadcaster configuration

1. Install and activate Tempest Mainframe in a Twitch Panel slot.
2. Open the Extension's Twitch configuration page.
3. Choose the channel theme, colors, typography, card layout, density, and visible panel modules.
4. Select **Save Panel Appearance**. These public presentation preferences are stored through Twitch's Configuration Service.
5. Download and open Tempest Streaming Studio 1.8.0 from the release link above.
6. In Studio, go to **Twitch -> Companion Extensions**.
7. Pair the channel with **Tempest Signal** and enable **Tempest Mainframe · Panel**.
8. Choose which Studio features are available in Mainframe and save.
9. Keep Studio running during the stream.

Hosted builds do not expose the EBS address or local mock-mode controls. Those developer tools remain available only when running the source locally.

## Module coverage

- **Current Stream:** live title, category, viewer count, and channel state supplied by Studio.
- **Now Playing:** current station or track information and the public Listen link.
- **Schedule:** the channel's next scheduled stream.
- **Goal:** subscription, follower, Bits, or custom progress published by Studio.
- **Poll:** one active numeric poll with one recorded vote per identified Twitch viewer.
- **Counters:** streamer-defined death, restart, or other counters.
- **Commands:** the channel's published chatbot commands and permission information.
- **3D Dice:** streamer-enabled dice choices and custom ranges; Studio renders and records the physical result.
- **Viewer Interactions:** free channel actions subject to Studio-managed access and cooldowns.
- **Performances:** sound and performance triggers enabled by the broadcaster.

## Expected states

- **Studio online:** live information and eligible controls are available.
- **Studio offline:** the panel still loads, identifies the connection state, and keeps unavailable live controls disabled until Studio reconnects.
- **Identity required:** the viewer must select **Share Twitch Identity** before using a one-vote or identity-restricted feature.
- **Locked:** Studio denied the action because of a broadcaster-defined access rule.
- **Cooldown:** the action recently ran and displays its remaining wait time.
- **Empty module:** the broadcaster has not published data for that module or chose to hide it.

## Data and security notes

- Twitch's Extension helper supplies the signed authorization token.
- The hosted assets contain no Client Secret, shared secret, service credential, stream key, or private key.
- Requests use HTTPS to `signal.tempestmainframe.com`.
- The Extension does not ask viewers to create a separate Tempest account.
- Twitch-hosted configuration contains public panel presentation settings only.
- The frontend uses human-readable HTML, CSS, and vanilla JavaScript; application code is not minified or obfuscated.

## Version 0.2.1 change log

- Reorganized the configuration page around broadcaster setup, panel appearance, and viewer-facing modules.
- Added a three-step broadcaster quick start.
- Added a complete reviewer test inside the Twitch configuration page.
- Added clear offline, identity, locked, cooldown, and empty-module expectations.
- Hid EBS routing and local mock-mode controls from Twitch-hosted builds.
- Retained local developer routing controls for source previews.
- Clarified that Studio owns live data, permissions, cooldowns, safety, and routing.
- Updated the public Studio download and source repository references to 1.8.0.

## Review availability

Tempest Signal remains publicly available continuously. Full live-control testing requires Tempest Streaming Studio and a live review channel. If Twitch needs a scheduled demonstration, reply through the review thread so Studio and a test stream can be kept online for the agreed review window.

## Submission field - short copy/paste version

Tempest Mainframe is the free Twitch Panel companion for Tempest Streaming Studio. To test it, open the live review channel, open the Mainframe panel, confirm Studio is online, verify Current Stream or another enabled information module, then select an enabled free interaction, poll, counter, command, or dice control. If identity is required, select Share Twitch Identity and repeat the action. The panel reports accepted, locked, cooldown, offline, and error states directly. No separate viewer account or test credentials are required. Download Studio 1.8.0 at https://github.com/xSTORMYxSHM/Tempest-Streaming-Studio/releases/tag/v1.8.0 and inspect the public source at https://github.com/xSTORMYxSHM/Tempest-Streaming-Studio.
