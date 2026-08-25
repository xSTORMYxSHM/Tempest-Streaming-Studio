# Twitch Interaction Integration

## 0.11.6 Authorization completion handoff

When the Chatbot Device Code poll reports success, expiry, or another terminal result, Studio automatically closes every outstanding isolated Twitch authorization window. Closing the window triggers the same temporary-session cookie and storage cleanup as the normal window close button. Disconnecting the Chatbot also closes any pending isolated authorization window.

## 0.11.5 Isolated Chatbot authorization

The broadcaster and `TempestMainframe` remain separate Twitch principals. Starting the secondary Chatbot Device Code flow now opens Twitch activation in a unique, non-persistent Electron session instead of automatically launching the operating system's default browser. This gives the bot a clean login without signing the broadcaster out of Edge, Chrome, Firefox, or another normal browser profile.

The isolated window permits only Twitch HTTPS navigation, denies downloads and browser permission requests, and clears its temporary cookies and storage when closed. Studio continues polling the Device Code exchange in the Bridge and never receives either account's Twitch password. Operators may copy the activation code or link, reopen the isolated sign-in, or explicitly choose the default-browser fallback.

## 0.11.4 Chatbot command pack

Studio automatically installs `!commands`, `!uptime`, `!title`, `!game`, `!schedule`, `!lurk`, and `!unlurk` alongside `!tempest` and `!weather`. The Twitch-backed handlers use the existing Chatbot user token: Get Streams, Get Channel Information, and Get Channel Stream Schedule accept a user token without additional scopes. Stream state is cached for 30 seconds, channel title/category for one minute, and schedule state for five minutes.

`!commands` filters its directory by enabled state, the requesting viewer's home-channel role, and Shared Chat policy. Twitch/API failures return compact fallback replies rather than leaking HTTP errors or dispatching workflows. See `TWITCH_CHATBOT_COMMANDS.md` for aliases and the authorization or configuration required by proposed commands.

## 0.11.3 Shared Chat command safety

Twitch mirrors ordinary messages between participants in a Shared Chat session. `TempestMainframe` keeps its single `channel.chat.message` subscription attached to the owner's authorized home channel, but now preserves Twitch's `source_broadcaster_*`, `source_message_id`, and `is_source_only` fields in the normalized chat payload. The source message ID is the duplicate key when Twitch supplies one.

Each command has an **Allow from Shared Chat** policy. The built-in `!tempest` and `!weather` response commands allow collaborator-channel invocation. Existing and newly loaded everyone-access response commands migrate to allowed; commands with a workflow or elevated permission migrate to home-channel-only unless the operator explicitly enables Shared Chat access. Cooldowns remain global to the running Chatbot, so one shared session cannot multiply command throughput.

Permissions always use the badges Twitch reports for the owner's destination channel. A moderator, subscriber, or broadcaster role held only in the collaborator's source channel does not grant the corresponding Tempest permission. Chatbot Activity identifies the collaborator channel, and the simulator can exercise the same origin policy without posting to Twitch.

The Chatbot uses a user access token for output. Twitch therefore distributes accepted command responses to all participants in an active Shared Chat session; the current user-token API does not provide a source-channel-only output option.

## 0.11.1 Seattle weather response

The Chatbot automatically installs `!weather` with the `seattle-weather` response handler. Studio formats current Pacific time with the `America/Los_Angeles` time zone and retrieves the first hourly forecast period for `47.6062,-122.3321` through `api.weather.gov`. Forecast data is cached for ten minutes; a last-good reading remains usable for up to one hour if the provider has a short outage. No API key, Windows taskbar scraping, viewer location, Nightbot, or Botrix connection is used.

The built-in `!song` command reads Storm Horizon Radio's public AzuraCast Now Playing endpoint. It reports the current artist, title, and album with the public player-page link, caches successful reads for 15 seconds, and returns a compact offline or provider-outage fallback without exposing raw HTTP errors. Broadcast uses the station's embed widget separately, while the `/listen/storm_horizon_radio/radio.mp3` endpoint remains the raw audio-only stream.

## 0.11.0 TempestMainframe Chatbot

Studio now authorizes two distinct Twitch principals with the same public client ID:

- The broadcaster account owns channel identity, rewards, subscriptions, follows, and other interaction-facing channel authorization.
- `TempestMainframe` owns chat intake and chat output using a separately encrypted token with `user:read:chat` and `user:write:chat`.

After both accounts are authorized, Studio opens one EventSub WebSocket and creates a `channel.chat.message` subscription for the broadcaster's channel and the bot identity. Welcome, keepalive, notification, reconnect, revocation, close, and resubscription paths are handled inside the Bridge. Twitch message IDs are deduplicated before commands can run.

The Chatbot command engine consumes only normalized `viewer.chat.message` events. Commands support aliases, everyone/subscriber/moderator/broadcaster permissions, per-viewer and global cooldowns, a 500-character response template, and an optional Tempest workflow ID. Simulations run permission and workflow routing without posting a Twitch message, entering Twitch event counts, or consuming live command cooldowns.

## 0.10.2 single-channel Local Extension

Studio 0.10.2 moves the owner-only localhost Extension workflow into the Twitch Gateway. The authorized account supplies the numeric channel ID; the operator pastes the Extension shared secret into a masked field once; Electron stores it using operating-system encryption. Start and Stop controls own the localhost Extension asset server, EBS, and dynamically attached Studio relay as one lifecycle.

The runtime still verifies every Twitch JWT, restricts requests to that one channel, rejects anonymous sessions by default, rate-limits and deduplicates interactions, and keeps the secret out of the Extension front end and ordinary configuration files. **Forget Secret** stops the runtime and deletes the encrypted local credential.

## 0.10.1 Extension boundary

Studio 0.10.1 adds the hosted Extension Backend Service and the channel-bound outbound Studio relay. The EBS verifies Twitch Extension JWTs, allowlists channels and actions, applies anonymous-viewer policy, rate-limits and deduplicates requests, then hands normalized interactions to Studio without exposing the localhost Bridge. The Video Component receives its public EBS origin at build time and never embeds the Extension shared secret or Studio relay token.

## 0.10.0 boundary

Tempest Streaming Studio 0.10.0 establishes the authorization and configuration layer required by the live Twitch connector. It uses Twitch's Device Code Grant as a public client, which is appropriate for a locally installed Electron application and does not require embedding a client secret.

The release includes:

- Public Twitch application client-ID configuration.
- A curated interaction-scope set for chat, follows, subscriptions, Bits observations, rewards, polls, predictions, and Hype Trains.
- Device activation with Twitch-hosted login and consent.
- Access and rotating refresh tokens encrypted through Electron `safeStorage`.
- Token validation and reactive refresh after Twitch returns HTTP 401.
- Explicit token revocation and local credential removal.
- Persistent channel-point reward ID to Tempest action mappings.
- Existing canonical-event validation, replay dedupe, cooldowns, leases, and routing.

EventSub and chat were intentionally left disconnected in 0.10.0; the 0.11.0 Chatbot release implements that transport for `channel.chat.message`. Additional channel subscription types can now be attached to the same Studio-owned normalization boundary without moving Twitch authentication into Broadcast or Warudo.

## Setup

1. Register a public application in the Twitch Developer Console and copy its client ID.
2. Open Studio's Twitch Gateway page.
3. Paste the public client ID and optionally map channel-point reward IDs to namespaced Tempest actions.
4. Save the configuration and select **Connect Twitch**.
5. Complete Twitch's activation page using the code displayed by Studio.
6. Studio validates the resulting token and shows the authorized Twitch account.

No Twitch password enters Studio. No client secret is required or accepted. Non-secret settings are stored in `twitch-integration.json`; tokens are stored separately as operating-system-encrypted bytes.

## Reward mapping

Each line in the desktop editor uses:

```text
twitch-reward-id = tempest.blackhole
```

An unmapped reward remains an observation. Studio inserts the configured action only after validating the canonical redemption event. Bits and cheers likewise remain non-routable unless the operator explicitly registers a `twitch.cheer` workflow and assigns an action.

## Product ownership

Studio owns interaction-facing Twitch OAuth, EventSub, chat, rewards, Extensions, normalization, and routing. Tempest Broadcast continues to own OBS/Twitch stream-service authentication, outgoing stream credentials, and Stream Information.
