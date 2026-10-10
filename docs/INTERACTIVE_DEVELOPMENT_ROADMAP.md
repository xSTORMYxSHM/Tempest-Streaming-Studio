# Tempest Streaming Studio Interactive Development Roadmap

Status: working development map  
Kickoff: September 29, 2026  
Current live bridge line: 1.7.2
Current development line: 1.7.2

Monetization scope: no Bits products, purchases, receipts, or paid Extension actions are part of this roadmap. Both Twitch companion Extensions are free interaction surfaces.

## Product direction

Tempest Streaming Studio should become the control center for every viewer-driven stream interaction. Twitch, Kick, chat, polls, alerts, channel points, avatars, pets, games, sensors, and operator controls should enter one normalized orchestration layer instead of becoming disconnected widgets.

The long-term product has three visible workspaces:

1. **Live Desk** — chat, polls, moderation, live status, and operator controls.
2. **Alerts** — Twitch events and viewer interactions using one queue and two VOD-safe audio lanes.
3. **Interactive Stage** — persistent and spatial objects such as chat avatars, pets, battles, raid arrivals, gaze effects, and community events.

Tempest Broadcast continues to own capture, scenes, encoding, recording, audio tracks, and final output. Studio owns interaction authorization, rules, state, safety, layout intent, and lifecycle. Loopback Browser Sources render the result.

## Twitch companion Extension topology

The complete Twitch experience uses two companion Extension listings that may be active on the same channel at the same time:

| Extension | Twitch placement | Responsibility |
| --- | --- | --- |
| **Tempest Mainframe** | Panel only | The heavier viewer hub: interaction catalog, avatar loadouts, pet and quest progress, history, accessibility, battle invitations, help, and free viewer actions |
| **Tempest Streaming** | Video Overlay | The in-player interaction layer: live quick actions, click/tap targeting, attacks, battle controls, polls, avatars, and context for what is happening now |

The two Extensions are free companion surfaces, not mutually exclusive editions. A streamer may connect either one or both, but enabling both provides the complete experience. Both use the same channel installation and normalized Studio catalog through Tempest Signal while retaining separate Twitch Client IDs, secrets, JWT audiences, review packages, and release versions.

The Twitch Video Overlay is a viewer interaction surface over the Twitch player. It does not render into the broadcaster's encoded output. Alerts, avatars, pets, battles, and effects that must appear in recordings or on other platforms remain in Studio-owned loopback Browser Sources, including `/interactive-stage`.

Neither companion sells or redeems paid products. Tempest Streaming provides free, policy-controlled live actions and targeting while Tempest Mainframe provides the deeper viewer hub.

Studio must replace the current single edition selector with two independent companion cards:

- Tempest Mainframe: unpaired, paired, connected, catalog published, or out of sync.
- Tempest Streaming: unpaired, paired, connected, catalog published, or out of sync.
- One channel installation can retain both verified Extension identities.
- Catalog publication is filtered by destination: viewer-hub data to Mainframe and live actions to Streaming.
- Emergency Stop, cooldowns, blocks, access rules, and the activity ledger apply across both companions.

## Non-negotiable architecture rules

- Keep the Bridge and every unauthenticated Browser Source bound to loopback.
- Never put Twitch Extension secrets, broadcaster credentials, or Railway credentials in desktop or Extension assets.
- Use platform-scoped viewer identities such as `twitch:1234` or `kick:5678`; never match viewers by display name.
- Use normalized percentage coordinates so layouts survive horizontal, vertical, ultrawide, and scaled output.
- Every temporary action must have a bounded lifetime and cleanup path.
- Emergency Stop must clear alerts, Stage actions, games, sensors, and pending viewer requests.
- Preserve the separate Twitch-event and Viewer Interaction audio lanes for VOD-safe routing.
- Do not allow viewer-supplied HTML, CSS, JavaScript, URLs, or file paths.
- Apply cooldowns, access rules, deduplication, rate limits, and intensity limits before rendering.
- New persistent data must be versioned, migrated, backed up, and rejected safely when written by a newer Studio version.
- Every feature must work without Warudo, Tempest Broadcast, or another optional companion application.

## Release map

The release labels below define dependency order, not fixed delivery dates. A milestone ships only when its exit gate passes.

## Functional 1.7.0 interactive slice

The current development build now includes a working end-to-end MVP of the major interactive systems. These are live foundations, not claims of feature parity with mature standalone products:

- **World workspace:** one Studio page for crowd avatars, the community pet, duels/boss battles, viewer attacks, gaze preview, and the shared Chaos Budget.
- **Persistent world state:** platform-scoped viewer profiles, pet progression, game state, safety settings, schema versioning, and restart recovery in `interactive-world.json`.
- **Stage renderer:** avatars, pets, game objects, health meters, shields, hit/heal effects, horizontal and portrait placement, bounded leases, reconnect snapshots, and Emergency Stop cleanup.
- **Stage Actor v3:** code-free native avatar packs use one validated row-based PNG atlas with fixed-size cells and one animation per row. The original bundled Storm Wisp pack now uses an 8×10 atlas of 128×128 cells for idle, walk, jump, attack, celebrate, sit, sleep, emote, damaged, and defeated artwork. v1 strips and v2 rigs remain readable for compatibility.
- **Free Twitch actions:** both companion Extensions consume one catalog. Mainframe receives deeper community actions; Streaming receives live screen actions and normalized click/tap targeting. Legacy `tempest.pet-play` requests remain compatible.
- **Privacy-safe gaze foundation:** adapter/effect/calibration settings persist, while raw coordinates, confidence, and live connection state remain memory-only. The simulator and supervised JSONL sidecar path are implemented; hardware use requires a Tobii-approved SDK build and the applicable Tobii license.
- **Safety:** crowd/effect limits, attack cooldowns, motion/flashing preferences, volume ceiling, jumpscare policy, shared access authorization, and one global stop/re-arm path.

Still required before calling the roadmap complete: a broader first-party avatar roster beyond Storm Wisp, asset-backed cosmetic layers/rigs, broader Composer conditions/templates, scheduled pet progression, advanced game content, an approved Tobii SDK sidecar binary plus hardware verification, accessibility QA, and live Twitch/Railway rehearsal.

### Stage Actor asset pipeline

- [x] Define a versioned, code-free manifest with pivots, nameplates, colliders, default scale, and named animation states.
- [x] Validate local PNG-strip type, size, dimensions, frame geometry, FPS, state names, and asset filenames.
- [x] Import through opaque desktop handles so renderer code never receives arbitrary filesystem paths.
- [x] Copy assets atomically into Studio-managed storage and refresh the Bridge catalog.
- [x] Serve only catalog-approved PNG/WebP assets from the loopback Stage route.
- [x] Animate sprite-strip frames and switch state-specific artwork in the Stage Browser Source.
- [x] Add the Pack Builder, installed-pack library, and per-viewer pack selection to Interactive World.
- [x] Add integrity-checked portable `.tempest-avatar-pack` export/import with embedded assets and collision-safe local IDs.
- [x] Add confirmed safe removal with active viewers returned to generated placeholders.
- [x] Add first-frame pack thumbnail generation and safe metadata/scale editing; strip replacement remains a later editor enhancement.
- [x] Add viewer titles, palettes, accessories, and bounded cosmetic layers without breaking v1 strips; asset-backed creator variants and an optional rig/mesh format remain later enhancements.
- [x] Add a local Avatar Channel Point redeem list with exact title/ID matching, Browser Source rehearsal, session resets, and optional permanent viewer-profile cosmetic unlocks.
- [x] Add the linked-viewer Mainframe closet with private inventory queries, ownership validation, and Studio-authoritative equipping of Channel Point unlocks.
- [x] Bundle the original Storm Wisp starter pack and install it once without overwriting streamer-managed packs.
- [x] Promote the single-PNG row atlas to the canonical v3 format, with variable columns/rows, explicit state rows, fixed cell geometry, portable-pack validation, and two-dimensional Stage rendering.

### Milestone 0 — Finish 1.7.0 foundation

Goal: ship the reliable platform that the Interactive Stage will build on.

Already implemented in the working source:

- [x] Unified Alerts overview with one shared FIFO queue.
- [x] Adjacent Twitch Events and Viewer Interactions editors.
- [x] Separate live/VOD and live-only alert audio lanes.
- [x] On-stream poll Browser Source.
- [x] Replace the transitional edition selector with independent Mainframe and Streaming companion controls.
- [x] Studio-to-EBS companion manifest, destination catalog, and synchronization state.
- [x] Durable Extension action delivery while Studio is offline.
- [x] Twitch panel, video overlay, video component, mobile, and configuration surfaces.
- [x] Shared Studio version reporting advanced to 1.7.0 while 1.6.0 remains the live bridge line.
- [x] Full automated workspace verification passing.

Remaining release work:

- [ ] Complete the main navigation and workspace-tab visual pass.
- [ ] Run a real Twitch channel test on every Extension surface.
- [x] Replace the mutually exclusive edition selector with independent Mainframe Panel and Streaming Overlay connection cards.
- [x] Extend the hosted installation model so one channel can pair and authenticate both companion Client IDs.
- [x] Publish a destination-filtered free-action catalog to both companions.
- [x] Let the streamer place each feature in Mainframe, Streaming, both, or neither, with overlay-only Dice as the default.
- [x] Configure Tempest Mainframe as the panel-only viewer hub.
- [x] Configure Tempest Streaming as the Video Overlay for free live controls and targeting.
- [ ] Verify Mainframe-only, Streaming-only, and both-active channel states.
- [ ] Deploy the current EBS build and database changes to Railway.
- [ ] Verify an accepted free Extension action through Twitch, EBS, Studio, queue, and Browser Source.
- [ ] Confirm retry behavior by temporarily disconnecting Studio during delivery.
- [ ] Capture final Twitch discovery image and screenshots.
- [x] Retire stale Bits-extension documentation and remove Bits purchasing language from the active product UI.
- [x] Create 1.7.0 release notes and release audit.
- [ ] Build the signed installer and run clean-install, upgrade, update-channel, and paired Broadcast smoke tests.

Exit gate: a test broadcaster can pair either companion independently or activate both together, receive free interactions through the correct surface, display polls and alerts on stream, recover from a temporary disconnect, and upgrade without losing configuration.

### Milestone 1 — Interactive Stage foundation

Goal: introduce one persistent Browser Source and object model that later features can reuse.

- [x] Add a versioned `InteractiveStageState` contract.
- [x] Add `/interactive-stage`, `/interactive-stage/events`, and loopback status routes.
- [x] Add authenticated `/v1/interactive-stage` read/update/control routes.
- [x] Render bounded sprite/avatar, text, meter, and hit-effect objects; dedicated particle primitives remain future work.
- [x] Support spawn, update, move, emote, damage, heal, and dismiss lifecycle actions.
- [x] Add normalized X/Y, scale, anchor, layer, and scene-specific placement.
- [x] Add horizontal and portrait layouts with independent overrides.
- [x] Add persistent protected UI zones and deterministic avatar collision avoidance.
- [x] Add asset validation and Studio-managed local media references for Stage Actor v1 PNG strips.
- [x] Add Stage connection health, diagnostics, preview, reset, and Emergency Stop handling.
- [x] Add an **Interactive Stage** Studio workspace with Overview, Layout, Objects, and Safety tabs.
- [x] Add a generic test object that proves the entire control-to-render-to-cleanup path.

Exit gate: Studio can place, animate, update, and remove a test object in both horizontal and vertical Browser Sources, restore it after a Browser Source reconnect, and clear it through Emergency Stop.

### Milestone 2 — Interaction Composer and safety controls

Goal: let streamers build interactions without writing code.

- [x] Create the first no-code `Trigger → Actions → Cooldown → Cleanup` composer; visual conditions are the next expansion.
- [ ] Support Twitch events, Kick events, chat commands, polls, channel points, free Extension actions, and operator buttons as triggers.
- [ ] Support alerts, Stage objects, sound, TTS, counters, polls, Broadcast reactions, avatar actions, and timed waits as actions.
- [ ] Add validation for missing integrations, unreachable assets, excessive runtime, and conflicting actions.
- [x] Add operator rehearsal for saved recipes; richer simulated platform profiles remain planned.
- [ ] Add reusable interaction templates and portable packs.
- [ ] Add **Chaos Budget** controls for maximum screen coverage, concurrent objects, audio level, motion, flashing, jumpscare frequency, and per-viewer impact.
- [ ] Add Calm, Safe, BRB, Technical Difficulties, and Custom emergency presets.
- [ ] Add a moderator role that can pause interactions, clear queues, dismiss Stage objects, block viewers, and approve high-impact requests.
- [ ] Add accessibility profiles for reduced motion, reduced flashing, captioned sounds, larger text, color-safe palettes, and volume ceilings.

Exit gate: a streamer can create, rehearse, publish, trigger, moderate, and safely clean up a multi-action interaction without editing JSON or code.

### Milestone 3 — Chat avatars and viewer identity

Goal: create the persistent viewer-presence layer inspired by Stream Avatars without copying its assets or implementation.

- [x] Add platform-scoped viewer profiles and the first persistent crowd-presence state.
- [x] Spawn an avatar after a configurable chat-message threshold.
- [x] Add idle, walk, jump, sit, sleep, celebrate, and emote Stage states; enter/leave timing remains to be added.
- [ ] Add bounded nameplates and privacy controls.
- [x] Add avatar color, accessory, title, and bounded glyph-layer loadouts.
- [ ] Add streamer-managed default and unlockable cosmetics.
- [x] Add inactive-viewer Stage cleanup while preserving profile/cosmetic choices; low-performance mode remains planned.
- [x] Add protected gathering zones and avatar collision avoidance; named per-scene gathering behaviors remain planned.
- [ ] Add chat commands and composer actions that target one viewer, a group, or the full crowd.
- [ ] Support raid arrivals as a temporary group entrance or portal event.

Exit gate: chatters reliably appear as lightweight avatars, retain approved cosmetics, move without covering protected regions, and leave without accumulating stale objects.

### Milestone 3A — High-fidelity Stage Actor rigs

Goal: make Tempest avatars feel like small animated game characters instead of translated sprite poses, while preserving lightweight crowd performance and compatibility with existing Stage Actor packs.

Current implementation: the Stage Actor v2 foundation, shared frame-synchronized Canvas renderer, texture preload/cache, physics-selected locomotion, 180 ms pose blending, physics-triggered landing compression, full ten-state Storm Wisp skeleton, state-filtered expression layers, and bounded plume/tail soft deformation are working in the development Browser Source. Per-state colliders, detail tiers, anchored accessory rendering, and the Studio rig-preview workspace remain in this milestone.

- [ ] Add a versioned Stage Actor v2 format with layered artwork, a parented bone hierarchy, named attachment points, per-state collision shapes, and validated local-only assets; continue loading v1 PNG strips as the compatibility fallback.
- [x] Replace per-avatar interval timers for v2 rigs with one frame-synchronized Canvas render loop, preloaded textures, deterministic animation clocks, and clean Browser Source reconnect recovery; v1 compatibility strips retain their legacy timer path.
- [ ] Add an animation state machine driven by actual world physics: idle variations, start/stop, walk, run, turn, jump anticipation, takeoff, rise, apex, fall, landing, sit, sleep, emote, attack, recoil, stun, celebrate, and defeat.
- [ ] Blend compatible state transitions and apply procedural squash, stretch, lean, head tracking, blink timing, breathing, landing compression, and recoil without changing gameplay collision results.
- [ ] Add bounded secondary motion for the hood, jacket hem, sleeves, wisp plume, trailing energy, accessories, glow, and particles, with reduced-motion and low-performance fallbacks.
- [ ] Add expression and facing layers so eyes, mouth/face marks, gaze, damage feedback, and emotes can change independently from the body animation.
- [ ] Preserve the 12 jacket and 12 wisp color choices through tintable material layers, and anchor streamer-approved accessories to named rig points instead of floating glyphs.
- [ ] Add three automatic detail tiers: full rig for featured/nearby actors, simplified rig for the active crowd, and cached sprite fallback for large or low-performance crowds.
- [ ] Add a Studio rig preview with state playback, transition testing, attachment-point overlays, collider overlays, speed controls, crowd stress testing, and reduced-motion preview.
- [x] Build Storm Wisp v2 as the reference production rig with newly separated original artwork, 21 bones, state-specific expressions, soft plume/tail deformation, and authored motion—not extra transformed copies of the existing single-pose frames.

Exit gate: Storm Wisp walks, turns, jumps, lands, attacks, emotes, and idles with visibly articulated motion and smooth transitions; its jacket, wisp, face, colors, and accessories animate independently; a representative crowd stays within the configured frame-time budget; and existing v1 actor packs still render correctly.

### Milestone 3B — Tempest Streamworld game layer

Goal: make each viewer avatar a player in a shared 2D stream game, not a decorative crowd or a clone of Stream Avatars.

- [x] Use the shared Interactive Stage Browser Source as one authoritative world canvas.
- [x] Add a persistent normalized floor, gravity, autonomous walking, jumping, one-way platform landing, canvas-edge turning, and protected-zone avoidance.
- [x] Add an orientation-aware platform map and Studio controls for floor height, movement speed, gravity, jump strength, custom ledges, and a starter map.
- [x] Add animation-aware foot and body colliders so differently shaped actor packs do not use transparent frame padding for world contact.
- [x] Add fixed-timestep simulation, collision correction, crowd separation, solid walls, and map boundaries; configurable low-performance simulation modes remain planned.
- [x] Add direct free viewer controls for move left, move right, jump, drop, interact, emote, and stuck recovery; idle AI resumes when input stops.
- [ ] Route compact live controls through Tempest Streaming and avatar selection, loadouts, inventory, quests, and accessibility through Tempest Mainframe.
- [ ] Add a tile-based Studio map editor with spawn points, platforms, ladders, doors, switches, portals, hazards, checkpoints, and protected broadcast regions.
- [x] Add the first code-free world interactables: toys, switches, pickups, treasure, pet stations, pressure plates, hazards, and checkpoints, with orientation-aware Studio placement and a starter gameplay set.
- [x] Extend interactables with push-block physics, linked doors, and Bridge-owned cooperative puzzle state shared across Browser Source reconnects; inventory-backed collection progression remains part of the progression milestone.
- [ ] Add free, cosmetic progression with per-channel XP, achievements, unlockable looks, quests, and streamer-controlled resets; no Bits or paid gameplay advantages.
- [ ] Add bounded multiplayer modes including races, survival rounds, cooperative puzzles, raid-party arrivals, boss arenas, and community objectives.
- [ ] Add spectator, moderator, AFK, disconnect, respawn, stuck-recovery, and Emergency Stop behavior without losing the viewer's saved profile.
- [ ] Add map import/export and creator-authored content packs containing only validated data and local assets—never viewer code.

Exit gate: a viewer can select a look in Tempest Mainframe, enter the live Streamworld, control their character through Tempest Streaming or allowed chat commands, traverse and interact with a creator-built map, participate in a bounded cooperative activity, reconnect without losing approved progression, and return to safe idle behavior when input stops.

### Milestone 4 — Screen pet and community progression

Goal: add a persistent community character that viewers can care for and play with.

- [x] Add one active pet with mood, energy, hunger, sleep, level, and affinity state.
- [x] Add feed, pet, play, annoy, wake, dress, call, and dismiss interactions.
- [ ] Add scheduled decay that does not punish the community while the channel is offline.
- [ ] Add animation and sound sets with local asset packs.
- [ ] Add pet accessories, rooms, toys, and streamer-approved unlocks.
- [ ] Add chat-avatar reactions to the pet.
- [ ] Add community quests and persistent achievement progress.
- [ ] Add an Audience Energy Meter fed by chat, follows, subscriptions, polls, and interactions.
- [ ] Allow energy thresholds to trigger celebrations, weather, boss arrivals, or composer recipes.
- [ ] Include reset, backup, import/export, moderation, and corruption recovery.

Exit gate: the pet persists safely between streams, reacts to bounded viewer actions, participates in Stage scenes, and can be completely reset or restored from backup.

### Milestone 5 — Viewer attacks, duels, and battles

Goal: add native interactive games inspired by Viewer Attack and Bduel while keeping Studio's safety model.

- [ ] Promote jumpscares into a first-class interaction template with sound, visual, position, intensity, cooldown, and accessibility fallbacks.
- [x] Add the first placeable Stage attack with normalized Extension targeting.
- [ ] Add viewer-versus-streamer and viewer-versus-viewer attacks.
- [x] Add opt-in duel challenges, `!accept`, invitation deadlines, and turn deadlines.
- [ ] Expand the implemented health, shields, teams, win conditions, and cleanup with status effects and multi-round rules.
- [x] Add duel, boss, dice, and reaction session modes; trivia content remains planned.
- [x] Add native chat battle commands and Composer paths for Extension/chat/operator triggers; poll and channel-point presets remain planned.
- [ ] Add raid invasions and raid-party bonuses.
- [ ] Add community quests, seasonal statistics, and streamer-controlled rewards.
- [ ] Add anti-spam, surrender, draw, disconnect, and moderator-abort behavior.
- [ ] Keep game outcomes cosmetic and community-focused, with no paid or chance-based rewards.

Exit gate: a duel and a cooperative boss encounter can complete from invitation through results without overlapping protected alerts, exceeding the Chaos Budget, or leaving stale state.

### Milestone 6 — Smarter alerts and production automation

Goal: make the existing alert platform adaptive without making live behavior unpredictable.

- [ ] Add alert grouping for follow bursts, gift-sub batches, repeated redemptions, and rapid interaction chains.
- [ ] Add explicit priority classes with starvation protection; raids and operator warnings may bypass ordinary backlog only when configured.
- [ ] Add contextual alert variants based on scene, category, stream state, time, goal state, or audience energy.
- [ ] Add full-sequence alert rehearsal with synthetic follow, sub, raid, reward, poll, and interaction events.
- [ ] Add automatic audio ducking through a compatible Broadcast capability with guaranteed restoration.
- [ ] Add alert and Stage collision avoidance.
- [ ] Add highlight markers for raids, large support events, battle conclusions, and operator-selected moments.
- [ ] Expand the interaction timeline to connect upstream event, authorization, queue time, rendered actions, cleanup, and highlight marker.
- [ ] Add optional Stream Deck and MIDI mappings for queue, Stage, safety, rehearsal, and scene-profile controls.

Exit gate: a stress rehearsal demonstrates deterministic ordering, restoration, accessibility, audio recovery, and readable layouts under a burst of mixed events.

### Milestone 7 — Eye tracking and sensor interactions

Goal: add an optional local Tobii-compatible input without sending gaze data to Tempest servers.

- [x] Build a replaceable supervised local eye-tracker adapter protocol instead of binding the Stage directly to one vendor.
- [x] Add explicit enablement, calibration state, stale-signal disconnect recovery, and a live privacy/status indicator.
- [x] Keep raw gaze coordinates, confidence, and connection state in memory while persisting only settings.
- [x] Add smoothing, confidence thresholds, calibrated normalized screen mapping, and signal expiry; configurable dead zones/privacy regions remain planned.
- [x] Add cursor, gaze trail, heat effect, target effect, and operator simulator preview.
- [ ] Let the pet follow the streamer's gaze.
- [ ] Add gaze targeting for battles and “find the object” interactions.
- [ ] Add opt-in horror mechanics such as “do not look at it,” with reduced-motion and no-jumpscare alternatives.
- [ ] Make sensor actions available to the Interaction Composer.

Exit gate: gaze effects remain responsive, local, visibly enabled, privacy-bounded, and automatically disappear when tracking disconnects or safety is engaged.

## Shared platform epics

These are not separate products. They should be implemented once and reused by every milestone.

| Epic | Responsibilities | First consumer |
| --- | --- | --- |
| Stage renderer | Persistent objects, animation, layers, reconnection | Interactive Stage |
| Viewer identity | Platform-scoped IDs, presence, profiles, blocks | Chat avatars |
| Layout profiles | Scene, horizontal, portrait, safe zones, collision | Interactive Stage |
| Interaction Composer | Normalized triggers and bounded actions | Jumpscares |
| Safety policy | Chaos Budget, accessibility, emergency presets | All interactions |
| Game session engine | Participants, rounds, health, timers, results | Viewer duels |
| Progression store | Pet, viewer cosmetics, quests, achievements | Screen pet |
| Input adapters | Gaze, Stream Deck, MIDI, future sensors | Eye tracking |
| Activity ledger | Authorization, lifecycle, cleanup, highlights | Smart alerts |

## Proposed Stage contract

The first contract should be intentionally small and extensible:

```ts
type StageObjectKind = 'sprite' | 'avatar' | 'pet' | 'effect' | 'meter' | 'game-object' | 'text';

interface InteractiveStageObject {
  id: string;
  kind: StageObjectKind;
  owner?: { platform: 'twitch' | 'kick' | 'studio'; userId: string; displayName?: string };
  assetId?: string;
  state: string;
  placement: { x: number; y: number; scale: number; anchor: string; layer: number };
  scenePlacements?: Record<string, InteractiveStageObject['placement']>;
  properties: Record<string, string | number | boolean>;
  createdAt: string;
  expiresAt?: string;
}
```

Rules:

- `x` and `y` are normalized from 0 to 1.
- `properties` is validated by object kind; it is not an arbitrary execution surface.
- Asset IDs resolve through Studio-managed assets and never expose source paths to public clients.
- Every remotely triggered object has an owner, source event ID, dedupe key, and policy result in the activity ledger.
- Ephemeral objects require `expiresAt`; persistent objects require a stored lifecycle owner such as the avatar or pet service.

## Suggested code map

```text
packages/tempest-contracts/src/
  interactive-stage.ts          shared state, commands, validation
  interaction-recipes.ts        composer trigger/action schema

services/tempest-bridge/src/
  interactive-stage.ts          renderer state and Browser Source delivery
  interactive-stage-store.ts    versioned local persistence
  interaction-policy.ts         Chaos Budget and accessibility decisions
  viewer-presence.ts             normalized presence and profile keys
  game-sessions.ts               duel and boss lifecycle
  sensor-adapters/               gaze and future local inputs

apps/studio-desktop/src/renderer/
  interactive-stage workspace   overview, layout, objects, safety

docs/
  INTERACTIVE_STAGE.md
  INTERACTION_COMPOSER.md
  VIEWER_IDENTITY_AND_PRIVACY.md
```

The exact file split can change during implementation, but contracts, rendering, policy, presence, progression, and games should not collapse into one large service.

## Current first development slice

The first day should prove the architecture rather than begin with avatars or battles.

### Morning — contract and state owner

- [x] Confirm the current `feature/twitch-extension-production` development branch remains the 1.7.0 integration branch.
- [x] Add the minimal Stage types and validators to `packages/tempest-contracts`.
- [ ] Add tests for valid placement, bounded scale/layer, required expiry, invalid asset references, and unsupported properties.
- [x] Implement the in-memory Stage state owner with revision numbers and immutable status snapshots.
- [x] Add spawn, update, move, and dismiss commands for one generic test object.

### Afternoon — Browser Source vertical slice

- [x] Add the loopback Stage HTML and event stream.
- [x] Render the generic test object with enter, idle, move, and exit states.
- [ ] Add Bridge routes for state, control, status, and renderer acknowledgement.
- [x] Add a Studio workspace showing URLs, connection count, revision, object creation, drag-to-move, update, and dismiss controls.
- [x] Connect Emergency Stop and reconnection snapshot recovery.
- [ ] Add integration tests covering route authorization, loopback enforcement, reconnect, expiry, and cleanup.

### Day-one definition of done

At the end of the first development day, a test object can be spawned from Studio, appears in the Stage Browser Source, moves to a normalized coordinate, disappears on command or expiry, survives a Browser Source reconnect through state replay, and is removed by Emergency Stop. No chat avatar, pet, battle, or sensor logic should be added until this vertical slice is reliable.

## Near-term backlog after the vertical slice

| Order | Work item | Depends on | Acceptance signal |
| ---: | --- | --- | --- |
| 1 | Stage layout editor | Stage contract | **Complete:** object can be dragged, scaled, layered, and saved |
| 2 | Horizontal/portrait profiles | Layout editor | **Complete:** one object has independent verified placements |
| 3 | Protected zones and collision | Layout profiles | **Complete:** persistent protected rectangles and avatar separation |
| 4 | Chaos Budget | Stage lifecycle | Excess requests degrade or queue predictably |
| 5 | Interaction Composer skeleton | Stage commands | **Complete:** saved recipe triggers bounded Stage/world/alert actions |
| 6 | Viewer presence | Platform identity | **Complete:** chat user joins, goes inactive, and leaves Stage without losing profile |
| 7 | Basic chat avatar | Viewer presence | One viewer animates and reconnects correctly |
| 8 | Stage Actor v2 renderer | Basic chat avatar | Physics selects blended rig states and v1 packs continue to render |
| 9 | Storm Wisp v2 production rig | Stage Actor v2 renderer | Full-fidelity rig passes state, attachment, palette, reconnect, and crowd stress tests |
| 10 | Screen pet core | Progression store | Pet state persists and restores from backup |
| 11 | First jumpscare recipe | Composer + safety | Free Extension, points, chat, and operator triggers share one template |
| 12 | Duel prototype | Game session engine | Two viewers complete one deterministic duel |

## Testing strategy

Every milestone requires:

- Unit tests for validation, policy, state transitions, cooldowns, and cleanup.
- Bridge integration tests for authenticated controls and loopback-only rendering.
- Renderer tests for reconnect, stale revision rejection, expiry, and Emergency Stop.
- Migration fixtures from the previous stable release.
- A low-resource test with disconnected optional integrations.
- A burst test mixing Twitch events, viewer interactions, chat avatars, and Stage actions.
- Horizontal and portrait layout screenshots at common canvas sizes.
- Accessibility checks for reduced motion, flashing, readable labels, keyboard operation, and volume limits.
- A real stream rehearsal before release, followed by alert history and output telemetry review.

### Unified Stage renderer baseline

- [x] Provide one `/unified-stage` Browser Source for Interactive Stage, Twitch alerts, Interaction Alert visuals, Twitch Experiences, chat, Emote Wall, 3D Dice, Discord guests, and polls.
- [x] Make module switches lifecycle controls: off removes the module frame and therefore closes its EventSource, animation loop, media decoder, and WebGL context.
- [x] Keep Interaction Alert audio available as an optional audio-only source for separate VOD-track routing while preventing duplicate audio in Unified Stage.
- [ ] Replace the old individual Broadcast Browser Sources with Unified Stage during stream rehearsal, leaving only the optional Interaction Audio lane when VOD routing is needed.
- [ ] Record idle and mixed-load GPU/VRAM measurements before and after migration.

## Scope control

The following are deliberately deferred until their foundations exist:

- Do not begin boss battles before the game-session engine and Chaos Budget.
- Do not persist gaze coordinates or viewer chat history as progression data.
- Do not combine the two alert audio lanes merely to make the UI look unified.
- Do not call a module disabled when its renderer remains mounted or its event/media/animation resources remain active.
- Do not create separate Browser Sources for every avatar, pet, or game object.
- Do not expose local Stage controls through Railway.
- Do not implement a public asset marketplace before signed packs, moderation, licensing metadata, and safe update rules exist.
- Do not add paid Extension actions or chance-based external rewards.

## Product success measures

- A new streamer understands where to configure an interaction without knowing which service implements it.
- A moderator can stop any viewer-driven effect in one action.
- No Stage object or alert remains active after its lease, expiry, disconnect cleanup, or Emergency Stop.
- Browser Source reconnection restores current state without replaying completed triggers.
- The same interaction recipe works with free Extension, channel-point, chat, poll, and operator triggers where allowed.
- Horizontal and portrait output remain readable without duplicate configuration work.
- Optional integrations enrich an interaction but never become required for Studio to function.
