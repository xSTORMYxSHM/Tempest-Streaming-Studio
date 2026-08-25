# Tempest Streaming Studio Architecture

## Product boundary

Tempest Streaming Studio is the streaming orchestration control plane. It owns normalized viewer interactions, cross-application workflows, cooldown policy, timed leases, emergency restoration, the central asset registry, compatibility information, and administration of the Tempest Bridge. It does not own creative rendering, musical performance, avatar animation, or broadcast operation.

| Product | Primary responsibility |
| --- | --- |
| Studio | Interactions, workflows, cooldowns, safety, software, assets, diagnostics, and Bridge administration |
| Data Horizon | Visualizer, scene, effect, audio-mapping, and stream-element authoring |
| Quartic Pulse | Music analysis, playback, show sequencing, live performance, and export |
| Tempest Broadcast | OBS, scenes, overlays, automation, Spout/NDI, and output safety |
| Mainframe Engine | Reusable rendering, analysis, scene evaluation, timing, and export libraries |

Each application remains useful on its own. Studio becomes valuable when one event must coordinate several applications and restore their prior state reliably.

Studio is the only interaction-facing Twitch product. It owns interaction authorization, secure token refresh/expiry, EventSub subscriptions, chat connectivity, Extension interaction intake, rewards, signature/replay protection, and normalization. Warudo never parses Twitch messages. Tempest Broadcast remains downstream for interaction events, but retains OBS/Twitch stream-service authentication, streaming credentials, and Stream Information because those are broadcast-output responsibilities rather than viewer-interaction ingestion.

## Control and media planes

The Tempest Bridge is the control plane. It carries low-bandwidth application discovery, commands, events, asset references, parameter changes, transport state, health, and diagnostics.

Video textures and continuous audio samples belong to the media plane. Applications advertise media endpoints through capabilities, but transfer frames through Spout, NDI, shared memory, WASAPI, or another purpose-built transport.

```text
Studio Desktop ───────────┐
Data Horizon ─────────────┤
Quartic Pulse ────────────┼── Tempest Bridge ── registries / events / commands
Tempest Broadcast ────────┤
Future applications ──────┘

Twitch Extension ── hosted EBS ══ outbound Studio relay ── Studio Twitch Gateway
EventSub / chat ──────────────────────────────────────────── Studio Twitch Gateway

Data Horizon / Engine ─────── Spout or shared texture ────── Tempest Broadcast
Network render source ─────── NDI ────────────────────────── Tempest Broadcast
```

## Interaction path

External integrations authenticate and normalize platform-specific events before they reach the workflow engine. For example, a free Twitch Extension interaction becomes `tempest.blackhole`; none of the downstream applications need Twitch-specific code. The engine checks safety state, concurrency, and cooldowns, creates a run, then issues capability-addressed commands.

Reversible commands carry leases. When a lease expires, Studio sends a release command. Emergency Restore cancels pending actions, releases active actions, marks runs stopped, and disarms new interactions. This makes temporary effects self-restoring even if an integration forgets to send a corresponding “off” event.

Every accepted Twitch event carries the upstream event/message/redemption ID. Studio deduplicates that ID before publishing or routing it, while the workflow engine independently maps a trigger event ID to its original run. The two layers prevent EventSub retries or connector reconnects from activating an effect twice. Cooldowns are evaluated only after dedupe.

## Persistence

The Bridge stores a registry document and authentication token under its data directory. Assets are indexed in place by URI and checksum; registering or removing an asset never copies or deletes the source file. A future managed-library feature may explicitly copy selected files into a content-addressed store.

## Service lifecycle

The MVP runs the Bridge inside the Studio process while preserving it as an independent package and command. Production packaging will install the Bridge as a per-user background service so live applications can communicate while the Studio window is closed.
