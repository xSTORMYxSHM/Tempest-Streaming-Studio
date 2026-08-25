# Twitch Chatbot Commands

## Installed command pack

These commands are installed automatically, allow Shared Chat by default, and use the Chatbot's existing `user:read:chat` and `user:write:chat` authorization.

| Command | Aliases | Behavior | Additional requirement |
| --- | --- | --- | --- |
| `!tempest` | `!mainframe` | Reports that TempestMainframe is online. | None |
| `!commands` | `!help` | Lists enabled commands the requesting viewer may use from that chat origin. | None |
| `!uptime` | `!live` | Reports live duration and current viewer count, or offline state. | Twitch Get Streams; no new scope |
| `!title` | — | Reports the current Twitch stream title. | Twitch Get Channel Information; no new scope |
| `!game` | `!category` | Reports the current Twitch category. | Twitch Get Channel Information; no new scope |
| `!schedule` | `!nextstream` | Reports the next Twitch schedule segment in Pacific time. | A schedule configured on Twitch; no new read scope |
| `!weather` | — | Reports Seattle time and the current National Weather Service forecast. | Internet access to `api.weather.gov`; no API key |
| `!song` | `!nowplaying` | Reports the current artist, title, and album from Storm Horizon Radio. | Public AzuraCast Now Playing API; no API key |
| `!lurk` | — | Acknowledges a viewer entering lurk mode. | None |
| `!unlurk` | `!back` | Welcomes a viewer back from lurk mode. | None |

Stream status is cached for 30 seconds, channel information for one minute, schedules for five minutes, and Seattle weather for ten minutes. Provider failures produce a short chat-safe fallback instead of triggering a workflow or exposing an HTTP error.

## Useful commands that need setup

| Proposed command | What it needs |
| --- | --- |
| `!discord`, `!socials`, `!youtube` | Operator-configured URLs and corresponding Studio settings fields. No Twitch scope is required. |
| `!followage` | Broadcaster authorization with `moderator:read:followers`; the bot must use the broadcaster token or be a moderator. |
| `!so @channel` | Bot moderator status, `moderator:manage:shoutouts`, target parsing, and Twitch's shoutout cooldown handling. |
| `!clip` | A clip-creation authorization scope, live/offline error handling, and a way to return the finished clip URL. |
| `!quote`, `!addquote` | A persistent quote database plus moderator-only add/remove commands and backup/export controls. |
| `!points`, `!rank` | A Tempest loyalty database or an external loyalty provider; Twitch Channel Points balances are not exposed as a general viewer-balance API. |

Privileged commands should remain home-channel-only unless the operator deliberately enables **Allow from Shared Chat**. Shared Chat access never imports moderator, subscriber, or broadcaster permissions from a collaborator's channel.
