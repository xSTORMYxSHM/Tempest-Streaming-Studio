# Tempest Streaming Studio

Current development release: **0.11.6**

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

The **Interaction Alerts** page contains the 13 free dance and performance routines extracted from the current Warudo blueprint and can create additional custom routines. Its cards now mirror Twitch Alerts, including the full 3440 × 1440 drag-and-resize designer; Warudo is an optional per-alert integration whose cue and duration controls appear only when enabled. The **Twitch Alerts** page keeps the sound and visual response together for follows, subscriptions, gift subs, Bits, raids, rewards, and custom normalized event presets. The shared designer controls presets, disposition, position, animation, template variables, typography, colors, frame/media sizing, appearance timing, TTS, and isolated custom CSS. Broadcast connects once to Studio's transparent `http://127.0.0.1:4765/visual-alerts` Browser Source, which carries both alert types and their audio. See `docs/SOUND_ALERTS.md` for the Browser Source, Video Component, and EBS boundaries.

The **Chat Overlay** page replaces a hosted Botrix chat widget with Studio's local `http://127.0.0.1:4765/chat-overlay` Browser Source. It renders normalized Twitch chat as safely escaped message cards and controls position, message count, lifetime, role chips, accent, opacity, preview, and clearing. See `docs/CHAT_OVERLAY.md` for setup.

The **Panel Designer** creates a channel-specific appearance for the universal Twitch Extension with a real 318 by 496 preview, safe theme controls, local persistence, and runtime delivery to the Local Panel. Hosted releases use the same validated theme model as per-broadcaster configuration, so streamers customize one shared Extension without supplying viewer-facing code.

The **Connections** page makes the optional Warudo avatar connection explicit. Studio starts the local adapter automatically, connects to the supplied Playground node at `ws://localhost:4770`, displays both connection states, and walks the operator through wiring Activate and Release into a blueprint.

## Development

Requirements: Node.js 22 or newer and pnpm 11 or newer.

```powershell
pnpm install
pnpm check
pnpm dev
```

Use [docs/LOCAL_TWITCH_TEST.md](docs/LOCAL_TWITCH_TEST.md) to exercise the signed Twitch Extension, localhost EBS, Studio, Broadcast sources, and Warudo blueprint before deploying the public EBS.

Use [docs/REPOSITORY_SETUP.md](docs/REPOSITORY_SETUP.md) for the GitHub repository boundary, secret-handling rules, and the hosted EBS deployment outline.

Studio starts an embedded Bridge on `127.0.0.1:4765` for the MVP. The Bridge is also independently runnable with `pnpm bridge`. Production service installation and automatic startup are a later packaging milestone; the service boundary is already kept separate so Studio does not become a permanent runtime dependency.

Use **Simulate Black Hole** on the Live Control page to exercise the complete fifteen-second sequence without requiring any connected applications. The simulator uses the same workflow engine as live interactions; only delivery to absent applications is simulated.

## First workflow

`tempest.blackhole` demonstrates the intended product boundary: Studio coordinates a Warudo expression, Broadcast dim/overlay/audio, a Quartic Pulse fractal preset, and a Data Horizon gravity visualization. Reversible actions receive fifteen-second leases and are explicitly released when those leases expire. Emergency Restore releases active actions immediately and disarms further viewer interactions until the operator re-arms them.

Studio is the sole owner of interaction-facing Twitch integration for the suite. It validates, deduplicates, logs, publishes, and routes canonical Twitch events at `/v1/integrations/twitch/events`; the desktop exposes authorization, connection state, the free Sound Alert catalog, and the topic directory. The hosted Extension Backend Service verifies Twitch JWTs and forwards allowlisted interactions over a channel-bound connection opened outbound by Studio. Broadcast retains OBS/Twitch stream-service authentication and Stream Information because those belong to output operation. Bits do not trigger bundled workflows.

Version 0.11.0 adds the **TempestMainframe Chatbot** control surface. Studio stores the bot profile's OAuth tokens separately from the broadcaster, receives `channel.chat.message` through EventSub WebSocket, replies through Twitch Chat, and manages commands, aliases, permissions, reply templates, cooldowns, workflow links, simulation, and activity from the desktop. The connector monitors keepalives, follows Twitch reconnect requests, restores lost subscriptions, ignores duplicate deliveries, and never requires a client or Extension secret for chat.

Version 0.11.1 adds the built-in `!weather` response source. It reports Pacific time and the hourly National Weather Service forecast for fixed Seattle coordinates, caches successful readings for ten minutes, retains a recent reading through short outages, and requires no API key or viewer location.

Version 0.11.2 sends command responses as clean standalone bot messages by default. Operators can enable **Reply directly to viewer** per command when a threaded Twitch reply is desirable.

Version 0.11.3 makes the Chatbot Shared Chat-aware. Studio preserves the originating collaborator channel, displays it in Chatbot Activity, applies one cooldown across the shared session, and lets each command opt in to collaborator-channel invocation while continuing to evaluate moderator, subscriber, and broadcaster permissions in the home channel. The Twitch panel now uses a compact signal deck with a featured event, two-column performance cards, search, category filters, durations, and live cooldown states.

Version 0.11.4 adds an immediately usable command pack: `!commands`, `!uptime`, `!title`, `!game`, `!schedule`, `!song`, `!lurk`, and `!unlurk`. Live Twitch reads use the existing Chatbot token and short caches, while `!song` reads Storm Horizon Radio's public AzuraCast metadata without an API key; provider outages return compact fallback messages.

Version 0.11.5 isolates the secondary `TempestMainframe` Twitch authorization from the broadcaster's normal browser login. Studio opens device activation in a temporary in-app Twitch session, never launches Edge automatically, and erases that session's cookies when the sign-in window closes. Copy-code, copy-link, and explicit default-browser fallbacks remain available.

Version 0.11.6 automatically closes that isolated Twitch window as soon as the Device Code poll completes or expires. Manual close remains available, and disconnecting the Chatbot also closes any outstanding isolated authorization window.

## Security boundary

The Bridge binds to localhost and requires a per-installation token for registry access, WebSocket connections, commands, and events. High-bandwidth video and audio frames do not pass through the JSON API. Applications advertise Spout, NDI, shared-memory, or other media endpoints through capabilities and output descriptors.

## License and branding

Tempest Streaming Studio software is distributed under the GNU General Public License v3.0 in [LICENSE](LICENSE). The Tempest and Storm Horizon names, logos, icons, discovery artwork, and promotional compositions are governed separately by [TRADEMARKS.md](TRADEMARKS.md); modified distributions should use their own name and branding.
