# Tempest interaction render contract

Interaction render contract version: `1.0`

Transport remains Tempest Studio / Broadcast Bridge protocol `1.0`. This contract is additive to the 1.4.5 capabilities.

## Ownership

Studio owns the interaction catalog, Twitch/Kick verification, access locks, cooldowns, queue policy, counters, approved assets, safety decisions, and audit history. It sends only approved render instances. Broadcast owns source lookup, horizontal/vertical canvas mapping, scene-item transforms and visibility, source activation, fallback expiry, state restoration, and final audio/video output.

## Discovery

Broadcast advertises `broadcast.interaction.show`, `broadcast.interaction.update`, and `broadcast.interaction.clear`. Its hello payload includes `interactionRenderContractVersion: "1.0"`. `broadcast.status.interactionRender` describes orientations, fit modes, normalized top-left coordinates, maximum duration, active instances, and `audioPolicy: "source-native-single-path"`.

## Identity and lifecycle

Every activation uses a unique `payload.arguments.instanceId` for show, update, and clear. Broadcast falls back to `payload.runId/payload.actionId`, then the Bridge message ID. Commands are idempotent under the Bridge command key. A repeated clear succeeds as already cleared.

### Show

Topic: `broadcast.interaction.show`

```json
{
  "payload": {
    "runId": "run-123",
    "actionId": "render-1",
    "phase": "show",
    "lease": { "durationMs": 5000 },
    "arguments": {
      "instanceId": "activation-456",
      "durationMs": 5000,
      "renderTargets": {
        "horizontal": {
          "sourceName": "Tempest Viewer Interaction",
          "placement": { "x": 0.68, "y": 0.08, "width": 0.25, "height": 0.28 },
          "fit": "contain"
        },
        "vertical": {
          "sourceName": "Tempest Viewer Interaction Vertical",
          "placement": { "x": 0.12, "y": 0.10, "width": 0.76, "height": 0.32 },
          "fit": "contain"
        }
      }
    }
  }
}
```

Horizontal resolves against the current program scene. Vertical resolves against that scene's linked selected portrait canvas. A failed multi-target show rolls back every target touched by that command.

Placement uses normalized top-left coordinates. `x`, `y`, `width`, and `height` are required together, remain inside `0..1`, and require top-level scene items. Omitting placement keeps the operator-authored transform. Fit is `contain` (default), `cover`, or `stretch`; optional rotation is between -360 and 360 degrees.

`restartMedia` defaults to false. When true, Broadcast restarts a controllable media source at most once per show, even if both targets share it. Browser sources are never refreshed. Duration is clamped to 250–300000 ms and Broadcast clears expired instances locally. Top-level `sourceName`, `placement`, and `restartMedia` remain a horizontal-only compatibility alias.

### Update

Topic: `broadcast.interaction.update`

Update accepts the same instance ID and a subset of active targets. It can change placement, fit, rotation, or duration, but cannot replace a source. Studio sends a monotonically increasing string or numeric `arguments.revision` for successive updates.

### Clear

Topic: `broadcast.interaction.clear`

Clear uses the same instance ID. Broadcast cancels fallback expiry and restores every target's exact prior transform and visibility.

## Audio

Interaction audio is source-native and single-path. When Studio uses Web Audio in its Browser Source, it does not also dispatch `broadcast.audio.play`. Broadcast does not synthesize a duplicate cue, refresh a browser source, or alter operator-selected monitoring. The legacy `broadcast.audio.play` path is used only when the interaction explicitly names a separate Broadcast audio source. A vertical Browser Source is silent so only the intended horizontal source contributes program audio.
