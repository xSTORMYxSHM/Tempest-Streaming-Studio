# Tempest Streaming Studio 1.7.1 release notes

Tempest Streaming Studio 1.7.1 is a focused patch for Unified Stage transparency, Tempest2D alert reactions, and interface-setting persistence.

## Unified Stage transparency

- Fixed transparent child modules becoming opaque when Chromium composited them inside the Unified Stage iframe stack.
- Interactive Stage, Twitch and Interaction Alert visuals, Chat Overlay, Discord Voice Overlay, and Poll Overlay now preserve their alpha channel in the composed Browser Source.
- The regression test loads every Unified Stage document and rejects iframe styles that can force an opaque backing surface.

## Tempest2D alert reactions

- Interaction Alerts and Twitch Alerts can independently enable Tempest2D and select an imported expression by name.
- Tempest2D settings persist through alert editing and portable alert-pack import.
- Preview and live playback route a bounded `avatar.expression.apply` command to Tempest2D and release it automatically at the alert's maximum runtime.
- Existing Warudo, VTube Studio, Broadcast reaction, visual, and audio routes continue to operate alongside Tempest2D.

## Studio interface

- Streamer Mode and Advanced Mode now save when the checkbox changes. The existing Save Interface button remains available, but tabbing to another workspace no longer leaves the selection dependent on an extra click.

## Compatibility

- The Studio/Broadcast wire protocol remains `1.0` and remains compatible with Tempest Broadcast 1.5.0.
- Existing settings and Stage Actor packs remain compatible with 1.7.0.
- Tempest Mainframe and Tempest Streaming retain their independent Twitch Extension versions; this desktop patch does not require a new Twitch-hosted asset upload.
