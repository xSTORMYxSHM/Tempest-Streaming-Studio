# Interaction Workflows

Workflows are declarative, versioned definitions stored by the Tempest Bridge. A workflow binds one normalized trigger action to one or more capability-addressed application actions.

## Safety model

- Viewer, effect, and global cooldowns are independent and enforced before a run starts.
- Concurrency groups prevent conflicting major events from overlapping.
- Temporary actions use leases and receive both an `activate` and a `release` command.
- Emergency Restore cancels scheduled actions, releases active actions, and disarms new interactions.
- Missing applications degrade a run instead of breaking applications that are present.
- The Studio simulator can simulate absent applications, but it still exercises the real scheduler, leases, run history, and event log.

## Black Hole Event

The bundled `com.tempestmainframe.workflow.blackhole` workflow handles `tempest.blackhole`. It coordinates:

1. A temporary Warudo `avatar.reaction.apply` command.
2. A Broadcast `broadcast.reaction.trigger` command whose adapter owns the OBS dim and overlay implementation, followed by `broadcast.reaction.clear` on release.
3. A Quartic Pulse black-hole fractal preset.
4. A Data Horizon gravitational-collapse visualization.
5. A one-shot impact sound through Tempest Broadcast.
6. Automatic release of every temporary action after fifteen seconds.

## Twitch boundary

The planned Twitch Extension is a free interaction surface. Its public Extension Backend Service verifies Twitch identity and authorization, applies abuse controls, and forwards a normalized action to the Studio user's secure ingress. Bits are not part of this interaction model. Channel points may become another normalized trigger source later, without changing any downstream application.

The localhost Bridge must not be exposed directly to the public internet. The future ingress component should use short-lived authenticated messages, replay protection, rate limits, and an explicit allowlist of actions.

Studio records Twitch cheers like other normalized observations, but no bundled workflow binds a cheer or Bits amount to an action. Free Extension interactions use `viewer.interaction.requested`. Optional channel-point mappings use `viewer.reward.redeemed`; their payload action is assigned by Studio configuration rather than trusted directly from Twitch reward text. If an operator has a legitimate Sound Alerts setup driven by Bits, they may explicitly register a `twitch.cheer` workflow and assign its action in Studio. Merely receiving a cheer never creates that mapping.

## Sound Alert Performance

The bundled `com.tempestmainframe.workflow.sound-alert-performance` workflow handles `tempest.sound-alert.performance`. It forwards the normalized cue, duration, intensity, styling, strength, dedupe identifier, and configured OBS source names. Warudo receives `avatar.performance.apply` only when that Interaction Alert has **Use Warudo** enabled. Broadcast receives the reaction lease, a one-shot `broadcast.audio.play`, and a `broadcast.visual.show` lease followed by `broadcast.visual.hide`. The interaction's `durationMs` becomes the effective lease, with a sixty-second workflow ceiling.

The existing Sound Alert Dancing blueprint contains 13 song branches whose explicit performance durations range from 8 to 58 seconds. Its adapter should emit the selected branch's cue and exact duration rather than making Studio guess from audio length. The generic workflow therefore covers all 13 branches without duplicating 13 orchestration definitions.
