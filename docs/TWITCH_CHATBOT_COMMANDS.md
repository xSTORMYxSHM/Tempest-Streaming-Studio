# Twitch Chatbot Commands

## Installed command pack

Clean installations include these public-safe commands. They allow Shared Chat by default and use the secondary Chatbot account's existing `user:read:chat` and `user:write:chat` authorization.

| Command | Aliases | Behavior | Additional requirement |
| --- | --- | --- | --- |
| `!studio` | `!tempest` | Reports that the Studio chatbot is online. | None |
| `!commands` | `!help` | Lists enabled commands the requesting viewer may use from that chat origin. | None |
| `!uptime` | `!live` | Reports live duration and current viewer count, or offline state. | Twitch Get Streams; no new scope |
| `!title` | — | Reports the current Twitch stream title. | Twitch Get Channel Information; no new scope |
| `!game` | `!category` | Reports the current Twitch category. | Twitch Get Channel Information; no new scope |
| `!schedule` | `!nextstream` | Reports the next Twitch schedule segment in the configured/system time zone. | A schedule configured on Twitch; no new read scope |
| `!lurk` | — | Acknowledges a viewer entering lurk mode. | None |
| `!unlurk` | `!back` | Welcomes a viewer back from lurk mode. | None |

Stream status is cached for 30 seconds, channel information for one minute, and schedules for five minutes. Provider failures produce a short chat-safe fallback instead of triggering a workflow or exposing an HTTP error.

## Optional response providers

The Chatbot page can configure a United States National Weather Service location and an AzuraCast now-playing station. After a provider is configured, its response handler becomes available to new or existing commands such as `!weather` or `!song`. Provider URLs and locations are installation settings; they are not embedded public defaults. NWS forecasts are cached for ten minutes and AzuraCast readings for 15 seconds.

## Useful commands that need setup

| Proposed command | What it needs |
| --- | --- |
| `!discord`, `!socials`, `!youtube` | Operator-configured URLs and corresponding Studio settings fields. No Twitch scope is required. |
| `!followage` | Broadcaster authorization with `moderator:read:followers`; the bot must use the broadcaster token or be a moderator. |
| `!so @channel` | Bot moderator status, `moderator:manage:shoutouts`, target parsing, and Twitch's shoutout cooldown handling. |
| `!clip` | A clip-creation authorization scope, live/offline error handling, and a way to return the finished clip URL. |
| `!quote`, `!addquote` | A persistent quote database plus moderator-only add/remove commands and backup/export controls. |
| `!points`, `!rank` | A Studio loyalty database or an external loyalty provider; Twitch Channel Points balances are not exposed as a general viewer-balance API. |

Privileged commands should remain home-channel-only unless the operator deliberately enables **Allow from Shared Chat**. Shared Chat access never imports moderator, subscriber, or broadcaster permissions from a collaborator's channel.

## Studio AutoMod

The Chatbot page can inspect home-channel chat before command handling and enforce any combination of:

- link protection with an allowed-domain list;
- custom blocked terms and phrases;
- excessive-capital-letter thresholds;
- repeated-character spam limits.

The broadcaster, home-channel moderators, and VIPs are exempt by default. Shared Chat messages remain under their source channel's moderation boundary. Every configuration includes a dry-run preview that does not act on Twitch.

Deleting a matched message requires `moderator:manage:chat_messages`. Optional viewer timeouts require `moderator:manage:banned_users`. The secondary bot account must be reauthorized with the selected scope and remain a moderator in the broadcaster's channel. AutoMod intentionally does not issue permanent bans.

## Assigned Creators

The **Assigned Creators** card owns one public Twitch-login list that can be used for either or both of these independent features:

- send an official shoutout the first time an assigned creator chats during a live stream;
- restrict every hosted Twitch-panel interaction to assigned creators, with an optional broadcaster and moderator override.

Restricted access is enforced inside Studio before an alert or workflow enters its queue. Hiding buttons is not treated as authorization. Studio resolves the configured logins to numeric Twitch user IDs through the connected bot account and also learns a verified ID when an assigned creator chats.

Viewers must share their Twitch identity with the Extension before Studio can compare them to the assigned list. The Extension opens Twitch's own identity-sharing prompt when an otherwise valid restricted interaction lacks a linked identity. The Extension's **Request Identity Link** capability must be enabled in the Twitch Developer Console for that prompt to work.
