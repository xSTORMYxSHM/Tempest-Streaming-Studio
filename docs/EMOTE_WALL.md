# Studio Emote Wall

Tempest Streaming Studio includes an independent, loopback-only Emote Wall Browser Source at `http://127.0.0.1:4765/emote-wall`. Add it to OBS or compatible broadcast software using the active base-canvas dimensions shown in Guided Setup. Keep it separate from Chat Overlay so it can be enabled only on the scenes where bouncing emotes belong.

The wall listens to structured fragments on Studio's normalized `viewer.chat.message` events. Live fragments arrive through the secondary Chatbot account's Twitch EventSub connection. Studio uses Twitch's supplied emote identifiers and format metadata instead of parsing native emote names. Animated Twitch emotes remain animated when enabled; supported Twitch GIF fragments use the HTTPS image URL supplied by the event.

## Optional provider catalogs

7TV, BetterTTV, and FrankerFaceZ can be enabled independently from **Chat + Emotes**. They are off by default and require no provider API keys. When enabled, Studio loads the provider's global catalog and the catalog associated with the broadcaster's numeric Twitch channel ID. Plain-text chat fragments are then compared to catalog entries by exact, case-sensitive token name. Punctuation is not stripped, so `Dance` can match while `Dance!` remains ordinary text. When multiple providers define the same name, the saved provider-priority order decides which visual is used.

Enabling a provider sends the channel's public numeric Twitch ID to that provider during catalog refresh. Catalogs are held locally for the Studio session. Provider image URLs never reach the Broadcast browser source: the Bridge validates approved provider CDN hosts, limits responses to supported image formats and four megabytes, and serves a bounded in-memory cache through `/emote-wall/media/...` on loopback. Provider availability is shown separately so one service outage does not disable native Twitch emotes or other providers.

The Chat + Emotes page controls:

- complete wall enablement;
- one to fifty simultaneous emotes;
- a three-to-30-second lifetime;
- base sprite size and bounce speed;
- animated-emote and GIF-fragment inclusion;
- independent 7TV, BetterTTV, and FrankerFaceZ enablement, health, priority, and manual refresh;
- optional community Emote Pyramids with configurable build window and cooldown;
- separate emote and pyramid previews plus an immediate clear action;
- Browser Source connection and active-emote monitoring.

Each emote receives an independent randomized start point, direction, scale variation, rotation, and velocity. Sprites bounce inside the current Browser Source viewport, so the same saved settings adapt to standard HD, QHD, ultrawide, and custom base canvases.

## Community Emote Pyramids

When enabled, Studio recognizes five consecutive emote-only messages that use the same emote in a `1 → 2 → 3 → 2 → 1` pattern. One viewer can complete the pattern, or the community can build it together. A mismatched message resets the in-progress pyramid, and the build window prevents an abandoned sequence from completing much later.

Completing the pyramid adds one centered, full-canvas celebration to the existing Emote Wall Browser Source. The celebration recreates the five-row pyramid, credits the participating viewers, and dissolves automatically. A configurable cooldown prevents repeated pyramids from overwhelming the stream. The **Preview Pyramid** action tests the celebration without chat activity.

Settings persist in `emote-wall.json` and are included in Studio backups. Active emotes are memory-only and disappear after their lifetime or when Studio closes. The Browser Source and event stream accept loopback requests only; the public page has no access to Studio's authenticated control API. Privacy Shield conceals the URL in Studio while leaving its copy button available.
