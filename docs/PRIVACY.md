# Privacy and local-data boundary

Tempest Streaming Studio is local-first. Its authenticated control service, Browser Sources, alert media, queue, playback history, configuration, and backups remain on the user's computer unless the user exports or shares a file.

## Network requests

- Twitch OAuth, EventSub, Helix, chat, and Extension relay traffic occurs only after Twitch is configured and connected.
- GIPHY requests occur only after an API key is saved with Windows encryption and the user performs a search. Selected results are downloaded into local Studio media storage.
- National Weather Service requests occur only when a U.S. weather location is configured and a command using Local Weather is invoked.
- AzuraCast requests occur only when a Now Playing provider is configured and its status or command is used.
- Studio 0.21.0 has no crash-reporting or analytics service and does not automatically upload diagnostics.

## Public Twitch Extension service

Pairing the public Twitch Extension is optional. During pairing, Studio sends the broadcaster's current Twitch OAuth access token to the Tempest Extension Backend Service over HTTPS. The service sends that token to Twitch's validation endpoint to verify the broadcaster account and approved application, then discards it without storing it.

The hosted service stores the broadcaster's numeric Twitch channel ID and login, a random installation ID, a one-way hash of the issued relay credential, pairing/update timestamps, and the viewer-safe signal catalog published by Studio. The catalog contains labels, identifiers, timing, and display colors only; it does not contain local media, file paths, OAuth tokens, or application credentials. Selecting **Revoke Installation** in Studio deletes the hosted installation record and its catalog.

Twitch-signed viewer JWTs, opaque viewer identifiers, and request identifiers are processed to authenticate, rate-limit, and deduplicate interactions. They are held in bounded service memory for the active request/replay window and are not written to the installation database. The Extension has no Bits or payment flow.

## Credentials

Broadcaster OAuth tokens, chatbot OAuth tokens, local Twitch Extension secrets, hosted Extension relay credentials, and the GIPHY API key are encrypted using the operating system's protected storage. They are excluded from Studio backups, Alert Packs, and diagnostics exports. The hosted service stores only the relay credential's SHA-256 hash.

## Exported files

Alert Packs can contain alert HTML, CSS, JavaScript, and embedded media. Import only packs from trusted creators. Studio verifies embedded media hashes and warns before importing custom code.

Studio backups can contain channel commands, workflows, visual designs, provider URLs, and alert media. Diagnostics reports exclude credentials, account identities, viewer details, and full local file paths, but users should still inspect reports before sharing them publicly.
