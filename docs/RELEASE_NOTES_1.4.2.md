# Tempest Streaming Studio 1.4.2

Tempest Streaming Studio 1.4.2 is a focused performance maintenance release for streamers running Studio alongside Tempest Broadcast.

## What changed

- Studio's one-second live refresh now updates only the workspace currently on screen instead of rebuilding every hidden page.
- Renderer polling pauses while Studio is minimized and catches up with a full refresh when the window is restored.
- Alert history and media diagnostics no longer run in the fast polling path unless Activity & Diagnostics is open.
- Alert media availability checks are cached for 30 seconds to avoid repeatedly checking every assigned file on disk.
- The Emote Wall browser source no longer runs a continuous animation loop while it is empty, disabled, or hidden.

## Compatibility

- Twitch, Kick, chatbot, Stream Together, Dual Format, simulcast, alert, and overlay behavior is unchanged.
- Tempest Bridge APIs and saved-data formats are unchanged.
- No Twitch Extension update is required. The Extension remains on its independent `0.1.0` version line.

## Release integrity

The Windows installer and portable payload are timestamped with the Tempest publisher certificate. SHA-256 checksums and a machine-readable release manifest are included with the release assets.
