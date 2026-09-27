# 3D Dice Browser Source

Tempest Streaming Studio includes a self-contained 3D Dice workspace and loopback-only Browser Source at `http://127.0.0.1:4765/dice-overlay`. It uses the MIT-licensed `@3d-dice/dice-box` renderer with Babylon.js and Ammo physics, bundled locally with Studio. Add the source to Tempest Broadcast, OBS, or another compatible broadcaster using the base-canvas dimensions shown by Guided Setup. Keep the source above gameplay and camera sources on every scene where rolls should be visible.

This feature belongs entirely to Streaming Studio. It does not connect to Tempest Tabletop Engine, read campaigns or characters, or require the tabletop application to be installed or running.

## Rolling on stream

Open **3D Dice** in Studio and choose a common preset or enter bounded dice notation:

- `1d20`, `1d12`, `1d10`, `1d8`, `1d6`, `1d4`, or `1d100`
- `1d50` for a random number from 1 through 50
- `2d6+3` for multiple dice and a modifier
- `2d20kh1` for advantage
- `2d20kl1` for disadvantage

Studio accepts 1–20 dice, maximum values from 2–100, optional keep-highest/keep-lowest rules, and modifiers from -1000 through +1000. Dice Box performs the actual rigid-body roll in the Browser Source; the faces it reports after the dice stop moving become Studio's recorded result for streamer and chat rolls.

Dice Box includes standard `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, and `d100` models. For a custom maximum such as `d50`, Studio rolls the next available standard model and rerolls any face above the requested maximum. This rejection method is unbiased, and the final visible face always falls inside the selected 1–N range.

The optional reason and roller name appear with the result. Studio retains the latest 20 rolls in memory for the current session; roll history is not written to disk. Presentation settings persist locally in `dice-overlay.json`.

## Presentation and audio

The workspace provides Stormglass, Brass, and Obsidian colors, display timing from 2.5 to 15 seconds, 60–140% scale, an optional reason line, and optional synthesized impact audio. When sound is enabled, turn on **Control audio via OBS** for the Browser Source and route it to the desired live and recording tracks. The default is silent.

The Browser Source and its server-sent event stream accept loopback requests only. They do not expose Studio's authenticated control API. Privacy Shield conceals the local URL inside Studio while leaving its copy button available.
