# Tempest API 1.0

## Endpoints

The default Bridge binds to `127.0.0.1:4765`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Public service readiness and registry counts |
| GET/POST | `/v1/applications` | List or register application manifests |
| DELETE | `/v1/applications/{id}` | Remove an application registration |
| GET/POST | `/v1/assets` | List or register asset manifests |
| DELETE | `/v1/assets/{id}` | Remove an asset registration |
| GET/POST | `/v1/sound-alerts` | List the Studio-owned free alert catalog or create a custom Interaction Alert |
| POST | `/v1/sound-alerts/{id}` | Update enable state, duration, cooldowns, volume, or local audio URI |
| DELETE | `/v1/sound-alerts/{id}` | Delete a custom Interaction Alert; bundled entries are protected |
| POST | `/v1/sound-alerts/{id}/trigger` | Resolve and trigger a catalog alert through the performance workflow |
| GET | `/v1/alert-queue` | Inspect the active alert and bounded FIFO backlog shared by live Twitch and Interaction Alerts |
| POST | `/v1/alert-queue/clear` | Remove waiting alerts without interrupting the active alert |
| GET/POST | `/v1/visual-alerts/twitch` | List Twitch Alert presets or create one for an unmapped normalized event |
| POST | `/v1/visual-alerts/twitch/{id}` | Update a Twitch Alert's enablement, media, timing, volume, accent, or validated advanced design object |
| DELETE | `/v1/visual-alerts/twitch/{id}` | Delete a custom Twitch Alert; bundled presets are protected |
| GET/POST | `/v1/workflows` | List or register workflow definitions |
| DELETE | `/v1/workflows/{id}` | Remove a workflow definition |
| POST | `/v1/workflows/{id}/trigger` | Trigger a specific workflow |
| POST | `/v1/interactions` | Route a normalized interaction by action |
| GET | `/v1/runs` | Inspect recent and active workflow runs |
| GET | `/v1/events` | Inspect the orchestration event log |
| GET | `/v1/safety` | Read armed state and active-run count |
| POST | `/v1/safety/stop` | Release active actions and disarm interactions |
| POST | `/v1/safety/arm` | Re-arm viewer interactions |
| GET | `/v1/integrations/twitch` | Inspect Studio-owned OAuth/connection state and canonical topics |
| POST | `/v1/integrations/twitch/configuration` | Save public client ID, requested scopes, and reward/action mappings |
| POST | `/v1/integrations/twitch/oauth/device` | Start a Twitch Device Code authorization |
| POST | `/v1/integrations/twitch/oauth/poll` | Poll the active Device Code authorization at Twitch's interval |
| POST | `/v1/integrations/twitch/oauth/validate` | Validate the stored access token and reactively refresh after a 401 |
| DELETE | `/v1/integrations/twitch/oauth` | Revoke the access token and remove encrypted local credentials |
| POST | `/v1/integrations/twitch/events` | Validate, deduplicate, publish, and optionally route a canonical Twitch event |
| GET | `/v1/connections` | Inspect live WebSocket clients |
| WebSocket | `/v1/socket` | Discovery, events, commands, and responses |

All `/v1` and WebSocket requests require the Bridge token. HTTP clients use `X-Tempest-Token` or `Authorization: Bearer`. WebSocket clients may use `?token=` until an SDK-managed subprotocol is introduced.

## WebSocket lifecycle

1. Connect to `/v1/socket` with authentication.
2. Receive a `welcome` message and assigned client ID.
3. Send `hello` with `{ "applicationId": "..." }`.
4. Send `subscribe` with `{ "topics": ["transport.*", "audio.features"] }`.
5. Publish events or send targeted commands using versioned envelopes.
6. Send periodic `heartbeat` messages and expect correlated responses.

Topic subscriptions support exact names, `namespace.*`, or `*`.

Workflow commands use the action capability as their topic, the target application ID as their target, and the workflow run ID as their correlation ID. The payload includes `phase` (`activate` or `release`), the workflow/action IDs, arguments, and lease data. Connected applications should make repeated activation or release messages idempotent.

## Initial topic namespaces

- `system.*` — connection, registry, compatibility, and health events
- `asset.*` — asset creation, update, dependency, and availability
- `audio.features` — normalized analysis frames, not PCM audio
- `transport.*` — playback state, position, tempo, and synchronization
- `scene.*` — scene selection, parameters, and change notifications
- `performance.*` — show state, cues, and blackout
- `broadcast.*` — scenes, overlay state, output routes, and safety
- `output.*` — media endpoint availability and status
- `workflow.*` — run, action, completion, and restore events

## Canonical Twitch topics

Raw EventSub, chat, and Extension payloads terminate in Studio. Downstream clients receive only these versioned Tempest topics:

| Topic | Required payload fields | Workflow behavior |
| --- | --- | --- |
| `viewer.interaction.requested` | `action`; optional `input` | Routes a free Extension interaction by action |
| `viewer.chat.message` | `messageId`, `text` | Observation; a Studio rule may translate commands later |
| `viewer.reward.redeemed` | `redemptionId`, `rewardId`, `rewardTitle`; optional `rewardCost`, `input`, `action` | Routes only when Studio assigned an action |
| `viewer.followed` | Event-specific metadata | Observation |
| `viewer.subscription.started` | `tier`, `isGift`; optional `cumulativeMonths` | Observation |
| `viewer.cheer.received` | `bits`; optional `message`, operator-assigned `action` | Observation by default; routes only to an explicit `twitch.cheer` workflow |
| `viewer.raid.received` | `fromBroadcasterId`, `fromBroadcasterName`, `viewers` | Observation |
| `channel.stream.online` / `channel.stream.offline` | Event-specific metadata | Observation |
| `channel.moderation.action` | Event-specific moderation data | Observation |
| `channel.poll.updated` | Poll state | Observation |
| `channel.prediction.updated` | Prediction state | Observation |
| `channel.hype-train.updated` | Hype Train state | Observation |

All canonical events also require `schemaVersion`, the upstream `id`, `occurredAt`, `source: "twitch"`, a channel identity, an optional viewer identity, and a payload object. The same event ID is accepted once within the gateway replay window. Routed workflows retain it as `triggerEventId` for an additional idempotency check.

The Extension selects a stable catalog ID such as `sound-alert.whistle`. Studio—not the viewer—expands that selection into the internal `tempest.sound-alert.performance` payload. Its payload requires `cue` and `durationMs`, and may carry `alertId`, `intensity`, `eventType`, `name`, `circuit`, `accent`, `effect`, `strength`, and `dedupeId`. Studio forwards these fields to the Warudo and Broadcast adapters and uses `durationMs` as the effective lease, capped by the workflow's declared maximum. Local audio playback uses the catalog's file URI inside Studio and never enters the Bridge command payload.

## Normalized interactions

An integration posts an internal action rather than a Twitch-, BotRix-, or platform-specific event:

```json
{
  "action": "tempest.blackhole",
  "source": "twitch.extension",
  "viewerId": "opaque-viewer-id",
  "viewerName": "ExampleViewer",
  "payload": {}
}
```

`simulateMissing` and `bypassCooldown` are Studio simulator aids. Cooldown bypass is honored only when `source` is `studio.simulator`; public integrations must never expose it.

## Compatibility

Protocol versions use `major.minor`. Major changes may break compatibility. Minor versions only add optional fields, routes, topics, or capabilities. Asset schemas carry their own versions and require migration adapters when a producer changes a stored format.
