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
