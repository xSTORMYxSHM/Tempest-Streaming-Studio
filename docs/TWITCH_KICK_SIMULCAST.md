# Twitch + Kick Production Simulcast

Tempest uses one coordinated production controller while keeping responsibility clear: Studio provides the operator surface and authenticated local API; Tempest Broadcast owns stream services, credentials, encoders, outputs, reconnection, and telemetry.

## Output topology

- Twitch is the primary output. Twitch Enhanced Broadcasting carries the horizontal program plus the prepared Dual Format vertical canvas.
- Kick receives the horizontal program through a separate RTMP/RTMPS output.
- The Kick output shares the already-running horizontal video and audio encoders. It adds upload traffic but does not request another GPU encoder session.
- Twitch and Kick chat remain unified in Studio. Twitch Stream Together Shared Chat remains embedded in the Collaboration Center.

## Setup

1. Complete the **Dual Format** readiness checklist.
2. In Broadcast, select Twitch as the primary streaming service and confirm Enhanced Broadcasting is enabled.
3. In Studio, open **Go Live** and paste the ingest URL and stream key shown by the Kick creator dashboard.
4. Enter measured sustained upload capacity in Kbps. Studio reserves 20% above the estimated Twitch + Kick output budget.
5. Optionally enable coordinated local recording, then save the output setup.
6. Run **Production preflight** while off-air. A passing result is valid for four hours and is invalidated by a Broadcast restart or an output/Dual Format configuration change.
7. Complete the operator rehearsal checklist in Studio. Its selections are session-only and disappear when that Studio window closes.

The stream key crosses only the authenticated loopback Bridge. Broadcast encrypts it with Windows Data Protection for the current Windows user. Studio clears the input after submission, never persists the key, and never returns it through status or diagnostics.

## Live behavior

**Go Live: Twitch + Kick** starts Twitch first. Broadcast waits for the primary encoders to become active, then attaches the Kick output. Each destination reports active state, bytes, dropped frames, congestion, and its own last error.

- If Kick fails, Twitch stays live and Studio reports a degraded live state.
- **Retry Kick** recreates only the Kick output against the active Twitch horizontal encoders. It does not interrupt Twitch.
- **Stop Kick Only** leaves Twitch live.
- Stopping Twitch also stops the coordinated Kick output.
- **Emergency Stop All Outputs** force-stops Kick, requests Twitch stop, and stops a recording only when the simulcast controller started it.
- Broadcast uses the profile's reconnect count and delay for Kick.

## Production preflight

Studio's **Run Preflight** command is intentionally local and off-air. Broadcast verifies the current Twitch service, Dual Format setup, encrypted Kick credential readability, RTMP output availability, and configured upload budget. It does not connect to Twitch or Kick and therefore cannot prove that platform credentials will be accepted.

After the automatic result passes, Studio requires session-only operator sign-off for stream information, platform dashboards, a physical mobile viewer, monitored audio, recording/disk readiness, and recovery controls. Restarting Broadcast or changing output configuration invalidates the automatic result; restarting the Studio window clears the manual sign-off.

- Run an unlisted or restricted destination check when the platforms support it; do not expose the stream key.
- Verify Twitch horizontal and vertical playback in Stream Manager and on a real phone.
- Verify Kick playback and audio on a separate device.
- Confirm sustained upload capacity has at least 20% reserve over Studio's estimate.
- Confirm the local recording path and free disk space if coordinated recording is enabled.
- Confirm Twitch and Kick chat messages and replies remain platform-local in Studio.

The readiness estimate is a guardrail, not a bandwidth test. Enhanced Broadcasting can negotiate its own rendition budget, so Broadcast health and platform dashboards remain authoritative while live.

## Degraded-live recovery

If Twitch remains live and Kick is offline, inspect the Kick error, confirm the creator dashboard is not reporting a platform incident, then use **Retry Kick**. Continue monitoring Twitch throughout the attempt. Use **Stop Kick Only** if recovery is unsafe or repeatedly fails, and use **Emergency Stop All Outputs** only when both destinations must end.

## Studio live-operations supervisor

The Go Live page starts a local session clock when Broadcast first reports Twitch live. Studio displays the age of the latest Broadcast status, classifies healthy, delayed, degraded, and high-congestion conditions, and records destination transitions and increases in dropped frames in a session-only incident timeline.

The supervisor observes the status already produced by Broadcast; it does not inspect frames, render video, alter encoders, or own either output. Its timeline is kept only in the current Studio window and clears when that window closes. Twitch Stream Manager and the Kick creator dashboard remain authoritative for platform-side delivery.
