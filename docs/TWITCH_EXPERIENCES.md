# Twitch Experiences

Tempest Streaming Studio provides one loopback-only Browser Source at `http://127.0.0.1:4765/twitch-experiences` for three longer-running Twitch presentations:

- **Hype Train Takeover** displays a full-canvas level and progress sequence from Hype Train begin, progress, and end notifications.
- **Raid Portal** displays the incoming broadcaster and viewer count without delaying the existing raid alert, chatbot welcome, or queued official shoutout.
- **Goal Overlay** displays the active goal description, current amount, target, and progress.

Add the source once using the active base-canvas dimensions from Guided Setup. The overlay is transparent while no experience is active. It contains no Twitch token or authenticated API access and accepts browser and event-stream connections only from the local computer.

## Authorization

Studio opens a broadcaster EventSub WebSocket and creates `channel.raid`, Hype Train v2, and channel-goal subscriptions. Hype Train uses `channel:read:hype_train`; Goals uses `channel:read:goals`. Installations authorized before Goal Overlay was added must disconnect and reconnect the broadcaster once. Studio displays each feature's live subscription state on the Twitch Alerts page.

The three experiences can be enabled independently. Their colors and Raid Portal duration are saved in `twitch-experiences.json`, included in Studio backups, and excluded from the regular alert FIFO because they represent sustained channel state rather than one-shot alert playback. Preview buttons create local simulation events and never post to Twitch.

## Per-experience design

Hype Train, Raid Portal, and Goal Overlay each have independent design controls. Choose the full Tempest presentation, a streamlined Minimal presentation, or a Mainframe style. Raid Portal defaults to **Mainframe Breach**, which presents the incoming channel as an animated security-perimeter override; the original circular **Tempest Portal** remains available from the Style menu.

Each experience can also use one local PNG, JPG, GIF, WebP, AVIF, MP4, or WebM file as a background or foreground layer. Fit and opacity are configurable. Video is always muted because Twitch Experiences is a visual source. Assigned media is served only from the local Bridge and is embedded into portable Studio backups.

Advanced creators can add up to 24,000 characters each of HTML, CSS, and JavaScript per experience. Custom code runs only in the credential-free local Browser Source. JavaScript receives `data`, normalized `variables`, and stable `elements`; use the variable list shown beside each editor. HTML supports variable placeholders such as `{broadcaster}`, `{viewers}`, `{level}`, and `{percent}`. Only paste custom code from creators you trust.
