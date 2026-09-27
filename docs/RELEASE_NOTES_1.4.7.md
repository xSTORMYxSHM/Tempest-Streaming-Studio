# Tempest Streaming Studio 1.4.7

Tempest Streaming Studio 1.4.7 adds Studio-owned 3D Dice and restores reliable Browser Source audio in current Tempest Broadcast builds.

## 3D Dice

- Adds a dedicated Studio workspace and transparent local Browser Source at `http://127.0.0.1:4765/dice-overlay`.
- Supports common dice presets, bounded custom notation, modifiers, advantage, and disadvantage.
- Resolves every die with operating-system cryptographic randomness before animation, so the displayed faces and total cannot diverge from Studio's authoritative result.
- Includes optional roller and reason text, three materials, adjustable scale and display time, session-only roll history, and a clear control.
- Keeps the feature independent of Tempest Tabletop Engine and does not import its campaigns, characters, or other systems.

## Browser Source audio

- Fully fetches assigned Twitch and Interaction Alert audio before playback, then uses an OBS-capturable blob-backed media element.
- Retains bounded Web Audio compatibility fallback and writes fetch, start, resume, and decode failures to the Broadcast log.
- Moves the optional 3D Dice impact sound onto the same blob-backed media path so it follows the Browser Source's Broadcast audio routing.
- Keeps vertical alert sources silent and preserves existing alert volume, timing, cancellation, queueing, and track separation.

## Broadcast setup

Add the 3D Dice URL as a transparent Browser Source using the same base canvas dimensions as the stream. Enable **Control audio via OBS** only when using the optional impact sound, then select the intended monitor and output tracks in Broadcast.
