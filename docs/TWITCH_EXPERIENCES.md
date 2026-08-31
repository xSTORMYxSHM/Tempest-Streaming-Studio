# Twitch Experiences

Tempest Streaming Studio provides one loopback-only Browser Source at `http://127.0.0.1:4765/twitch-experiences` for three longer-running Twitch presentations:

- **Hype Train Takeover** displays a full-canvas level and progress sequence from Hype Train begin, progress, and end notifications.
- **Raid Portal** displays the incoming broadcaster and viewer count without delaying the existing raid alert, chatbot welcome, or queued official shoutout.
- **Goal Overlay** displays the active goal description, current amount, target, and progress.

Add the source once using the active base-canvas dimensions from Guided Setup. The overlay is transparent while no experience is active. It contains no Twitch token or authenticated API access and accepts browser and event-stream connections only from the local computer.

## Authorization

Studio opens a broadcaster EventSub WebSocket and creates `channel.raid`, Hype Train v2, and channel-goal subscriptions. Hype Train uses `channel:read:hype_train`; Goals uses `channel:read:goals`. Installations authorized before Goal Overlay was added must disconnect and reconnect the broadcaster once. Studio displays each feature's live subscription state on the Twitch Alerts page.

The three experiences can be enabled independently. Their colors and Raid Portal duration are saved in `twitch-experiences.json`, included in Studio backups, and excluded from the regular alert FIFO because they represent sustained channel state rather than one-shot alert playback. Preview buttons create local simulation events and never post to Twitch.
