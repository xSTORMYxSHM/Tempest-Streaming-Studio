# Tempest Streaming Studio

Current stable version: **1.5.1**

Tempest Streaming Studio is the interaction and orchestration hub for connected streaming tools. It turns viewer interactions and operator commands into safe, timed workflows across Tempest 2D, Warudo, Tempest Broadcast, Quartic Pulse, Data Horizon, and future Tempest-aware applications. Studio also manages application registrations and shared assets, while creative rendering and live production stay inside focused applications.

## Workspace

- `apps/studio-desktop` — Electron management interface.
- `apps/twitch-extension` — Video Component, Mobile viewer interface, configuration view, and local HTTPS test server.
- `services/tempest-bridge` — local authenticated API, interaction workflows, cooldowns, safety leases, application discovery, commands, and events.
- `services/twitch-ebs` — public Twitch JWT boundary, request rate/replay protection, and channel-bound Studio relay.
- `services/warudo-adapter` — local Bridge adapters for Warudo blueprint cues and direct Tempest 2D controls.
- `packages/tempest-contracts` — versioned manifests, workflow definitions, event envelopes, and runtime validation.
- `examples` — manifests showing how current and future Tempest applications register.
- `docs` — architecture and integration guidance.

The **Interaction Alerts** page includes starter viewer performances and can create additional custom interactions. Its cards mirror Twitch Alerts, including a canvas-aware drag-and-resize designer; Tempest 2D, Warudo, and compatible broadcast reactions are optional per alert. A Tempest 2D action can select an expression, motion, or Live2D parameter directly. The **Twitch Alerts** page keeps sound and visuals together for follows, subscriptions, gift subs, Bits, raids, rewards, and custom normalized event presets. Both designers control position, size, media/text layers, animation, templates, typography, timing, TTS, and isolated custom HTML/CSS/JavaScript. Each alert can keep a global placement plus named overrides that automatically follow Broadcast’s active scene. Grid/safe-edge snapping, exact center controls, arrow-key nudging, and a silent **Show on Canvas** mode make it possible to arrange an unsaved design against the real Broadcast scene.

Viewer Interactions can be limited to reusable streamer-named groups such as campaign players, collaborators, or regulars. Studio accepts Twitch logins, verifies and caches their numeric Twitch identities through the connected bot account, and lets multiple interactions reuse the same locally managed group.

The **Media Library** copies reusable alert sounds, images, GIFs, and videos into Studio-managed local storage. Imports are content-addressed and deduplicated with a streamed SHA-256 hash, can be searched, previewed, favorited, tagged, grouped into collections, and assigned to Interaction Alerts, Twitch Alerts, and individual alert variants. Visual previews load only when requested and audio preview playback is single-instance. GIPHY selections and verified Alert Pack media enter the same catalog. **Adopt Assigned Media** migrates older alert assignments into managed storage only when requested. Studio blocks deletion while an item is still in use and never modifies the original imported file. Managed library items and their organization metadata are included in portable Studio backups.

OBS or another compatible broadcaster uses two transparent Browser Sources: `http://127.0.0.1:4765/visual-alerts/twitch` and `http://127.0.0.1:4765/visual-alerts/interactions`. The split keeps Twitch event audio on the VOD while interaction music can be routed away from the recording track. Studio queues both types through one FIFO stage so alerts never overlap. See `docs/SOUND_ALERTS.md` for setup.

The **3D Dice** workspace is a self-contained Studio tool at `http://127.0.0.1:4765/dice-overlay`. The locally bundled Dice Box renderer uses WebGL rigid-body physics to roll, bounce, collide, and settle standard dice; those settled faces become the recorded streamer or chat result. Custom 1–N ranges through 100 use unbiased rerolls on the next standard die. The default `!roll` / `!dice` command accepts the same notation from Twitch, Stream Together, and Kick chat and reports the physical result back to its originating platform. It does not connect to or import any part of Tempest Tabletop Engine. See `docs/DICE_OVERLAY.md`.

The optional `http://127.0.0.1:4765/twitch-experiences` source renders Hype Train Takeover, Raid Portal, and Twitch Goal progress from Studio's broadcaster EventSub connection. Each has independent presets, local image/GIF/video layers, and advanced HTML/CSS/JavaScript; Raid Portal includes a Mainframe Breach presentation. These sustained presentations remain independent from the one-shot alert queue and share one full-canvas transparent source. See `docs/TWITCH_EXPERIENCES.md`.

The **Chat + Emotes** page replaces hosted chat effects with two independent local sources. `http://127.0.0.1:4765/chat-overlay` renders safely escaped message cards, while `http://127.0.0.1:4765/emote-wall` makes native Twitch emotes—and optional exact-name 7TV, BetterTTV, and FrankerFaceZ emotes—bounce across the canvas. Each source can be shown only on the scenes where it belongs. Third-party providers are opt-in and their media is proxied through the local Bridge. See `docs/CHAT_OVERLAY.md` and `docs/EMOTE_WALL.md` for setup.

The **Discord Guests** page provides a local Reactive Images-style source at `http://127.0.0.1:4765/discord-voice`. Each voice participant is saved to an editable local library keyed by Discord User ID, so streamers can assign separate idle, speaking, muted, and deafened PNGs or GIFs while the guest is offline or create their profile by ID before they join. Assigned artwork appears in the person's Studio profile, Discord avatars remain the fallback, and a canvas-sized preview supports per-person drag placement. The overlay also includes automatic layouts, names, status indicators, per-person visibility, and a dedicated option to hide the streamer's own profile. Only people currently in the selected voice channel appear in the Browser Source. The desktop connector uses supported local RPC and never uses a self-bot. See `docs/DISCORD_VOICE_OVERLAY.md`.

The **Chatbot** page includes a native Stream Together Collaboration Center. Studio monitors home-channel and Shared Chat messages through EventSub, detects Shared Chat session changes, shows the host and participating channels, and can post through the connected bot account. The live monitor is memory-only and removes the need to keep a separate browser open just to watch Shared Chat; Twitch continues to own the audio/video Backstage call.

Studio numeric polls also appear in Tempest Streaming Extension while voting is active and retain final results until the operator clears them. A viewer who shares Twitch identity can vote once from the Panel or Video Component; the same numeric Twitch account is deduplicated across Extension and chat voting. Kick viewers continue voting from Kick chat, so all responses feed the same Studio totals without involving Bits.

Tempest Streaming Extension also publishes Studio's enabled 3D Dice utility as a compact preset picker with an exact custom 1–N maximum from 2 through 100. Viewer rolls honor the same open/assigned-creator access policy as other panel interactions, share bounded cooldowns across every die choice, and start only when the local Dice Browser Source is ready. The physical result remains on stream; no roll is generated in the public service.

Enabled Chatbot counters are published to Tempest Streaming Extension as read-only live totals. A command such as `!death` or an operator/interaction adjustment updates the card immediately, while all counter changes continue to pass through Studio rather than a public viewer endpoint.

The active Twitch-native or Studio-managed stream goal is also published as a read-only progress card in Tempest Streaming Extension. Studio remains the source of truth, sends updates as they happen, and never publishes its local goal preview.

If the Chatbot's optional AzuraCast provider is configured, Tempest Streaming Extension shows its current station and track with a Twitch-mediated **Listen** action. Studio refreshes this passive card only while connected to the Extension relay; the provider API and direct audio stream URL remain local.

Tempest Streaming Extension also shows the next verified Twitch schedule segment when one exists, formatted in each viewer's local time. It reuses Studio's existing schedule cache and disappears cleanly when no upcoming stream is listed.

Tempest Streaming Extension's Current Stream card reuses the Chatbot's cached Twitch status and channel information to show live/offline state, title, category, uptime, and viewer count without making per-viewer Helix calls or adding an OAuth scope.

Tempest Streaming Extension also includes a searchable read-only directory of enabled chat commands. Viewers can see each trigger, up to five aliases, its required role, and whether it accepts Stream Together Shared Chat; replies, workflow assignments, and other Chatbot configuration never leave Studio.

The **Dual Format** page is the production readiness and control surface for Twitch horizontal plus mobile-first vertical output. Studio reads the live Broadcast canvas, Enhanced Broadcasting, scene-link, audio-route, preview, and streaming state; off-air controls can request a 1080 × 1920 or 720 × 1280 additional canvas without moving encoding or stream credentials out of Broadcast. See [docs/TWITCH_DUAL_FORMAT.md](docs/TWITCH_DUAL_FORMAT.md).

The **Go Live** page coordinates that Twitch Dual Format output with a separate Kick horizontal output. Broadcast encrypts the Kick stream key with Windows Data Protection, shares the already-running horizontal encoder, applies the OBS reconnect policy, and reports each destination independently. Studio provides preflight checks, upload reserve warnings, optional coordinated recording, Kick-only recovery/stop, emergency stop, and a session-only live-operations timeline without retaining or displaying the key. See [docs/TWITCH_KICK_SIMULCAST.md](docs/TWITCH_KICK_SIMULCAST.md).

The same Collaboration Center now supports production Kick chat through Kick's official OAuth 2.1 API and signed webhooks. Messages are labeled by platform, commands share one policy and cooldown engine, and replies stay on the platform where the command originated. See [Kick Chat Integration](docs/KICK_CHATBOT.md) for the developer-app and hosted-relay setup.

The **Panel Designer** creates a channel-specific appearance for the universal Twitch Extension with a real 318 by 496 preview, safe theme controls, local persistence, and runtime delivery to the Local Panel. Hosted releases use the same validated theme model as per-broadcaster configuration, so streamers customize one shared Extension without supplying viewer-facing code.

The **Connections** page makes optional compatible applications explicit. Studio discovers broadcast canvas/source capabilities and starts the Warudo and Tempest 2D adapters automatically. Tempest 2D receives timed controls on loopback UDP `127.0.0.1:19193`, so its chroma-keyed or transparent OBS output does not need to pass through Warudo.

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

Use the test controls inside Twitch Alerts, Interaction Alerts, and Chatbot to exercise the same routes used by live interactions. The Event Log reports delivery and restoration activity. Reversible actions are released automatically when their configured time expires. **Emergency Restore** releases active actions immediately and disarms further viewer interactions until the operator re-arms them.

Studio is the sole owner of interaction-facing Twitch integration for the suite. It validates, deduplicates, logs, publishes, and routes canonical Twitch events at `/v1/integrations/twitch/events`; the desktop exposes authorization, connection state, the free Sound Alert catalog, and the topic directory. The hosted Extension Backend Service verifies Twitch JWTs, resolves PostgreSQL-backed broadcaster installations, and forwards catalog-approved interactions over a per-installation connection opened outbound by Studio. Broadcast retains OBS/Twitch stream-service authentication and Stream Information because those belong to output operation. Bits do not trigger bundled workflows.

The Chatbot stores its secondary account's OAuth tokens separately from the broadcaster, receives `channel.chat.message` through EventSub WebSocket, and manages commands, aliases, permissions, replies, cooldowns, workflow links, simulation, activity, raid welcomes, queued shoutouts, and assigned first-chat shoutouts. Its optional AutoMod layer can delete unapproved links, blocked terms, caps, and repeated-character spam or apply a bounded timeout through a moderator bot. Device authorization runs in an isolated temporary Twitch session and its cookies are erased when authorization completes or the window closes.

Weather and now-playing commands are optional providers rather than creator-specific defaults. Operators can configure a United States National Weather Service location and an AzuraCast station from the Chatbot page, then assign those handlers to any command. Clean installations contain no streamer account, location, station, canvas, or companion-application assumptions.

## Security boundary

The Bridge binds to localhost and requires a per-installation token for registry access, WebSocket connections, commands, and events. High-bandwidth video and audio frames do not pass through the JSON API. Applications advertise Spout, NDI, shared-memory, or other media endpoints through capabilities and output descriptors.

Studio's default-on Privacy Shield masks streamer-sensitive values and all Browser Source URLs in the desktop UI. On Windows, the Studio and isolated authorization windows also request capture exclusion from compatible screen-capture methods.

## License and trademarks

Tempest Streaming Studio software is licensed under [GNU GPLv3](LICENSE). Tempest and Storm Horizon names, logos, and brand assets are governed separately by the [trademark policy](TRADEMARKS.md).
