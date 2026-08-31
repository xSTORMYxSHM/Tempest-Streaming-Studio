# Privacy and local-data boundary

Tempest Streaming Studio is local-first. Its authenticated control service, Browser Sources, alert media, queue, playback history, configuration, and backups remain on the user's computer unless the user exports or shares a file.

## Network requests

- Twitch OAuth, EventSub, Helix, chat, and Extension relay traffic occurs only after Twitch is configured and connected.
- GIPHY requests occur only after an API key is saved with Windows encryption and the user performs a search. Selected results are downloaded into local Studio media storage.
- National Weather Service requests occur only when a U.S. weather location is configured and a command using Local Weather is invoked.
- AzuraCast requests occur only when a Now Playing provider is configured and its status or command is used.
- Updater-enabled Studio releases request public release metadata from the official GitHub repository shortly after launch, every six hours while running, and when the user selects **Check for Updates**. No Twitch credentials, Studio settings, diagnostics, or streamer data are included. Update installers download only after the user approves them.
- Studio has no crash-reporting or analytics service and does not automatically upload diagnostics.

## Public Twitch Extension service

Pairing the public Twitch Extension is optional. During pairing, Studio sends the broadcaster's current Twitch OAuth access token to the Tempest Extension Backend Service over HTTPS. The service sends that token to Twitch's validation endpoint to verify the broadcaster account and approved application, then discards it without storing it.

The hosted service stores the broadcaster's numeric Twitch channel ID and login, a random installation ID, a one-way hash of the issued relay credential, pairing/update timestamps, and the viewer-safe signal catalog published by Studio. The catalog contains labels, identifiers, timing, and display colors only; it does not contain local media, file paths, OAuth tokens, or application credentials. Selecting **Revoke Installation** in Studio deletes the hosted installation record and its catalog.

Twitch-signed viewer JWTs, opaque viewer identifiers, and request identifiers are processed to authenticate, rate-limit, and deduplicate interactions. They are held in bounded service memory for the active request/replay window and are not written to the installation database. The Extension has no Bits or payment flow.

## Credentials

Broadcaster OAuth tokens, chatbot OAuth tokens, local Twitch Extension secrets, hosted Extension relay credentials, and the GIPHY API key are encrypted using the operating system's protected storage. They are excluded from Studio backups, Alert Packs, and diagnostics exports. The hosted service stores only the relay credential's SHA-256 hash.

## Exported files

Alert Packs can contain alert HTML, CSS, JavaScript, and embedded media. Import only packs from trusted creators. Studio verifies embedded media hashes and warns before importing custom code.

Studio backups can contain channel commands, workflows, visual designs, provider URLs, and alert media. Diagnostics reports exclude credentials, account identities, viewer details, and full local file paths, but users should still inspect reports before sharing them publicly.

## Privacy Shield while streaming

Privacy Shield is enabled by default. Its in-app masking layer replaces streamer-sensitive values with fixed `HIDDEN` blocks, including Twitch and chatbot identities, activation codes, client/channel IDs, channel-point mappings, weather coordinates, station/provider settings, local service endpoints, and Twitch Alert, Interaction Alert, Twitch Experiences, Chat Overlay, and Emote Wall Browser Source URLs. The quick top-bar control toggles masking; Settings exposes the complete controls.

Third-party Emote Wall providers are disabled by default. Enabling 7TV, BetterTTV, or FrankerFaceZ authorizes Studio to send the broadcaster's public numeric Twitch channel ID to that provider to resolve channel emotes. Studio validates provider hosts and proxies approved image bytes through its loopback-only Bridge; the Broadcast browser source does not connect directly to those provider CDNs.

On Windows, Studio also requests operating-system capture protection for the main Studio window and isolated Twitch sign-in windows. Capture exclusion depends on the capture method and Windows compositor support, so it is not a substitute for the masking layer. A full-display capture may still include the Studio window, but sensitive fields remain masked while Privacy Shield is active.

AutoMod allowlists and blocked-term lists are local configuration and are masked in Studio while Privacy Shield is active. They are included in Studio backups but excluded from redacted diagnostics.
