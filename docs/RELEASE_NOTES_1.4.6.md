# Tempest Streaming Studio 1.4.6

Tempest Streaming Studio 1.4.6 adds the Studio control half of the Viewer Interactions platform and aligns with Tempest Broadcast System 1.4.6.

## Viewer interactions

- Expands Interaction Alerts into a catalog for stickers, GIFs, jumpscares, screen effects, sounds, counters, community actions, and future interaction types.
- Adds separate per-viewer and global cooldowns, staff/assigned-creator/individual access rules, explicit block lists, and an option to hide locked interactions.
- Adds streamer-fixed or viewer-selected click/tap placement. Studio renders normalized placement in its horizontal Browser Source while the silent vertical Browser Source uses the linked portrait layout.
- Adds persistent streamer-named counters shared by Twitch, Shared Chat, and Kick commands. Approved interactions can also adjust a selected counter.

## Twitch Extension editions and Bits

- Adds a persistent selector for **Tempest Mainframe (Free)** or **Tempest Streaming (Bits)** without changing the approved free Extension package.
- Publishes legacy Sound Alert catalog entries for the Free edition and verified interaction entries for the Bits edition.
- Adds a two-minute server-enforced pre-purchase reservation for access, cooldown, placement, product mapping, and online-state checks before Twitch opens its Bits confirmation dialog.
- Verifies Twitch-signed transaction receipts and deduplicates transaction IDs before relaying an accepted activation to Studio.

## Broadcast 1.4.6 alignment

- Uses Broadcast's additive interaction render contract `1.0` for an explicitly configured external Broadcast visual source, with a unique activation identity and automatic clear at the interaction lease boundary.
- Keeps catalog, identity, access, cooldowns, counters, queueing, assets, safety, and audit in Studio. Broadcast owns scene lookup, transforms, visibility, landscape/portrait mapping, and final output.
- Keeps interaction audio on one source-native path. Studio does not invoke legacy Broadcast audio unless a separate Broadcast audio source is explicitly configured, and suppresses Browser Source audio in that explicit legacy configuration.

## Audio reliability

- Preserves the single Web Audio implementation for Browser Source alerts, including fetch/decode playback, bounded media-element fallback, cancellation, and error logging.
- Includes a regression assertion that exactly one `playAudio` function is emitted, preventing the earlier duplicate-function override from silently disabling alert audio.

## Deployment note

The current Bits reservation, cooldown, and replay state is process-local. A single EBS process is appropriate for controlled production validation. Before horizontal scaling or restart-resilient paid delivery, move reservations, cooldowns, accepted transactions, and pending delivery state into durable shared storage.
