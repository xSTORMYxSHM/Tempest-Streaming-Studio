# Changelog

## Unreleased — Free Extension live utilities

- Integrated one-click localhost HTTPS preparation into Studio with a SHA-256-pinned official mkcert 1.4.4 helper, an isolated per-installation CA, a Windows-native offline fallback, visible certificate status, and complete trust/private-key removal.
- Added active Studio polls to the free Tempest Mainframe Twitch Extension. Identity-linked viewers can vote once from the Panel or Video Component, the same Twitch account cannot vote again through chat, and live/final totals remain visible without any Bits dependency.
- Ensured a newly closed poll always replaces optimistic in-panel voting state, even when a slightly older catalog response reported fewer votes.
- Added a default `!roll` / `!dice` command for Twitch, Stream Together, and Kick chat. Viewer rolls use the same hardened Dice Box Browser Source, physical settled result, access rules, and adjustable command cooldowns as operator rolls, then report the result back on the originating platform.
- Added a compact 3D Dice picker to the free Tempest Mainframe Extension. Viewers can choose d4, d6, d8, d10, d12, d20, 1–50, d100, or an exact custom 1–N maximum from 2 through 100; Studio applies its assigned-creator access policy and shared 30-second viewer/5-second global cooldowns before starting the physical on-stream roll.
- Added read-only live counter cards to the free Extension for enabled Studio counter commands such as deaths or restarts. Values publish immediately after chat, operator, or viewer-interaction adjustments without giving the Extension a counter mutation endpoint.
- Added a read-only stream-goal card to the free Extension. Twitch-native or Studio-managed goal progress publishes immediately from Studio, while local preview goals are kept private and the Extension receives no goal mutation route.
- Added a read-only Now Playing card to the free Extension for the broadcaster's configured AzuraCast provider, including a Twitch-safe Listen action. Studio polls only while its Extension relay is connected, and the hosted catalog never receives the private API or direct stream URL.
- Added the next scheduled Twitch stream to the free Extension as a localized read-only card. It reuses the Chatbot's five-minute Twitch schedule cache, needs no new OAuth scope, and stays hidden when Twitch has no upcoming segment or the schedule cannot be verified.
- Coalesced bursty Studio catalog updates into at most a leading and trailing relay message, with a separate one-second dynamic-metadata refresh window. Free Extension polling now uses catalog ETags and skips JSON parsing and rendering on unchanged responses.
- Pinned the production `js-yaml` transitive dependency to patched version 4.3.2, removing the high-severity empty-merge CPU-exhaustion advisory inherited through the desktop updater.
- Removed raw allow-list and block-list Twitch user IDs from Free and Bits viewer catalog responses. The hosted service now returns only per-viewer eligibility, hides configured locked items, and enforces access before relaying an interaction; Studio retains its independent enforcement as the final boundary.
- Made Twitch's identity-sharing consent reachable from visible restricted-interaction cards. Anonymous viewers now see an explicit **Share Twitch Identity** action while locked and hidden interactions remain unavailable, with the hosted service and Studio still enforcing the configured audience after consent.
- Reduced Bits Extension background work by caching Twitch product metadata for 60 seconds and using ETag/`304 Not Modified` responses for unchanged five-second eligibility checks. Authorization and Twitch feature changes still force an immediate full refresh.
- Coalesced overlapping Free and Bits Extension catalog refreshes into one active request plus at most one trailing refresh, and discard responses signed with a superseded Twitch authorization token.
- Bounded Free and Bits Extension calls to Tempest Signal at ten seconds so an interrupted network cannot permanently freeze catalog updates, poll voting, or an interaction control.
- Suspended Extension viewer polling and cooldown repaint work while its Twitch surface is hidden, refresh immediately when the Bits surface becomes visible again, and bound Twitch's product-catalog promise so an SDK stall cannot freeze paid-interaction eligibility.
- Fixed a Discord local-RPC timeout leak that could leave a 10 ms READY poll running indefinitely after a failed connection, and bound queued dispatch state across reconnects.
- Coalesced bursts of Discord voice join, leave, and state events into one active channel read plus at most one trailing read, avoiding overlapping RPC command batches and out-of-order guest overlay updates.
- Coalesced concurrent Chatbot stream, channel, schedule, weather, and Now Playing lookups so commands, automatic messages, and Extension refreshes share one upstream request. Channel/provider changes now invalidate caches and cannot be overwritten by a stale response.
- Isolated the free Extension's Now Playing, schedule, and Current Stream refresh results so one temporarily unavailable metadata provider no longer prevents the other live cards from updating.
- Bounded hosted relay rate-limit and Bits cooldown state, capped simultaneous paid-interaction reservations, and added separate per-viewer/channel request limits to Bits reservation and transaction endpoints so invalid traffic cannot grow long-running service memory without limit.
- Throttled hosted replay-cache pruning, capped simultaneous Studio relay acknowledgements, and pre-indexed Bits interactions and active reservations so large multi-channel catalogs avoid repeated full-map scans while retaining per-request expiry enforcement.
- Raised the authenticated Studio relay's bounded catalog envelope to 2 MiB so valid larger catalogs with per-viewer access lists no longer disconnect at the old 64 KiB transport ceiling; nested item and identity-list limits remain enforced before storage.
- Added ten-second cancellation bounds to the hosted service's Twitch, Kick, and Discord identity-provider requests so a stalled upstream cannot retain pairing or authorization handlers indefinitely.
- Return a clear `400` response for malformed signed Kick webhook JSON instead of treating a client payload error as an internal hosted-service failure.
- Reduced Studio's visible-window one-second refresh from 22 unconditional status calls to six production-critical calls plus only the active workspace's data. Switching workspaces refreshes that workspace immediately, and the setup wizard still loads every readiness source it needs.
- Bounded desktop calls to the local Bridge at five seconds and hosted pairing, Kick linking, and Discord token exchange at ten seconds so an unavailable service cannot leave Studio controls or refreshes pending indefinitely.
- Coalesced Studio's periodic/visibility full refreshes and pause one-second workspace polling while a full refresh is active, preventing duplicate batches of up to 28 Bridge and desktop status requests.
- Streamed Asset Library SHA-256 calculation instead of loading an entire selected video or media file into desktop memory, and bounded imported application manifests to 1 MB before parsing.
- Streamed GIPHY downloads through a hard 25 MB reader limit, including responses without a trustworthy Content-Length header, instead of allocating an unbounded response before validating its size.
- Streamed assigned alert audio through a hard 100 MB Browser Source compatibility-fallback limit, including responses without a trustworthy Content-Length header, while leaving normal media-element streaming unchanged.
- Deferred concatenating streamed alert-audio fallback chunks unless both media-element playback paths fail and Web Audio decoding is actually needed, reducing peak Browser Source memory in the common compatibility path.
- Copied imported Dice Box theme assets without buffering each file in desktop memory and rejected oversized theme manifests before JSON parsing.
- Kept the third-party emote provider timeout active through body download and enforced the 4 MB catalog/media ceiling while streaming, preventing stalled or oversized provider bodies from retaining the Bridge or allocating without bound.
- Bounded third-party emote names, each provider catalog, and the long-session media-source lookup so a high-volume chat cannot accumulate every distinct community emote until Studio exits.
- Collapsed Studio's six always-on one-second Bridge status calls into one authenticated runtime snapshot while retaining the individual endpoints for compatibility, removing roughly 18,000 local HTTP requests from a typical one-hour stream.
- Isolated active-workspace refresh failures from the core runtime snapshot so a temporarily unavailable optional tool no longer makes Studio falsely report that the entire local Bridge is offline.
- Reused the runtime snapshot in full refreshes and retained successful optional results independently, reducing each full batch by five more local requests and preventing one optional integration failure from discarding every other fresh status.
- Reduced the background compatibility refresh from every 15 seconds to every 60 seconds now that the visible workspace keeps its live state current each second and operator actions refresh explicitly, removing another roughly 4,140 local requests from a one-hour stream.
- Skipped active-workspace DOM reconstruction when its fetched state is unchanged, while retaining one-second safety countdowns and immediate renders for every changed live data source.
- Added a shared bounded ten-second timeout to Chatbot, primary Twitch gateway, and Kick gateway requests so an unresponsive upstream cannot stall Extension metadata, automated messages, commands, OAuth, or account operations indefinitely.
- Replaced per-message full scans of Chatbot EventSub deduplication state with once-per-minute pruning, and bounded expired viewer-cooldown and shoutout history so long streams cannot accumulate unbounded runtime maps.
- Applied the same throttled pruning and 24-hour/50,000-entry bounds to Twitch gateway deduplication, Interaction Alert viewer cooldowns, and workflow viewer cooldowns, removing more per-event full-map scans from long streams.
- Added end-to-end viewer placement to free Extension interactions. Stickers, GIFs, and effects configured as viewer-placeable now open a crosshair layer, submit bounded normalized coordinates through Tempest Signal, and use Studio's existing horizontal/vertical render mapping.
- Added a read-only Current Stream card to the free Extension with Twitch live/offline state, title, category, uptime, and viewer count. Studio reuses its existing 30-second stream and 60-second channel-information caches and requires no new OAuth scope.
- Added a read-only chat-command directory to the free Extension. It publishes only bounded enabled triggers, aliases, permissions, and Shared Chat availability; response text, workflow links, cooldown state, and other private Chatbot configuration remain local.
- Made free Extension counter cards display the streamer's configured Chatbot prefix instead of assuming every counter command begins with `!`.
- Bounded Kick OAuth, identity, chat-send, and subscription response bodies to 1 MiB with a ten-second streamed-body timeout, preventing a stalled or oversized provider response from retaining Studio work indefinitely.
- Applied the same streamed-body timeout and 1 MiB ceiling to Twitch OAuth, token validation, refresh, and EventSub subscription responses.
- Bounded Chatbot Twitch, weather, schedule, Shared Chat, and Now Playing response bodies to 2 MiB and kept the response timeout active through their streamed downloads.
- Bounded hosted Twitch, Kick, and Discord identity/token response bodies to 1 MiB with a streamed-body timeout, closing the same post-header stall path in Tempest Signal.

## 1.4.7 — 3D Dice and Browser Source audio

- Added a Studio-owned 3D Dice workspace and transparent Browser Source powered by the locally bundled MIT-licensed Dice Box renderer. Real WebGL rigid-body dice roll, bounce, collide, and settle before Studio records the result; common dice, unbiased custom 1–N ranges through 100, advantage/disadvantage, optional reasons and impact audio, three colors, and configurable timing and scale are included. The feature is independent of Tempest Tabletop Engine.
- Restored Twitch and Interaction Alert sound capture in current Broadcast Browser Sources by playing fully fetched local audio through an OBS-capturable blob media element, with bounded Web Audio fallback and explicit fetch, start, resume, and decode failures in the Broadcast log.

## 1.4.6 — Viewer interaction platform

- Added a persistent Twitch Extension edition selector for **Tempest Mainframe (Free)** and **Tempest Streaming (Bits)**. Studio publishes the selected edition with its hosted catalog, and Tempest Signal rejects requests from the inactive Extension so both products cannot trigger the same channel accidentally.
- Expanded Interaction Alerts into a reusable Viewer Interactions catalog for stickers, GIFs, jumpscares, screen effects, sounds, counters, community actions, and future interaction types.
- Added viewer click/tap placement, per-interaction staff/assigned-creator/individual access rules, explicit block lists, hidden locked items, and separately adjustable viewer/global cooldowns.
- Added a server-enforced reservation step before the Twitch Bits dialog so access and cooldown checks occur before activation, with signed receipt verification still required afterward.
- Added persistent streamer-named chat counters that work across Twitch, Shared Chat, and Kick through ordinary commands such as `!death` or `!restart`.
- Kept the reliable single Web Audio alert path and its regression coverage, preventing the duplicate-function override that previously caused silent Browser Source alerts.

## 1.4.5 — Broadcast ownership alignment

- Kept Broadcast-owned video and output settings in Tempest Broadcast only. Studio now presents Kick destination and Dual Format configuration as read-only readiness, while retaining platform accounts, chat, stream information, preflight, preview, Go Live, recovery, and monitoring controls.

## 1.4.2 — Streaming performance cleanup

- Reduced Studio renderer work by updating only the visible workspace during one-second live refreshes while preserving the existing full-state compatibility refresh.
- Suspended renderer polling while Studio is minimized and refreshes current state immediately when the window becomes visible again.
- Removed alert history and media diagnostics from the fast polling path unless Activity & Diagnostics is open, and cached alert media availability checks for 30 seconds.
- Stopped the Emote Wall animation loop whenever no emotes are active, the overlay is disabled, or its browser source is hidden.

## 1.4.1 — Platform-centered navigation

- Reorganized Studio around dedicated Twitch and Kick platform homes. Twitch now links its account, alerts, viewer panel, Dual Format, and Stream Together tools from one place; Kick now keeps OAuth, signed-webhook chat, ingest, stream-key, and Broadcast destination settings together.
- Simplified Go Live into a shared production workspace for preflight, coordinated start, destination health, and recovery after each platform is configured on its own page.
- Renamed the shared chat workspace to Chatbot + Live Chat and clarified that Twitch, Stream Together, and Kick are monitored together while replies remain platform-local.

## 1.4.0 — Twitch + Kick production control

- Added a production Twitch + Kick Go Live page that coordinates output through Tempest Broadcast while keeping all video, canvas, encoder, and stream-key ownership in Broadcast.
- Added guarded Twitch Dual Format preparation and vertical-preview controls for Twitch's mobile-first 9:16 presentation, with live readiness and horizontal/vertical telemetry.
- Added off-air simulcast preflight, a session-only operator checklist, Kick-only retry and stop controls, emergency output stop, upload-headroom checks, and a Studio live-operations supervisor.
- Added a native Stream Together Collaboration Center with Shared Chat session detection, host and participant visibility, an in-memory chat feed, and bot-account posting without a separate browser window.
- Added Kick OAuth, signed-webhook relay delivery, encrypted credentials, and one combined Twitch/Shared Chat/Kick monitor while keeping replies on their originating platform.
- Added data-version compatibility for existing 1.3.x profiles and expanded automated coverage for the new production contracts, chat paths, credential boundaries, and recovery behavior.

## 1.3.1 — Reliable Browser Source alert audio

- Replaced the stalled Chromium media-element path for Twitch and Interaction Alert sounds with Web Audio fetch and decoding, while retaining a bounded media-element fallback for compatibility.
- Alert sounds continue to honor their configured volume, sound delay, visual duration, and maximum runtime, including cancellation when an alert is cleared or superseded.
- Browser Source playback failures now appear in Broadcast logs instead of being silently discarded.

## 1.3.0 — Streamer Mode and synced Twitch panels

- Fixed the Twitch Panel Designer so a paired Studio securely publishes its validated channel theme to Tempest Signal instead of saving it only on the local computer. The live Twitch panel now refreshes the hosted theme automatically while visible.
- Added Streamer Mode as the default interface. Everyday alert, overlay, chatbot, Twitch, panel, and avatar tasks use simpler language while technical status, self-hosting, custom code, routing, provider configuration, and diagnostics remain available through an opt-in Advanced Mode in Settings.
- Separated the public Twitch extension's `0.1.0` version line from Studio desktop releases so each product can be reviewed and published independently.

## 1.2.6 — Public connection hardening

- Hardened public Twitch Extension pairing for upgraded installations that retain a custom or legacy Twitch application. Studio now blocks incompatible official-service pairing locally, offers a one-click switch back to the built-in Twitch sign-in, and preserves custom applications for self-hosted services.
- Hosted pairing failures now carry a stable machine-readable code and distinguish account recovery from a Tempest Signal service-configuration problem instead of blaming the broadcaster.
- Desktop actions now remove Electron's internal remote-method wrapper from errors before presenting them to end users.
- Discord connection errors now explain when an account is outside the application's accepted tester list or public RPC approval. Studio retains the required `rpc.voice.read` permission for mute, deafen, and speaking events.

## 1.2.5 — Discord connection compatibility

- Fixed Discord Desktop connections on Windows systems that expose RPC through the standard named-pipe path but reject the extended path. Studio now tries both supported Windows pipe forms across all ten Discord IPC slots.
- Replaced the raw final pipe error with actionable guidance for unavailable and permission-blocked Discord connections.

## 1.2.4 — Shareable profiles and runtime limits

- Added portable Discord Guest Profiles. Streamers can export a person's Discord ID, overlay name, accent, and idle/speaking/mute/deafen images into one integrity-checked file, then import it on another Studio installation for automatic Discord ID matching without sharing server history, authorization, layout, or source paths.
- Added a visible per-alert **Maximum runtime** to every Interaction Alert, Twitch Alert, and Twitch variant. The limit now governs sound, visuals, TTS, avatar/reaction leases, and shared queue playback.
- Fixed Browser Source audio stop timers being cancelled when an alert's visual left the canvas, which allowed long audio files to continue playing until their natural end.

## 1.2.3 — Stable Discord canvas editing

- Fixed live Discord polling rebuilding the guest editor while a streamer was typing or dragging. Unsaved profile values now remain stable, Manual canvas placement responds immediately, and drag positions save on release.
- Discord Browser Source profiles are now reconciled in place, so routine voice-state updates no longer reload every PNG or GIF and flash the overlay.

## 1.2.2 — Discord Guest card layout fix

- Fixed Discord Guest profile cards becoming clipped when several saved people were shown at once. Cards now use a readable responsive width and wrap their actions cleanly.

## 1.2.1 — Discord Guest profile controls

- Discord Guests profiles now show their assigned artwork directly in Studio, support separate idle, speaking, muted, and deafened images, and can be dragged into per-person positions on a canvas-sized preview. The streamer's own profile can also be hidden without affecting the other guests.

## 1.2.0 — Official Discord sign-in and saved guests

- Discord Guests now keeps a persistent, editable guest library keyed by Discord User ID. Every detected voice participant remains available for offline idle/speaking image setup, streamers can add a profile by User ID before the guest joins, and reset/forget controls make the saved list manageable without ever displaying offline guests in the Browser Source.
- Bundled the official Tempest Discord application ID and connected Studio to the hosted Tempest Signal token exchange, so supported Discord Desktop users can authorize without creating their own Discord developer application or placing a client secret on their computer.

## 1.1.1 — Custom Twitch Experiences

- Added independent Twitch Experience designers for Hype Train, Raid Portal, and Goals with Tempest, Minimal, and Mainframe presets; local PNG/JPG/GIF/WebP/AVIF/MP4/WebM layers; media fit and opacity; portable backup support; and advanced HTML/CSS/JavaScript. Raid Portal now defaults to an animated Mainframe Breach presentation while retaining the original portal as a selectable preset.

## 1.1.0 — Discord guests and scene-aware alerts

- Upgraded the shared Twitch and Interaction Alert designer with automatic per-Broadcast-scene placement overrides, a global fallback, safe-edge and configurable grid snapping, exact horizontal/vertical centering, visible center guides, keyboard nudging with undo history, and a silent persistent **Show on Canvas** mode that updates the real Browser Source while positioning.
- Added a first-class Discord Guests Browser Source with local idle/speaking PNG, GIF, JPG, WebP, or AVIF assignments; responsive layouts; speaking glow/scale; mute/deafen indicators; per-person names, colors, order, and visibility; live preview; persistence; and portable backup support.
- Added a supported Discord Desktop RPC connector for selected-channel membership and speaking events, encrypted Windows OAuth storage and refresh, one-click authorization, automatic channel following, and a hosted token-exchange boundary that keeps the Discord client secret out of the desktop application.

## 1.0.1 — Signed updates and avatar controllers

- Made Twitch onboarding a normal sign-in experience by bundling the official Public Tempest application Client ID; streamers no longer need a developer account, while self-hosters retain an Advanced custom Client ID override.
- Added an in-app stable release updater with quiet background checks, user-approved downloads and restarts, download progress, and Windows publisher verification for signed NSIS installers.
- Simplified the end-user navigation by removing the developer-oriented Workflows, Software, and Assets pages while retaining workflow execution and companion-app registry APIs internally.
- Added an end-user Avatar Controllers screen with a bundled, saveable Warudo Playground receiver and direct VTube Studio authorization, encrypted token storage, loaded-model hotkey discovery, and per-alert hotkey assignments.

## 1.0.0 — Stream experiences, emotes, privacy, and moderation

- Added a native broadcaster EventSub connection and a shared Twitch Experiences Browser Source for Hype Train Takeover, Raid Portal, and channel-goal progress, with independent enablement, previews, colors, connection health, persistence, backup support, and safe raid coexistence.
- Added a configurable Emote Wall Browser Source that turns native Twitch emote and GIF chat fragments into independently bouncing canvas sprites, with enablement, density, lifetime, size, speed, animation, preview, and clearing controls.
- Added community-built `1 → 2 → 3 → 2 → 1` Emote Pyramid recognition with a full-canvas celebration, participant credit, configurable build window and cooldown, and an in-app preview.
- Added opt-in 7TV, BetterTTV, and FrankerFaceZ catalogs with exact-name matching, provider priority and health controls, manual refresh, host validation, and a bounded local media proxy/cache.
- Reorganized the sidebar into Stream Design, Automation, Connections, Tools + Records, and Studio categories and removed numeric prefixes from navigation tabs.
- Added a default-on Privacy Shield with persistent in-app masking for streamer identities, authorization codes, channel/client IDs, locations, provider URLs, local endpoints, and all four Browser Source URLs.
- Added Windows capture protection for the Studio and isolated Twitch authorization windows, with independent controls in Settings and a quick masking toggle in the top bar.
- Added configurable Chatbot AutoMod rules for unapproved links, blocked terms, excessive caps, and repeated-character spam, including domain allowlists, trusted-role exemptions, dry-run previews, message deletion, optional timeouts, and chat notices.
- Added the narrow Twitch moderator scopes required for message deletion and timeouts; existing bot connections must be reauthorized before those actions can run.
- Added automatic raid welcomes, queued official Twitch shoutouts, and assigned-creator first-chat shoutouts.
- Added an Assigned Creators access policy that can restrict all Twitch-panel interactions to the same creator list, with optional broadcaster/moderator override, server-side enforcement, Twitch identity linking, and denied-request logging.

## 0.21.0 — Public Extension installations

- Replaced the single global channel allowlist and relay token with PostgreSQL-backed public installations.
- Added Twitch OAuth ownership validation, per-installation relay credentials, hash-only server storage, encrypted Windows client storage, revocation, and automatic reconnect.
- Added a Hosted Extension pairing panel directly inside Twitch Gateway so streamers do not need PowerShell or manually copied relay secrets.
- Embedded the official `https://signal.tempestmainframe.com` service in Studio and public Extension builds while retaining explicit development and self-hosted overrides.
- Routed Twitch-signed viewer requests by their channel installation while preserving origin checks, anonymous-viewer policy, rate limits, replay dedupe, Studio cooldowns, and emergency restore.
- Added channel-scoped signal catalog publication containing only IDs, display labels, timing, and colors; local media and machine paths remain outside the EBS.
- Added Railway PostgreSQL deployment settings and retained an isolated legacy mode for localhost Extension testing.

## 0.20.0 — Public release foundation

- Renamed the desktop product surface to Tempest Streaming Studio while preserving stable Tempest protocol identifiers.
- Split Twitch Alerts and Interaction Alerts into dedicated Browser Sources with independent OBS/VOD audio routing.
- Added FIFO alert queuing, queue clearing, durable playback history, failure/cancellation states, source-client health, and missing-media diagnostics.
- Added complete Twitch and Interaction Alert design controls for canvas position, scale, media/text layers, animation, timing, TTS, and isolated HTML/CSS/JavaScript.
- Added conditional Twitch Alert variants for Bits, raids, subscription tier/tenure, and channel-point reward rules.
- Added portable Alert Packs with embedded content-addressed media, SHA-256 verification, deduplication, and custom-code trust warnings.
- Added complete Studio backup/restore with portable alert media, credential/path exclusions, rollback snapshots, schema migrations, and downgrade protection.
- Added adaptive 1920 × 1080 first-run defaults with automatic compatible-broadcaster canvas discovery and manual HD/QHD/ultrawide/custom profiles.
- Added configurable secondary Twitch bot identity, optional NWS local-weather settings, and optional AzuraCast Now Playing settings. Clean installs contain no personal station, location, bot-login, or ultrawide assumptions.
- Added Twitch Panel Designer, local chat overlay, GIPHY search/import, local Extension controls, and copy-to-clipboard affordances.
- Added Settings + About, privacy boundaries, local data access, and redacted diagnostics export.
- Added Windows NSIS and ZIP packaging with bundled Extension assets, writable per-user certificate storage, and upgrade-preserved Studio data.
- Disabled creator-specific Black Hole automation and Warudo reactions on clean installs while preserving upgraded configurations and stable internal IDs.
- Replaced the creator dance catalog and Extension buttons on clean installs with six generic, media-free starter interactions; existing alert catalogs remain intact during upgrade.
- Added consistent keyboard focus indicators and reduced-motion handling for the Studio shell.

## 0.11.6 — Authorization completion handoff

- Automatically closed isolated Twitch sign-in windows when Chatbot authorization completes.
- Closed expired activation windows once the Device Code flow terminates.
- Closed any outstanding isolated sign-in when the operator disconnects the Chatbot.
- Preserved the normal window close control and temporary-session storage cleanup.

## 0.11.5 — Isolated chatbot authorization

- Replaced automatic default-browser launch for the secondary Chatbot account with an isolated in-app Twitch sign-in.
- Used a unique non-persistent Electron session for every activation attempt.
- Erased temporary Twitch cookies and storage when the isolated sign-in closes.
- Restricted the isolated window to Twitch HTTPS navigation and denied downloads and permission requests.
- Added copy-code, copy-link, reopen-isolated, and explicit default-browser fallback controls.

## 0.11.4 — Chatbot command pack

- Added `!commands`/`!help` with permission-aware and Shared Chat-aware command discovery.
- Added cached `!uptime`/`!live`, `!title`, `!game`/`!category`, and `!schedule`/`!nextstream` Twitch responses without new OAuth scopes.
- Added `!lurk` and `!unlurk`/`!back` community responses.
- Added provider-safe fallback messages and bounded Helix caching.
- Added a command requirements reference for future social, followage, shoutout, clip, quote, music, and loyalty commands.

## 0.11.3 — Shared Chat command safety

- Redesigned the Twitch viewer panel as a compact signal deck with a featured event, two-column performance cards, category filters, search, visible durations, and cooldown states.
- Preserved Twitch Shared Chat source-channel and source-message metadata in normalized chat events.
- Added per-command **Allow from Shared Chat** policy with safe migration defaults.
- Kept subscriber, moderator, and broadcaster permissions scoped to the owner's home channel.
- Added home-channel and Shared Chat origins to the command simulator.
- Displayed collaborator-channel origins in Chatbot Activity and the command directory.
- Used Twitch source message IDs for cross-channel duplicate protection.

## 0.11.2 — Chat response presentation

- Changed Chatbot command output to standalone Twitch messages by default.
- Added an optional per-command **Reply directly to viewer** setting.
- Migrated existing commands to standalone delivery without changing responses, permissions, cooldowns, or workflow links.

## 0.11.1 — Seattle weather command

- Added an automatically installed `!weather` command for Seattle time and weather.
- Added a National Weather Service response provider using fixed Seattle coordinates and no API key.
- Added ten-minute weather caching, one-hour last-good fallback, and a compact outage response.
- Added a built-in response-source selector to the Chatbot command editor.
- Kept simulations from sending Twitch messages or consuming live cooldowns.

## 0.11.0 — TempestMainframe Chatbot

- Added a dedicated Chatbot section with live identity, EventSub, chat-output, command, trigger, and activity status.
- Added a second operating-system-encrypted OAuth identity restricted to the `TempestMainframe` Twitch profile.
- Added `channel.chat.message` EventSub WebSocket intake with Welcome subscription, keepalive monitoring, reconnect handling, subscription restoration, and duplicate-delivery protection.
- Added Twitch Helix chat replies using `user:write:chat`; broadcaster OAuth and bot OAuth remain separate.
- Added persistent commands, aliases, role permissions, response templates, enable state, per-viewer cooldowns, global cooldowns, and optional workflow links.
- Added `{user}`, `{command}`, and `{args}` reply variables plus a command simulator that does not post to Twitch or consume live cooldowns.
- Preserved the normalized `viewer.chat.message` boundary, workflow safety controls, high-bandwidth media boundary, and observation-only Bits policy.

## 0.10.2 — In-app Local Extension setup

- Added a single-channel Local Extension panel to the Twitch Gateway for the owner's authorized Twitch account.
- Added masked Extension-secret entry and operating-system-encrypted storage; saved secrets are never displayed or written into Extension assets.
- Added in-app Start, Stop, Open Panel, Prepare Certificate, and Forget Secret controls.
- Embedded the localhost Extension asset server and EBS lifecycle into Studio, including dynamic relay attachment without restarting Studio.
- Kept the EBS channel allowlist, JWT verification, anonymous-viewer rejection, rate limits, dedupe, cooldowns, and emergency restore behavior.
- Removed PowerShell from the normal local Extension workflow while retaining the CLI as an advanced diagnostic path.

## 0.10.1 — Twitch Extension relay

- Added a guided Warudo Setup page with live adapter/socket status, a visible connection path, and one-time blueprint instructions.
- Embedded the Warudo adapter in Studio and corrected its default endpoint to Warudo's built-in `ws://127.0.0.1:19190` receiver.
- Grouped navigation into Setup, Operate, and Library tasks so integrations are easier to find.
- Added the hosted Twitch Extension Backend Service with HS256 JWT verification, channel and action allowlists, anonymous-viewer policy, rate limiting, request idempotency, and an authenticated WebSocket handoff.
- Added Studio's outbound Extension relay with reconnects, heartbeat messages, connection status, and delivery through the existing normalized Twitch event boundary.
- Added build-time public EBS configuration for hosted Extension assets, removed Extension-authored CSP meta tags, and added the `tempest.blackhole` viewer interaction alongside the Sound Alert catalog.

## 0.10.0 — Twitch authorization foundation

- Added Twitch Device Code authorization for a public desktop client.
- Added operating-system-encrypted access and refresh token storage.
- Added token validation, reactive 401 refresh, refresh-token rotation, revocation, and disconnect.
- Added configurable interaction scopes and channel-point reward/action mappings.
- Added a complete Twitch Gateway setup surface with activation-code polling and account status.
- Added the Studio-owned free Sound Alert catalog with all 13 current Warudo dance cues and exact 8–58 second durations.
- Added per-alert enable state, viewer/global cooldowns, local audio assignment, playback volume, and full-workflow testing.
- Added local audio shutdown to Emergency Restore and kept audio files outside the Bridge message plane.
- Defined Video Component + Mobile Extension intake and the hosted EBS/outbound Studio relay security boundary.
- Added `productVersion` to Bridge health and a visible 0.10.0 build badge.
- Preserved normalized Twitch ingestion, replay dedupe, explicit Bits mapping, cooldowns, timed leases, and Emergency Restore.
- Kept EventSub/chat transport disconnected pending the next connector release.

## 0.1.0 — Orchestration prototype

- Introduced the Tempest Bridge, application and asset registries, workflow engine, Black Hole Event, Sound Alert Performance workflow, and Electron Studio dashboard.
