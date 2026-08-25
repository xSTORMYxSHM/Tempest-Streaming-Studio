# Public Release UI Generalization Plan

## Goal

Prepare Tempest Streaming Studio for public use without removing the Tempest brand. The application should remain recognizably **Tempest Streaming Studio**, while its controls, defaults, examples, and setup language describe the user's streaming environment instead of the original Tempest creator setup.

This is not a global search-and-replace. Some `tempest.*` and `com.tempestmainframe.*` values are stable protocol identifiers. Public-facing display names can be generalized without breaking those identifiers.

## Naming rule

### Keep as Tempest branding

- Product name: **Tempest Streaming Studio**.
- Logo, `TM` mark, cyan visual system, window title, About screen, publisher attribution, and package identity.
- The optional **Tempest HUD** alert style preset.
- Internal package names, environment variables, API headers, schema names, source identifiers, and existing `tempest.*` / `com.tempestmainframe.*` IDs.
- Names of actual companion products when the UI is specifically referring to them, such as **Tempest Broadcast (optional)**.

### Generalize as product language

- Functional labels such as Bridge, workflow, library, application, capability, permission, bot identity, and performance cue.
- Descriptions that assume the user owns Tempest Broadcast, Quartic Pulse, Data Horizon, Storm Horizon Radio, or the `@TempestMainframe` Twitch account.
- Personal settings such as the 3440 × 1440 canvas, 2580 × 1080 output, Seattle weather, radio station, and fixed Twitch bot login.
- Default examples that present the black-hole workflow, dance catalog, or private companion applications as universal parts of Studio.

## UI terminology audit

| Current UI | Proposed public UI | Work type |
| --- | --- | --- |
| `TEMPEST EVENT ORCHESTRATION` | `LIVE EVENT ORCHESTRATION` | Copy only |
| “across Warudo, the Tempest OBS fork, Quartic Pulse, Data Horizon…” | “across your avatar, broadcast, visual, and performance tools” | Copy only |
| `Simulate Black Hole` | `Test Sample Workflow` | Copy plus generic sample data |
| `Tempest Bridge` | `Local Bridge` or `Local Control Service` | Display-name change; retain protocol name internally |
| `TEMPEST BRIDGE` page kicker | `LOCAL CONTROL PLANE` | Copy only |
| `Tempest Performance Cue` | `Studio Performance Cue` | UI and Warudo node display-name migration |
| visible `tempestPerformance` action | `Performance event` with the raw action under an Advanced disclosure | UI restructuring; retain action internally |
| `Tempest Broadcast` in general instructions | `OBS / broadcast software` | Copy and capability-based adapter discovery |
| “in Tempest Broadcast without Botrix” | “in OBS or another browser-source-capable broadcaster” | Copy only |
| `TempestMainframe EventSub intake` | `Connected Twitch chat intake` | Copy only |
| “entire suite” | “your streaming setup” | Copy only |
| `Tempest capabilities` | `normalized Studio actions` | Copy only |
| `TempestMainframe Chatbot` | `Chatbot` | Copy after configurable bot identity exists |
| `Connect TempestMainframe` | `Connect Bot Account` | Copy plus runtime configuration |
| `Tempest workflow` | `Studio workflow` or `Automation` | Copy only |
| `Tempest permissions` | `command permissions` | Copy only |
| `Register Tempest applications` | `Register compatible applications` | Copy only |
| `Mainframe Library` | `Asset Library` | Copy only |
| `Tempest Scene` asset label | `Scene` | Display label only; retain `tempest.scene` value |
| “Data Horizon visuals…” | “visuals, overlays, profiles, and performance packages…” | Copy only |
| `Storm Horizon Radio — now playing` | `Radio / now-playing provider` | Configuration and provider abstraction |
| `Seattle time and weather` | `Local time and weather` | Configuration and location abstraction |
| fixed `3440 × 1440` setup copy | values from Stream Canvas settings | New settings model |

## Personal assumptions that block a public release

### 1. Chatbot identity

The Bridge currently rejects any chatbot authorization whose Twitch login is not `tempestmainframe`. Renaming the buttons would be misleading until this restriction is removed.

Public behavior:

- Let the user connect any separate Twitch bot account.
- Record the authorized account login and user ID instead of comparing it to a compiled login.
- Continue to keep broadcaster and bot credentials encrypted and separate.
- Use the connected login dynamically in headings, confirmation messages, and status cards.
- Rename the default `!tempest` status command to `!studio`, while retaining `!tempest` as a migration alias for existing installations.
- Replace the default response with neutral copy such as “Studio chatbot online, {user}.”

### 2. Radio and `!song`

Storm Horizon Radio is currently a compiled integration and is always shown in Software Management and the command editor.

Public behavior:

- Add a **Now Playing Provider** setting.
- Support an AzuraCast station using a server URL, station short code, and public player URL.
- Show the radio software card and handler only after a provider is configured.
- Keep Storm Horizon Radio as an optional example/profile, not a global default.
- Return a generic offline message using the configured station name.

### 3. Weather and local time

The command handler currently assumes Seattle and the National Weather Service.

Public behavior:

- Ask for location and time zone during optional chatbot setup.
- Label the handler **Local time and weather**.
- Keep NWS as a United States provider and explain its coverage, or add a provider interface before advertising worldwide weather support.
- Hide the handler when no location is configured.

### 4. Stream canvas

The current 3440 × 1440 base canvas and 2580 × 1080 output are creator-specific settings.

Public behavior:

- Add **Settings → Stream Canvas** with base width, base height, output width, output height, and FPS.
- Default new installations to 1920 × 1080 without overwriting an upgraded user's current ultrawide profile.
- Drive alert placement, chat-overlay previews, and Browser Source setup text from these values.
- Store placement as percentages, as it is now, so profile changes remain predictable.
- Offer common presets plus Custom: 1920 × 1080, 2560 × 1440, 3440 × 1440, and 3840 × 2160.

### 5. Companion applications and workflows

Several UI paths assume exact `com.tempestmainframe.*` application IDs and the bundled black-hole workflow assumes Warudo, Tempest Broadcast, Quartic Pulse, and Data Horizon.

Public behavior:

- Discover broadcast, avatar, audio, and visual integrations by advertised capability rather than one application ID.
- Present Tempest Broadcast, Quartic Pulse, and Data Horizon as optional integrations when installed.
- Move the black-hole workflow and creator dance setup into an optional **Tempest Creator Pack**.
- Ship a small generic sample workflow that can run safely with no external applications.
- Display missing optional targets as optional, not as a broken base installation.

## Proposed public information architecture

The current feature set can remain, but the navigation should describe jobs rather than the original suite topology:

1. **Live Control** — runtime status and active automations.
2. **Stream Setup** — canvas profile and Browser Source URLs.
3. **Twitch** — broadcaster authorization, EventSub, rewards, and Extension relay.
4. **Chatbot** — optional bot account and command management.
5. **Alerts** — Twitch Alerts and Interaction Alerts as adjacent views.
6. **Overlays** — alert output and chat overlay configuration.
7. **Automations** — workflows, cooldowns, and safety behavior.
8. **Integrations** — Warudo, OBS/broadcast adapter, and registered compatible applications.
9. **Asset Library** — locally indexed media and packages.
10. **Activity** — events, runs, and diagnostics.
11. **Settings / About** — profiles, updates, privacy, logs, version, and Tempest branding.

This navigation reorganization should follow the copy and configuration work, not precede it.

## Compatibility policy

- Do not rename `tempest.*`, `com.tempestmainframe.*`, `X-Tempest-Token`, IPC bridge names, environment variables, manifest schemas, or WebSocket actions during the UI pass.
- Treat those values as a public compatibility surface once external users can create workflows or adapters.
- Where a raw identifier is useful, place it under **Advanced**, **Developer details**, or a copyable code field instead of using it as the primary label.
- Add aliases and a versioned migration before any future protocol rename.
- Preserve existing encrypted credentials, alert designs, workflows, assets, canvas settings, and command IDs during upgrades.

## Phased implementation

### Phase 0 — Freeze vocabulary and protect compatibility

- Approve the keep/generalize naming rule in this document.
- Add a shared UI-copy module for repeated product terminology.
- Add tests that distinguish visible labels from stable internal identifiers.
- Capture upgrade fixtures from the current creator installation.

Exit condition: approved glossary and upgrade fixture with no user-data loss.

### Phase 1 — Safe copy-only generalization

- Generalize the hero, Connections, Software Management, Asset Library, Twitch Gateway, chat overlay, and workflow labels.
- Remove Quartic Pulse, Data Horizon, Storm Horizon, and fixed bot references from generic empty states and help text.
- Keep actual installed product names on application cards.
- Keep Tempest Streaming Studio branding and Tempest HUD.

Exit condition: a first-time user can read every base screen without being told they own a private companion app or account.

### Phase 2 — Public settings and first-run profile

- Add Stream Canvas settings and replace compiled dimensions.
- Add configurable bot identity, location/time zone, and now-playing provider.
- Add first-run choices for Twitch, chatbot, Warudo, radio, weather, and browser overlays.
- Hide unconfigured optional features instead of showing creator-specific defaults.

Exit condition: a clean installation contains no Storm Horizon, Seattle, `@TempestMainframe`, or ultrawide assumptions.

### Phase 3 — Capability-based integrations

- Replace exact Broadcast application-ID lookups with capability discovery.
- Make Warudo an optional avatar integration and keep its setup available when enabled.
- Split creator-specific workflows and application manifests into an optional profile/content pack.
- Provide a generic no-dependency sample automation.

Exit condition: alerts, overlays, chatbot, and local automation work without any other Tempest application installed.

### Phase 4 — Release UX and distribution readiness

- Add Welcome, Settings, About, diagnostics export, data-location, reset, and uninstall-data guidance.
- Review accessibility, keyboard navigation, scaling, reduced motion, and error recovery.
- Add privacy disclosures for Twitch, GIPHY, weather, radio, and any update service.
- Establish signing, installer, update channel, crash-reporting choice, license, third-party notices, and release notes.
- Test clean install, upgrade, offline use, disconnected integrations, and removal on a non-developer Windows account.

Exit condition: a signed release candidate passes clean-install and upgrade acceptance tests without development paths, secrets, or personal configuration.

## Recommended first implementation slice

The safest first slice is Phase 1 copy generalization plus the Stream Canvas setting from Phase 2. It produces immediate public-facing improvement without touching protocol IDs, and it removes the newest hard-coded personal assumption before more alert layouts are built around it.

The chatbot, radio, and weather labels should not be generalized until their underlying settings are configurable. Until then, they should be clearly marked as creator-profile integrations rather than presented as base Studio features.
