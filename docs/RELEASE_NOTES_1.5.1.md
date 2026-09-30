# Tempest Streaming Studio 1.5.1

Tempest Streaming Studio 1.5.1 expands the free Tempest Mainframe Twitch Extension, reduces long-stream overhead, and hardens Studio's Browser Sources and provider connections. It preserves the Studio/Broadcast ownership boundary established in 1.5.0: Studio owns accounts, chat, viewer interactions, overlays, and orchestration, while Broadcast owns capture, encoding, platform outputs, recording, and final stream audio levels.

## Free Extension live utilities

- Adds identity-linked numeric poll voting with one vote per Twitch account and live or final results shared with Studio's Twitch and Kick chat poll.
- Adds physical 3D Dice controls for d4 through d100 and bounded custom 1–N rolls. Studio still generates the result from the locally rendered Dice Box physics.
- Publishes read-only live counters, active stream goals, Now Playing information, the next scheduled stream, current live-stream details, and a searchable command directory.
- Supports viewer placement for eligible stickers, GIFs, and effects while retaining Studio and Tempest Signal access checks and cooldown enforcement.
- Makes Twitch identity sharing reachable from restricted interaction cards and removes raw allow/block identities from public catalog responses.
- Displays custom Chatbot prefixes correctly on Extension counter cards.

## Studio performance and reliability

- Collapses Studio's always-on runtime polling into one summary request plus only the active workspace's data, reduces compatibility refresh frequency, coalesces overlapping refreshes, and skips unchanged workspace renders.
- Coalesces Extension catalog and Chatbot provider lookups, uses catalog ETags, suspends hidden viewer work, and bounds long-session runtime maps.
- Streams Asset Library checksums, GIPHY downloads, alert-audio fallback data, and imported Dice Box theme files instead of buffering entire files unnecessarily.
- Hard-limits Twitch, Kick, Discord, weather, Now Playing, hosted relay, and desktop provider response bodies and keeps timeouts active through streamed downloads.
- Pins the patched YAML parser dependency and reports no known production dependency vulnerabilities.

## Browser Source and dice hardening

- Keeps alert audio in the Browser Source so Broadcast continues to control final OBS mixer levels, with bounded compatibility fallback and lower peak memory use.
- Bounds third-party emote names, catalogs, media, and long-session state while keeping provider downloads cancellable.
- Includes the integrated localhost HTTPS preparation workflow for Twitch Extension testing, using a pinned mkcert helper when available and a Windows-native offline fallback.

## Extension deployment note

The desktop release includes the updated free Extension assets, but it does not publish them to Twitch. The Tempest Mainframe Extension must still be uploaded and released through the Twitch Developer Console as its own reviewed deployment. Both Twitch Extension packages retain their independent `0.1.0` package version.
