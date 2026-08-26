# Changelog

## 0.21.0 — Public Extension installations

- Replaced the single global channel allowlist and relay token with PostgreSQL-backed public installations.
- Added Twitch OAuth ownership validation, per-installation relay credentials, hash-only server storage, encrypted Windows client storage, revocation, and automatic reconnect.
- Added a Hosted Extension pairing panel directly inside Twitch Gateway so streamers do not need PowerShell or manually copied relay secrets.
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
