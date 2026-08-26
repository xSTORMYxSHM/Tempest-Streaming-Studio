# Privacy and local-data boundary

Tempest Streaming Studio is local-first. Its authenticated control service, Browser Sources, alert media, queue, playback history, configuration, and backups remain on the user's computer unless the user exports or shares a file.

## Network requests

- Twitch OAuth, EventSub, Helix, chat, and Extension relay traffic occurs only after Twitch is configured and connected.
- GIPHY requests occur only after an API key is saved with Windows encryption and the user performs a search. Selected results are downloaded into local Studio media storage.
- National Weather Service requests occur only when a U.S. weather location is configured and a command using Local Weather is invoked.
- AzuraCast requests occur only when a Now Playing provider is configured and its status or command is used.
- Studio 0.20.0 has no crash-reporting or analytics service and does not automatically upload diagnostics.

## Credentials

Broadcaster OAuth tokens, chatbot OAuth tokens, Twitch Extension secrets, and the GIPHY API key are encrypted using the operating system's protected storage. They are excluded from Studio backups, Alert Packs, and diagnostics exports.

## Exported files

Alert Packs can contain alert HTML, CSS, JavaScript, and embedded media. Import only packs from trusted creators. Studio verifies embedded media hashes and warns before importing custom code.

Studio backups can contain channel commands, workflows, visual designs, provider URLs, and alert media. Diagnostics reports exclude credentials, account identities, viewer details, and full local file paths, but users should still inspect reports before sharing them publicly.
