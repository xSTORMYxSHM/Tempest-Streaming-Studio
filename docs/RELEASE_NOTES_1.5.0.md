# Tempest Streaming Studio 1.5.0

Tempest Streaming Studio 1.5.0 is a coordinated reliability and operations release for use with the matching Tempest Broadcast 1.5.0 build.

## Live Browser Source reliability

- Recovers Twitch and Interaction Alert audio when a local media fetch stalls by aborting the bounded request and retrying through the Browser Source's direct HTML media path.
- Keeps blob-backed media and Web Audio compatibility paths, source-native Broadcast routing, queue order, cancellation, and explicit playback diagnostics.
- Uses an OBS-compatible Emote Wall event stream and exposes disconnected-source diagnostics so a live source can recover without being recreated.
- Completes Dice Box rolls from the physically settled dice before the presentation timeout, records the result in Studio, and clears the on-stream presentation on schedule, including custom-range rejection rerolls.
- Adds eight locally bundled Dice Box styles—Classic, Smooth Edge, Gemstone, Carved Rock, Weathered Rust, Wooden, Dice of Rolling, and Blue-Green Metal—without adding the Tabletop application or a network dependency.

## Chatbot quality of life

- Updates the default `!song` listener link to `https://www.tempestmainframe.com/listen` while preserving custom providers.
- Adds optional rotating automatic messages triggered by elapsed minutes or viewer chat activity, with Twitch, Kick, or combined destinations.
- Keeps automatic messages offline-aware and supports channel and bot-name substitutions.
- Adds session-based numeric chat polls with 2–10 options, live aggregate results, and one final vote per Twitch or Kick account when the chatter sends only the option number.
- Expands the encrypted-key GIPHY library so a downloaded GIF can be assigned to any Interaction Alert, base Twitch Alert, or Twitch Alert variant from grouped targets or the alert card's shortcut.

## On-air workspace cleanup

- Reorganizes the sidebar around On Air, Create, and Studio tasks, with Stream Together promoted to its own primary On Air tab and account, output, and optional-app configuration behind a collapsed Setup + Connections drawer.
- Keeps Go Live at the bottom of the On Air group so collaboration, chat, and stream utilities remain ahead of the final output-control step.
- Promotes Live Desk, Go Live, 3D Dice, Stream Together, Unified Chat, and numeric polls while keeping bot identity, commands, moderation, providers, and automation in a separate expandable setup area.
- Runs Twitch Stream Together Backstage as a dedicated Studio call window with a Chrome-compatible Chromium identity, a persistent isolated Twitch sign-in, Twitch-only camera and microphone permission, and native screen-share selection. Live Desk calls its combined Twitch, Stream Together collaboration, and Kick feed **Unified Chat**, reserving **Shared Chat** for Twitch's own Stream Together feature.
- Keeps the private-information masking control permanently visible and automatically reveals the correct setup drawer when Guided Setup links to a hidden configuration page.
- Expands the Stream Goal overlay beyond Twitch's automatic channel goal: Studio can run persistent subscriber, follower, Bits, donation, or custom goals with an editable title, unit, current value, target, and live −1/+1 controls.

## Studio and Broadcast ownership

- Studio continues to own platform accounts and stream information, chat and chatbot behavior, Stream Together, alerts, viewer interactions, counters, Dice Box, readiness, and live orchestration.
- Broadcast continues to own capture, canvases, encoders, Enhanced Broadcasting output, Kick ingest and stream-key storage, upload budgeting, recording, final audio routing, and live output execution.
- The release process now requires both installed candidates to pass one cross-app rehearsal and telemetry review before either stable build is published.

## Performance policy

The 1.4.7 production stream baseline showed very low render lag and encode skips under game load. Version 1.5.0 therefore preserves the current Enhanced Broadcasting quality settings and judges regressions by output counters and logs rather than aggregate GPU utilization alone. Vertical Canvas Backtrack remains an operator choice because disabling it trades replay capability for additional GPU headroom.

## Extension compatibility

The desktop release does not change the version of either Twitch Extension package. Tempest Mainframe (Free) and Tempest Streaming (Bits) remain on their independent `0.1.0` package line and require their own Twitch review/deployment process.
