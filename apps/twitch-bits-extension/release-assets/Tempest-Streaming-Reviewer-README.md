# Tempest Streaming — Twitch Review Walkthrough

- Extension version: 0.1.1
- Primary surface: Video Overlay
- Service endpoint: `https://signal.tempestmainframe.com`

## What the Extension does

Tempest Streaming is a free companion for Tempest Streaming Studio. It places a compact action deck over the Twitch video so viewers can activate streamer-selected interactions. Depending on the broadcaster's Studio configuration, available controls can include on-stream effects, interactive avatars, polls, battles, and click/tap placement on the video.

The Extension is the viewer control surface. Tempest Streaming Studio validates access rules and cooldowns, and its Unified Stage Browser Source renders accepted effects into the encoded stream. The public Tempest Signal service carries the channel-scoped catalog and action requests between them.

## Reviewer test — under two minutes

1. Open the live review channel with the Extension activated in its Video Overlay slot.
2. Reveal the Tempest Streaming overlay over the Twitch player.
3. Select **ACTIONS** in the overlay header.
4. Confirm the status reads **STUDIO ONLINE** and that one or more action cards appear.
5. Select any available action.
6. If a targeting grid appears, click or tap the desired point on the video.
7. Confirm the Extension displays an accepted message and the effect appears in the stream video.

Expected alternate states:

- **STUDIO OFFLINE** means the broadcaster's desktop Studio is not currently connected. Action controls remain unavailable until Studio reconnects.
- A locked action names its access restriction.
- A cooling-down action displays the remaining wait time.
- An empty deck means the broadcaster has not published any Streaming-destination actions.

No additional viewer account, password, or test credentials are required. Twitch authorization supplies the viewer identity used for per-viewer access and cooldown enforcement.

## Broadcaster configuration

1. Install and activate Tempest Streaming in the channel's Video Overlay slot.
2. Open the Extension's Twitch configuration page. Optionally choose the deck's left/right position, whether it starts collapsed or open, and whether the action count is shown. These public presentation preferences are saved by Twitch.
3. Open **Tempest Streaming Studio**.
4. Go to **Twitch → Companion Extensions**.
5. Pair the channel with **Tempest Signal**.
6. Enable **Tempest Streaming · Video Overlay**.
7. Choose which Studio features are available in the Streaming companion. Save the configuration; Studio publishes the action catalog, access rules, cooldowns, and placement settings automatically.
8. Keep Studio running during the stream.
9. Keep Studio's **Unified Stage** Browser Source active in the broadcast scene. This is where accepted visual effects are rendered into the encoded stream.

The Extension's own configuration page repeats these steps and includes the same reviewer test path.

## Functional coverage

- Viewer action catalog filtered to the Tempest Streaming companion.
- Twitch-authorized viewer identity and channel-scoped configuration.
- Individual and group access restrictions.
- Adjustable per-action cooldowns.
- Click/tap placement using normalized video coordinates.
- Poll, battle, avatar, and effect controls when enabled by the broadcaster.
- Clear online, offline, locked, cooldown, accepted, and error states.
- Streamer-controlled colors and presentation from Studio.
- Twitch-hosted quick preferences for deck position, starting view, and action-count visibility.
- Privacy Policy and Terms links on every viewer surface.

All actions are free. This version has no paid flow.

## Data and security notes

- Twitch's Extension helper supplies the signed authorization token.
- The hosted assets contain no Client Secret, shared secret, service credential, or private key.
- Requests use HTTPS to `signal.tempestmainframe.com`.
- The Extension does not ask viewers to create a separate Tempest account.
- Viewer identity is used only when Twitch provides it and only for authorization, per-viewer cooldowns, and interaction attribution.

## Version 0.1.1 change log

- Added the Tempest Streaming Video Overlay action deck.
- Added free on-stream action activation and click/tap placement.
- Added Studio-managed feature routing, group access, and cooldowns.
- Added interactive avatar, poll, battle, and current-stream controls.
- Added Studio-managed theme and presentation settings.
- Added Twitch-hosted quick preferences for deck position, starting view, and action-count visibility.
- Added explicit online/offline and action-result feedback.
- Added a complete quick-start and reviewer test inside the configuration view.
- Fixed the Twitch configuration surface so the broadcaster sees the quick preferences and setup walkthrough instead of an empty frame.

## Review availability

The public EBS remains available continuously. If Twitch needs a scheduled live encoded-stream demonstration, reply through the review thread so the broadcaster can keep Studio, Unified Stage, and a test stream online for the review window.

## Submission field — copy/paste version

Tempest Streaming is a free Video Overlay companion for Tempest Streaming Studio. To test it, open the live review channel, reveal the Extension over the Twitch player, select ACTIONS, confirm STUDIO ONLINE, and select any available action. If a targeting grid appears, click or tap a point on the video. The Extension will confirm acceptance and the resulting effect will appear in the stream video through Studio's Unified Stage Browser Source. No separate viewer account or test credentials are required. STUDIO OFFLINE is the expected state when the broadcaster's desktop Studio is not connected. The configuration page includes the full broadcaster setup and reviewer walkthrough. All actions are free; this version has no paid flow.
