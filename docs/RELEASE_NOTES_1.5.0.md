# Tempest Streaming Studio 1.5.0

Tempest Streaming Studio 1.5.0 is a coordinated reliability and operations release for use with the matching Tempest Broadcast 1.5.0 build.

## Live Browser Source reliability

- Recovers Twitch and Interaction Alert audio when a local media fetch stalls by aborting the bounded request and retrying through the Browser Source's direct HTML media path.
- Keeps blob-backed media and Web Audio compatibility paths, source-native Broadcast routing, queue order, cancellation, and explicit playback diagnostics.
- Uses an OBS-compatible Emote Wall event stream and exposes disconnected-source diagnostics so a live source can recover without being recreated.
- Completes Dice Box rolls from the physically settled dice before the presentation timeout, including custom-range rejection rerolls.

## Chatbot quality of life

- Updates the default `!song` listener link to `https://www.tempestmainframe.com/listen` while preserving custom providers.
- Adds optional rotating automatic messages triggered by elapsed minutes or viewer chat activity, with Twitch, Kick, or combined destinations.
- Keeps automatic messages offline-aware and supports channel and bot-name substitutions.

## Studio and Broadcast ownership

- Studio continues to own platform accounts and stream information, chat and chatbot behavior, Stream Together, alerts, viewer interactions, counters, Dice Box, readiness, and live orchestration.
- Broadcast continues to own capture, canvases, encoders, Enhanced Broadcasting output, Kick ingest and stream-key storage, upload budgeting, recording, final audio routing, and live output execution.
- The release process now requires both installed candidates to pass one cross-app rehearsal and telemetry review before either stable build is published.

## Performance policy

The 1.4.7 production stream baseline showed very low render lag and encode skips under game load. Version 1.5.0 therefore preserves the current Enhanced Broadcasting quality settings and judges regressions by output counters and logs rather than aggregate GPU utilization alone. Vertical Canvas Backtrack remains an operator choice because disabling it trades replay capability for additional GPU headroom.

## Extension compatibility

The desktop release does not change the version of either Twitch Extension package. Tempest Mainframe (Free) and Tempest Streaming (Bits) remain on their independent `0.1.0` package line and require their own Twitch review/deployment process.
