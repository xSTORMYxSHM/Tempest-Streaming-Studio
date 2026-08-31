# Tempest Streaming Studio

Current release: **1.0.0**

Tempest Streaming Studio is the interaction and orchestration hub for connected streaming tools. It turns viewer interactions and operator commands into safe, timed workflows across Warudo, Tempest Broadcast, Quartic Pulse, Data Horizon, and future Tempest-aware applications. Studio also manages application registrations and shared assets, while creative rendering and live production stay inside focused applications.

## Workspace

- `apps/studio-desktop` — Electron management interface.
- `apps/twitch-extension` — Video Component, Mobile viewer interface, configuration view, and local HTTPS test server.
- `services/tempest-bridge` — local authenticated API, interaction workflows, cooldowns, safety leases, application discovery, commands, and events.
- `services/twitch-ebs` — public Twitch JWT boundary, request rate/replay protection, and channel-bound Studio relay.
- `services/warudo-adapter` — local Bridge-to-Warudo blueprint cue adapter.
- `packages/tempest-contracts` — versioned manifests, workflow definitions, event envelopes, and runtime validation.
- `examples` — manifests showing how current and future Tempest applications register.
- `docs` — architecture and integration guidance.

The **Interaction Alerts** page includes starter viewer performances and can create additional custom interactions. Its cards mirror Twitch Alerts, including a canvas-aware drag-and-resize designer; Warudo and compatible broadcast reactions are optional per alert. The **Twitch Alerts** page keeps sound and visuals together for follows, subscriptions, gift subs, Bits, raids, rewards, and custom normalized event presets. Both designers control position, size, media/text layers, animation, templates, typography, timing, TTS, and isolated custom HTML/CSS/JavaScript.

OBS or another compatible broadcaster uses two transparent Browser Sources: `http://127.0.0.1:4765/visual-alerts/twitch` and `http://127.0.0.1:4765/visual-alerts/interactions`. The split keeps Twitch event audio on the VOD while interaction music can be routed away from the recording track. Studio queues both types through one FIFO stage so alerts never overlap. See `docs/SOUND_ALERTS.md` for setup.

The optional `http://127.0.0.1:4765/twitch-experiences` source renders Hype Train Takeover, Raid Portal, and Twitch Goal progress from Studio's broadcaster EventSub connection. These sustained presentations remain independent from the one-shot alert queue and share one full-canvas transparent source. See `docs/TWITCH_EXPERIENCES.md`.

The **Chat + Emotes** page replaces hosted chat effects with two independent local sources. `http://127.0.0.1:4765/chat-overlay` renders safely escaped message cards, while `http://127.0.0.1:4765/emote-wall` makes native Twitch emotes—and optional exact-name 7TV, BetterTTV, and FrankerFaceZ emotes—bounce across the canvas. Each source can be shown only on the scenes where it belongs. Third-party providers are opt-in and their media is proxied through the local Bridge. See `docs/CHAT_OVERLAY.md` and `docs/EMOTE_WALL.md` for setup.

The **Panel Designer** creates a channel-specific appearance for the universal Twitch Extension with a real 318 by 496 preview, safe theme controls, local persistence, and runtime delivery to the Local Panel. Hosted releases use the same validated theme model as per-broadcaster configuration, so streamers customize one shared Extension without supplying viewer-facing code.

The **Connections** page makes optional compatible applications explicit. Studio discovers broadcast canvas/source capabilities, starts the optional Warudo adapter automatically, and walks the operator through wiring Activate and Release into a blueprint.

Portable `.tempest-alert-pack` files contain one alert, its variants and verified local media. `.tempest-studio-backup` files preserve settings and portable media while deliberately excluding OAuth tokens, Extension secrets, API keys, application launch paths, and playback history. Settings + About can export a redacted diagnostics report for support.

## Development

For normal Windows use, install the versioned NSIS package and follow Guided Setup. See [Installation](docs/INSTALLATION.md) and [Privacy](docs/PRIVACY.md).

Source-development requirements: Node.js 22 or newer and pnpm 11 or newer.

```powershell
pnpm install
pnpm check
pnpm dev
```

Use [docs/LOCAL_TWITCH_TEST.md](docs/LOCAL_TWITCH_TEST.md) to exercise the signed Twitch Extension, localhost EBS, Studio, Broadcast sources, and Warudo blueprint before deploying the public EBS.

Use [docs/REPOSITORY_SETUP.md](docs/REPOSITORY_SETUP.md) for the GitHub repository boundary, secret-handling rules, and the hosted EBS deployment outline.

Studio starts an embedded authenticated Bridge on `127.0.0.1:4765`. The Bridge is also independently runnable with `pnpm bridge` for development and adapter testing.

Use the workflow simulator in **Interaction Workflows** to exercise a configured sequence without requiring every destination application. The simulator uses the same workflow engine as live interactions; delivery to absent applications is reported as simulated. Reversible actions receive leases and are explicitly released when those leases expire. Emergency Restore releases active actions immediately and disarms further viewer interactions until the operator re-arms them.

Studio is the sole owner of interaction-facing Twitch integration for the suite. It validates, deduplicates, logs, publishes, and routes canonical Twitch events at `/v1/integrations/twitch/events`; the desktop exposes authorization, connection state, the free Sound Alert catalog, and the topic directory. The hosted Extension Backend Service verifies Twitch JWTs, resolves PostgreSQL-backed broadcaster installations, and forwards catalog-approved interactions over a per-installation connection opened outbound by Studio. Broadcast retains OBS/Twitch stream-service authentication and Stream Information because those belong to output operation. Bits do not trigger bundled workflows.

The Chatbot stores its secondary account's OAuth tokens separately from the broadcaster, receives `channel.chat.message` through EventSub WebSocket, and manages commands, aliases, permissions, replies, cooldowns, workflow links, simulation, activity, raid welcomes, queued shoutouts, and assigned first-chat shoutouts. Its optional AutoMod layer can delete unapproved links, blocked terms, caps, and repeated-character spam or apply a bounded timeout through a moderator bot. Device authorization runs in an isolated temporary Twitch session and its cookies are erased when authorization completes or the window closes.

Weather and now-playing commands are optional providers rather than creator-specific defaults. Operators can configure a United States National Weather Service location and an AzuraCast station from the Chatbot page, then assign those handlers to any command. Clean installations contain no streamer account, location, station, canvas, or companion-application assumptions.

## Security boundary

The Bridge binds to localhost and requires a per-installation token for registry access, WebSocket connections, commands, and events. High-bandwidth video and audio frames do not pass through the JSON API. Applications advertise Spout, NDI, shared-memory, or other media endpoints through capabilities and output descriptors.

Studio's default-on Privacy Shield masks streamer-sensitive values and all five Browser Source URLs in the desktop UI. On Windows, the Studio and isolated authorization windows also request capture exclusion from compatible screen-capture methods.

## License and trademarks

Tempest Streaming Studio software is licensed under [GNU GPLv3](LICENSE). Tempest and Storm Horizon names, logos, and brand assets are governed separately by the [trademark policy](TRADEMARKS.md).
