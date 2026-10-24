# Tempest Streaming Studio 1.7.4 release notes

Tempest Streaming Studio 1.7.4 makes interactive features safer to adopt, hardens Unified Stage recovery, connects alert audio to Stormframe, and makes the growing Studio easier to navigate.

## Navigation

- Added a global **Find a tool** launcher in the title bar. Press `Ctrl+K`, type a feature, and press Enter to open it.
- Searches open nested Chatbot pages such as Polls, Commands, Automation, Moderation, and Setup directly.
- Searches also open the requested Interactive Stage workspace directly.
- Replaced ambiguous tab names such as Guests, Games, and Companions with specific feature names.

## Safer interactive defaults

- Automatic viewer avatars, the stream pet, and 3D Dice are disabled by default for new or untouched configurations.
- Their Twitch companion placement starts as neither Mainframe nor Streaming. Streamers opt into the viewer surface they actually want.
- Existing explicitly saved settings and placement choices remain authoritative.
- Destinationless actions are omitted before catalog publication, preventing one intentionally hidden action from rejecting unrelated live Extension data.

## Unified Stage reliability

- The Emote Wall child renderer starts hidden and becomes visible only after a validated renderer heartbeat.
- If that renderer stalls, Unified Stage hides and remounts only Emote Wall instead of allowing a failed full-canvas layer to obscure the stream.
- Recovery remains local and does not restart the other Stage modules.

## Stormframe AudioLink

- Twitch Alerts and Viewer Interactions can optionally play their assigned MP3, WAV, or OGG through Stormframe AudioLink.
- Studio advertises the AudioLink capability through the existing application contract and releases playback with the alert lifecycle.
- Stormframe, Warudo, VTube Studio, and other avatar applications remain optional; no Live2D development files are bundled into Studio.

## Twitch companion Extensions

- Tempest Mainframe `0.2.1` adds a complete broadcaster configuration and reviewer walkthrough around the Studio-controlled panel.
- Tempest Streaming `0.1.1` adds Twitch-hosted choices for deck position, initial collapsed state, and action-count visibility while Studio remains authoritative for action routing and safety.
- Reviewer README/PDF documents stay beside the upload archives and are intentionally excluded from Twitch Asset Hosting ZIPs.
- Installing Studio does not publish either Twitch bundle. Each Extension ZIP still requires its own Twitch Developer Console upload and review.

## Compatibility

- The Studio/Broadcast wire protocol remains `1.0` and remains compatible with Tempest Broadcast 1.5.0.
- Existing Studio settings, managed media, alert packs, Stage Actor packs, and Twitch pairings remain compatible.
- The Tempest Signal/Railway runtime contract is unchanged; this release does not require a new Railway service deployment.
