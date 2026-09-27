# Tempest Streaming Studio 1.4.7

Tempest Streaming Studio 1.4.7 adds Studio-owned 3D Dice and restores reliable Browser Source audio in current Tempest Broadcast builds.

## 3D Dice

- Adds a dedicated Studio workspace and transparent local Browser Source at `http://127.0.0.1:4765/dice-overlay`.
- Supports common dice presets, bounded custom notation, modifiers, advantage, and disadvantage.
- Uses the official MIT-licensed Dice Box 1.1.4 package with Babylon.js and Ammo physics; the faces that physically settle on stream are the results Studio records.
- Supports any range from 1–2 through 1–100. Nonstandard ranges use an unbiased physical rejection reroll—for example, d50 rolls a d100 again whenever it settles above 50.
- Includes optional roller and reason text, three colors, adjustable scale and display time, session-only roll history, and a clear control.
- Keeps the feature independent of Tempest Tabletop Engine and does not import its campaigns, characters, or other systems.

## Browser Source audio

- Fully fetches assigned Twitch and Interaction Alert audio before playback, then uses an OBS-capturable blob-backed media element.
- Retains bounded Web Audio compatibility fallback and writes fetch, start, resume, and decode failures to the Broadcast log.
- Moves the optional 3D Dice impact sound onto the same blob-backed media path so it follows the Browser Source's Broadcast audio routing.
- Keeps vertical alert sources silent and preserves existing alert volume, timing, cancellation, queueing, and track separation.

## Broadcast setup

Add the 3D Dice URL as a transparent Browser Source using the same base canvas dimensions as the stream. Enable **Control audio via OBS** only when using the optional impact sound, then select the intended monitor and output tracks in Broadcast.
