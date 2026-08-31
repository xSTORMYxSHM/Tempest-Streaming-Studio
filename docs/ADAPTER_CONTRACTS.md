# Avatar and Tempest Broadcast Adapter Contracts

No adapter owns interaction-facing Twitch ingestion. Studio owns interaction OAuth, EventSub, chat, rewards, Extension intake, normalization, dedupe, cooldowns, and routing. Adapters connect to the authenticated localhost Tempest Bridge and act on targeted commands. Tempest Broadcast still owns OBS/Twitch stream-service authentication, streaming credentials, and Stream Information because those control the outgoing broadcast.

## Shared command envelope

Workflow commands use the activation capability as `topic`, the workflow run ID as `correlationId`, and this payload. If an action declares `releaseCapability`, its release command uses that capability as the topic instead:

```json
{
  "workflowId": "com.tempestmainframe.workflow.blackhole",
  "runId": "uuid",
  "actionId": "broadcast-reaction",
  "phase": "activate",
  "arguments": { "reactionId": "tempest-blackhole" },
  "lease": { "durationMs": 15000, "fadeInMs": 450, "fadeOutMs": 1100 }
}
```

`phase` is `activate` or `release`. The tuple `(runId, actionId, phase)` is idempotent. Adapters must keep enough prior state to restore the exact affected properties, and must install a local fallback expiry from the lease in case Studio disconnects before release.

## Tempest Broadcast

Application ID: `com.tempestmainframe.tempest-broadcast`

Required capabilities for the bundled Black Hole Event:

- `broadcast.reaction.trigger` — call the OBS-side `TriggerReactionEvent` with the normalized event/reaction fields.
- `broadcast.reaction.clear` — call `ClearReactionEvent` for the same run/action when the lease expires or Emergency Restore runs.
- `broadcast.audio.play` — play the named one-shot cue on the requested bus. This action has no release phase.
- `broadcast.visual.show` — show the named source in Broadcast's current scene and restart it when it is controllable media.
- `broadcast.visual.hide` — hide the visual source for the same workflow action when its lease ends.
- `broadcast.status` — publish adapter/OBS readiness and output state.

Exact Broadcast compatibility changes:

1. Remove or disable interaction-facing Twitch OAuth, EventSub, chat, channel-point, Sound Alerts, cheer, and subscription ingestion. Keep OBS/Twitch stream-service authentication and Stream Information inside Broadcast.
2. Register the application manifest and connect to `/v1/socket` with the Studio-issued Bridge token.
3. Send `hello` as `com.tempestmainframe.tempest-broadcast` and subscribe to its command topics plus required system health topics.
4. Advertise `broadcast.reaction.trigger`, `broadcast.reaction.clear`, `broadcast.audio.play`, `broadcast.visual.show`, `broadcast.visual.hide`, and `broadcast.status`.
5. Add a command adapter that calls `TriggerReactionEvent(eventType, name, circuit, accent, effect, strength, durationMs, dedupeId, runId)` for trigger and `ClearReactionEvent(dedupeId, runId)` for clear.
6. Make repeated trigger/clear calls safe. Track overrides by `runId` and `actionId`, restore only the filters/scenes/overlays that reaction changed, and add a lease-expiry fallback.
7. Return command responses correlated to the workflow run and publish health/failure events. A missing OBS source should degrade that action rather than crash the adapter.
8. Keep Spout, NDI, textures, encoded video, and continuous audio off the JSON Bridge.

Broadcast may retain low-level filter/overlay commands for operator tooling, but cross-suite viewer workflows should prefer the reaction trigger/clear pair so OBS implementation details stay inside Broadcast.

## Warudo

Application ID: `com.tempestmainframe.warudo`

Required capability:

- `avatar.reaction.apply` — activate a named reaction/preset and release it by workflow run. The Black Hole Event supplies `reactionId: "tempest-blackhole"` and `expression: "gravity-shock"`.
- `avatar.performance.apply` — play a Sound Alert performance using `cue`, `durationMs`, and optional `intensity`, then restore it on release.

The Warudo adapter must connect to the Bridge, advertise this capability, map activate/release phases to Warudo graph or plugin calls, make them idempotent, preserve the prior expression/state, and apply a local lease expiry. It receives no Twitch token or raw Twitch payload.

The supplied Sound Alert Dancing blueprint has 13 song branches with explicit 8–58 second durations. Studio now exposes those branches as stable `sound-alert.*` catalog IDs. The Warudo adapter maps each ID to its existing animation sequence, including the sitting reset and Crab Rave lighting restoration. `Interactions_Twitch` currently recognizes follows, subscriptions, Bits, redeems, props, stickers, and liquid interactions; move that platform classification into Studio and reduce the Warudo side to `cue + durationMs + intensity`. Preserve the blueprint's exact duration and use the upstream event ID as `dedupeId`.

The supplied Playground node exposes local **Test Activate** and **Test Release** triggers, live match diagnostics, and exact/comma-separated/trailing-wildcard cue filters. Use those controls to validate a replacement animation locally before connecting it to a catalog cue. A missing or incompatible animation asset is a blueprint configuration failure; it must not be mistaken for a Bridge or Twitch delivery failure.

## VTube Studio

Application ID: `com.tempestmainframe.vtube-studio`

Required capability:

- `avatar.performance.apply` — trigger the Interaction Alert's assigned VTube Studio hotkey on activation. VTube Studio owns hotkey duration and auto-deactivation, so release acknowledges completion without triggering the hotkey a second time.

The desktop app is the VTube Studio plugin client and connects only to the local VTube Studio WebSocket API. It requests permission only after the user selects **Authorize in VTube Studio**, stores the returned token with Windows encryption, reauthenticates locally on later launches, and lists hotkeys from the currently loaded Live2D model. It never requires or installs a separate VTube Studio DLL or script.
