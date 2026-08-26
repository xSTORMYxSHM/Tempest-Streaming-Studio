# Studio Sound Alerts

Tempest Streaming Studio replaces the external Sound Alerts dependency with a free, cooldown-governed alert catalog. Studio owns alert availability, local audio and visual assignment, playback, viewer/global cooldowns, event dedupe, workflow routing, and Emergency Restore. Warudo remains the optional avatar-performance executor, and connected broadcast software can receive broadcast reactions.

## Twitch Extension shape

The first Extension version should enable **Video - Component** and **Mobile**. The component keeps the alert drawer beside the stream without requiring viewers to scroll. Fullscreen video is unnecessary because the resulting visual reaction is rendered by Tempest Broadcast, not by the Extension iframe.

The Extension API Client ID is public identification and may appear in front-end configuration. It is distinct from Studio's Twitch OAuth application Client ID. The Extension shared secret is private and must exist only in the hosted Extension Backend Service (EBS) secret store.

The production request path is:

1. The Video Component loads Twitch's Extension Helper.
2. `onAuthorized` supplies the current viewer JWT, opaque viewer ID, channel ID, and Extension Client ID.
3. The component posts `{ alertId }` plus the current JWT to the HTTPS EBS.
4. The EBS verifies the JWT signature, expiry, channel, role, and request rate. Anonymous viewers may be rejected by operator policy.
5. Studio maintains an authenticated outbound connection to the EBS. The EBS forwards the accepted request over that connection; the local Bridge is never exposed to the public internet.
6. Studio resolves the catalog entry, applies dedupe and cooldown policy, sends its assigned audio and visual through the local Browser Source, and starts the reversible Warudo/Broadcast workflow. A separately configured OBS audio source overrides Browser Source audio; Warudo receives the avatar cue.

The EBS and outbound relay are implemented in `services/twitch-ebs` and `services/tempest-bridge/src/extension-relay.ts`. Deployment requires the Twitch Extension shared secret, an allowlisted channel ID, a relay token, and a public HTTPS/WebSocket host; see `TWITCH_EBS.md`.

## Public-safe starter catalog

| Alert ID | Warudo performance | Duration |
| --- | --- | ---: |
| `sound-alert.hype-pulse` | Hype Pulse | 8s |
| `sound-alert.dance-break` | Dance Break | 15s |
| `sound-alert.celebration` | Celebration | 10s |
| `sound-alert.dramatic-entrance` | Dramatic Entrance | 12s |
| `sound-alert.victory-pose` | Victory Pose | 9s |
| `sound-alert.chaos-mode` | Chaos Mode | 20s |

All starter entries are permanently marked `free: true` and intentionally contain no copyrighted media or creator-specific avatar cue. Existing installations retain their current catalogs during upgrade. The **Interaction Alerts** page owns the starter routines and any alerts the streamer creates. Its cards mirror Twitch Alerts and open the same full designer for style, text, motion, media, timing, and exact X/Y placement and scale on the active Browser Source canvas. Each card also contains enablement, local audio and visual media, cooldowns, playback volume, visual duration, optional broadcast overrides, HUD effect (`pulse`, `glow`, `glitch`, `spectrum`, or `surge`), target circuit, strength, accent, and coordinated tests. Selecting **Use Warudo** reveals the cue and performance duration; clearing it removes the avatar action from that alert's workflow. Its GIPHY library downloads selected GIFs locally and assigns them to an interaction. Visual media supports PNG, JPG, GIF, WebP, AVIF, MP4, and WebM. Audio supports MP3, WAV, OGG, M4A, AAC, and FLAC. These assignments remain local: the loopback Browser Source fetches them from Studio rather than transferring file paths through the JSON Bridge.

The **Twitch Alerts** page owns follows, subscriptions, gift subscriptions, cheers/Bits, raids, and channel-point rewards. Every Twitch card keeps its sound, visual, duration, volume, accent, enablement, and preview controls together. **Customize Design** opens the full alert designer with:

- Tempest HUD, Minimal, Compact, Glass, Neon, and Cinematic presets.
- Five media/text dispositions, nine screen anchors with X/Y offsets, separate entrance/exit animations, and text animation.
- Headline, detail, and TTS templates using `{viewer}`, `{name}`, `{event}`, `{amount}`, `{message}`, `{reward}`, `{tier}`, `{months}`, and `{topic}`.
- Viewer-message visibility, font family/size/weight, alignment, two text colors, glow/shadow, letter spacing, and independent text offsets.
- Card width, background color/opacity, padding, border, corner radius, glow, media dimensions/fit/corners, and delayed media appearance.
- Independent text appearance/duration, sound delay, and TTS volume/rate/pitch.
- Locally scoped custom CSS for advanced styling. The Browser Source CSP blocks network loads and arbitrary JavaScript; custom CSS is applied with `textContent` and is cleared between alerts.

**Save & Preview** persists the complete design and immediately runs a representative local event through the real Browser Source renderer.

Use **New Interaction Alert** to add a locally persisted dance or routine with a generated namespaced ID and Warudo cue. Use **New Twitch Alert** to add a preset for another normalized Twitch event. Studio prevents duplicate IDs, duplicate Warudo cues, and duplicate Twitch event mappings. Bundled alerts can be disabled but not deleted; custom alerts expose a delete control that removes only the catalog entry, never its assigned media files.

## Local Alert Browser Sources

Studio serves two independent transparent alert canvases:

- **Interaction Alerts:** `http://127.0.0.1:4765/visual-alerts/interactions`
- **Twitch Alerts:** `http://127.0.0.1:4765/visual-alerts/twitch`

Add both Browser Sources using the **base canvas dimensions shown by Guided Setup** and enable **Control audio via OBS** on each. Studio defaults to 1920 by 1080, can follow a connected broadcaster's canvas automatically, and also supports QHD, ultrawide, and custom profiles. The broadcaster handles final output scaling. Keep both sources on the live mix. Keep the Twitch Alert source on the recording/VOD track, but remove the Interaction Alert source from the track used for YouTube uploads when viewer-selected music may receive a copyright claim. The original `/visual-alerts` address remains a compatibility alias for the Interaction Alert source.

Each URL is stable across its alert catalog, so Broadcast does not need one source per GIF, video, or audio file. The two sources have independent event connections, active cards, audio players, timers, and connection counts; a Twitch Alert cannot replace or stop an Interaction Alert, and vice versa.

## Shared Alert Queue

Live Twitch Alerts and Interaction Alerts enter one bounded first-in, first-out queue before any Browser Source audio, Broadcast reaction, or optional Warudo performance begins. Only one live alert owns the stage at a time. Studio waits for the longer of an Interaction Alert's performance and visual durations, then leaves a 500 ms transition gap before starting the next item. The backlog accepts up to 25 waiting alerts; additional requests are rejected with a clear queue-full response instead of growing without limit.

The Twitch Alerts and Interaction Alerts pages show the current item and waiting count. **Clear Waiting** removes the backlog without interrupting the alert already playing. **Emergency Restore** clears the active item and the complete backlog while also releasing workflows, stopping local fallback audio, and clearing both Browser Sources. Operator design previews remain immediate and outside the live queue so configuring an alert does not wait behind a long viewer interaction.

Each Twitch Alert uses the active base-canvas profile in the designer. Drag the alert to any X/Y position in the Browser Source, drag its lower-right handle to scale the complete alert from 25% to 200%, or enter exact percentage coordinates. Anchor presets remain available for quick placement, while pixel nudges and card width provide fine control. Because placement is stored as percentages, it remains aligned when the broadcaster scales the base canvas to the output resolution.

Each Browser Source opens its own local server-sent event connection to Studio. An accepted alert replaces only the current card in its matching source and plays its assigned image/GIF/video and audio at the saved volume. Interaction Alerts also include the viewer name and keep independent visual and performance durations. Studio reports each source's connection count and can preview or clear both outputs. Emergency Restore stops both Browser Source audio players and clears both cards immediately. When no Interaction Alert source is connected, Studio plays a local fallback copy for Interaction Alerts. These unauthenticated media routes accept loopback requests only and do not expose the authenticated Studio control API.

Accepted normalized Twitch events trigger Twitch Alert cards even when they do not start an interaction workflow; duplicate Twitch events do not replay an alert. Interaction Alerts remain the viewer-selected dance and performance catalog, and can coordinate audio, overlay media, Warudo, and Broadcast in one reversible run.

The GIPHY picker requires a GIPHY developer API key. Studio stores that key with Windows encryption, displays the required `Powered by GIPHY` attribution, limits searches to twelve PG-13 results, and downloads the selected GIF into Studio's local user-data directory. The stream overlay therefore reads the chosen media locally rather than depending on GIPHY during a broadcast.

## Internal trigger

The Extension-facing selection is an alert ID. Studio expands it into the internal `tempest.sound-alert.performance` payload only after catalog and cooldown validation:

```json
{
  "action": "tempest.sound-alert.performance",
  "alertId": "sound-alert.hype-pulse",
  "cue": "sound-alert.hype-pulse",
  "name": "Hype Pulse",
  "durationMs": 8000,
  "visualDurationMs": 6000,
  "eventType": "sound-alert",
  "circuit": "frame",
  "effect": "spectrum",
  "strength": 1.1,
  "accent": "#7CF0B2",
  "broadcastAudioSource": "Interaction Audio",
  "broadcastVisualSource": "Interaction Visual",
  "dedupeId": "upstream-event-id"
}
```

Emergency Restore releases Warudo and Broadcast leases, stops every Studio-owned local alert audio instance, clears the local visual overlay, and disarms new viewer requests.
