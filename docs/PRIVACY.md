# Privacy and local-data boundary

Tempest Streaming Studio is local-first. Its authenticated control service, Browser Sources, alert media, queue, playback history, configuration, and backups remain on the user's computer unless the user exports or shares a file.

## Network requests

- Twitch OAuth, EventSub, Helix, chat, and Extension relay traffic occurs only after Twitch is configured and connected.
- Opening Stream Together loads Twitch Backstage directly from `twitch.tv` in a dedicated Studio browser session. Camera and microphone permission is granted only to secure Twitch origins; screen sharing always requires a source selection. Twitch receives the selected live media under its own privacy terms.
- GIPHY requests occur only after an API key is saved with Windows encryption and the user performs a search. Selected results are downloaded into local Studio media storage.
- National Weather Service requests occur only when a U.S. weather location is configured and a command using Local Weather is invoked.
- AzuraCast requests occur only when a Now Playing provider is configured and its status or command is used.
- Updater-enabled Studio releases request public release metadata from the official GitHub repository shortly after launch, every six hours while running, and when the user selects **Check for Updates**. No Twitch credentials, Studio settings, diagnostics, or streamer data are included. Update installers download only after the user approves them.
- When the user confirms **Prepare HTTPS** for local Twitch Extension testing, Studio downloads the pinned mkcert 1.4.4 Windows helper from its official GitHub release and verifies its exact SHA-256 digest before execution. The resulting local CA, CA private key, and localhost certificate remain only in Studio's local data and are excluded from backups and diagnostics. **Remove HTTPS** removes that local trust material and helper.
- During an active Studio poll, the free Twitch Extension uses Twitch's signed numeric user identity to enforce one vote per account across Extension and Twitch chat. Voter identifiers and individual choices remain in memory only for the current poll; the public catalog contains the question and aggregate totals, and clearing the poll discards its voter map.
- Tempest Streaming Extension 3D Dice requests carry the Twitch-signed viewer identity and selected public die preset through the hosted relay. Studio retains only short-lived in-memory cooldown timestamps and session roll history; the hosted service does not generate or store dice results.
- A free viewer-placeable interaction carries only the Twitch-signed viewer identity and normalized `x`/`y` position through the hosted relay. The coordinate is bounded from 0 through 1, used for that interaction dispatch, and is not added to the hosted installation catalog.
- Enabled Studio counter labels, command names, and aggregate values may be published in the Tempest Streaming Extension catalog. No per-viewer counter history or counter mutation capability is published.
- The active stream goal's title, type, current and target values, unit, and display color may be published in the Tempest Streaming Extension catalog. Local goal previews are excluded, and the public service exposes no goal mutation capability.
- When the optional Now Playing provider is configured, its station name, public artist/title/text/album metadata, availability, last-check time, and public listen-page URL may be published in the Tempest Streaming Extension catalog. The provider API URL and direct audio stream URL remain in Studio and are not published.
- The optional next Twitch schedule segment title and start time may be published in the Tempest Streaming Extension catalog. The Extension receives no schedule mutation capability or additional OAuth credential.
- Enabled Chatbot trigger names, up to five aliases, required roles, and Shared Chat availability may be published in the Tempest Streaming Extension command directory. Reply text, workflow assignments, cooldown history, and disabled commands remain local.
- Public Twitch live/offline state, stream title, category, start time, current viewer count, and last-check time may be published in the Tempest Streaming Extension catalog. The card reuses the Chatbot's existing authorization and caches and cannot change Twitch stream information.
- Studio has no crash-reporting or analytics service and does not automatically upload diagnostics.

## Managed media library

Importing alert media through Studio copies the selected file into the local Media Library and records its file name, size, format, source tag, and SHA-256 content hash in the local registry. The hash is calculated as a stream rather than loading the complete file into memory. GIPHY selections and verified Alert Pack media use this same local store. **Adopt Assigned Media** reads only media URIs currently present in the local Interaction Alert or Twitch Alert configuration, rejects unrelated paths, and updates an alert only after its managed copy is ready. Library files and metadata are never uploaded to Tempest Signal or the Twitch Extension. Removing an unused item deletes only Studio's managed copy; Studio does not alter or delete the original selected file. Managed items are included in an exported Studio backup, subject to its media-size limits.

## Public Twitch Extension service

Pairing the public Twitch Extension is optional. During pairing, Studio sends the broadcaster's current Twitch OAuth access token to the Tempest Extension Backend Service over HTTPS. The service sends that token to Twitch's validation endpoint to verify the broadcaster account and approved application, then discards it without storing it.

If you replace the built-in Tempest Signal address with a custom or self-hosted service, that operator receives the OAuth access token and is not covered by Tempest's service controls. Studio displays a native confirmation naming the destination before sending the token.

The hosted service stores the broadcaster's numeric Twitch channel ID and login, an optional linked Kick user ID and username, a random installation ID, a one-way hash of the issued relay credential, pairing/update timestamps, the no-Bits Extension edition marker, and the viewer-safe signal catalog published by Studio. The stored catalog contains labels, identifiers, timing, display colors, placement behavior, and configured access-control Twitch user IDs; it does not contain local media, file paths, OAuth tokens, client secrets, or application credentials. Viewer catalog responses never include the raw allow-list or block-list IDs: the service returns only the requesting viewer's eligibility and omits locked items marked hidden. Selecting **Revoke Installation** in Studio deletes the hosted installation record and its catalog. Studio normalizes any legacy saved Bits marker to the active no-Bits edition before relay connection.

Reusable viewer-group names and Twitch login rosters are stored only in the local Studio Chatbot configuration. Studio resolves those logins to numeric Twitch IDs with the connected bot account and publishes the resolved IDs as the interaction's ordinary access list; Tempest Signal does not receive the local group name or login roster, and viewers do not receive any raw member IDs.

Twitch-signed viewer JWTs, opaque viewer identifiers, and request identifiers are processed to authenticate, rate-limit, and deduplicate interactions. They are held in bounded service memory for the active request/replay window and are not written to the installation database. Tempest Streaming Extension has no Bits or payment flow.

The optional, separately installed Tempest Bits Extension uses Twitch's Bits product and transaction APIs. Immediately before Twitch's confirmation dialog, Tempest Signal temporarily processes the viewer's numeric Twitch user ID, selected product, access eligibility, cooldown state, and optional normalized screen position in a short-lived in-memory reservation. After a viewer confirms a Bits interaction in Twitch, Tempest Signal receives the Twitch-signed transaction receipt and processes the viewer's numeric Twitch user ID, product SKU, Bits amount, transaction ID, and timestamp to verify the transaction, prevent replay, and route the configured interaction to the broadcaster's connected Studio. Tempest Signal does not receive payment-card or billing details. Reservations and verified receipt data are held only in bounded service memory during their active request/replay windows and are not written to the installation database. Twitch controls the Bits balance and transaction UI under Twitch's own terms and privacy practices.

## Credentials

Broadcaster OAuth tokens, chatbot OAuth tokens, the Kick client secret and OAuth tokens, local Twitch Extension secrets, hosted Extension relay credentials, and the GIPHY API key are encrypted using the operating system's protected storage. The separate Bits Extension shared secret is configured only on the hosted EBS and is never included in the browser package or Studio. The separate Kick stream key used for video simulcast is sent once over the authenticated loopback Bridge and encrypted by Tempest Broadcast with Windows Data Protection; Studio does not store it or receive it back in status. Credentials are excluded from Studio backups, Alert Packs, and diagnostics exports. The hosted service stores only the relay credential's SHA-256 hash and validates—but does not retain—the Kick access token used while linking an account.

Stream Together uses a separate persistent Electron browser partition so its Twitch sign-in survives closing the call window without sharing cookies with Studio's control renderer or the temporary Chatbot authorization window. Those Twitch-managed cookies and site storage remain in the local Studio profile and are not included in Studio backups or diagnostics.

## Discord guest library

Discord Guests stores detected participant User IDs, usernames, display names, Discord avatar URLs, last-seen channel/server labels and timestamps, and streamer-assigned design settings in the local Studio data directory. This allows guest images to be prepared and edited while that person is offline. The library is included in Studio backups and is never uploaded by Studio. **Forget User** removes one saved entry; the person will be remembered again if Discord later reports them in the selected voice channel. Discord messages are never read or stored, and offline saved guests are never rendered in the live Browser Source.

## Exported files

Alert Packs can contain alert HTML, CSS, JavaScript, and embedded media. Import only packs from trusted creators. Studio verifies embedded media hashes and warns before importing custom code.

Studio backups can contain channel commands, workflows, visual designs, provider URLs, and alert media. Diagnostics reports exclude credentials, account identities, viewer details, and full local file paths, but users should still inspect reports before sharing them publicly.

## Privacy Shield while streaming

Privacy Shield is enabled by default. Its in-app masking layer replaces streamer-sensitive values with fixed `HIDDEN` blocks, including Twitch and chatbot identities, activation codes, client/channel IDs, channel-point mappings, weather coordinates, station/provider settings, local service endpoints, and Twitch Alert, Interaction Alert, Twitch Experiences, Chat Overlay, Emote Wall, and 3D Dice Browser Source URLs. The quick top-bar control toggles masking; Settings exposes the complete controls.

Third-party Emote Wall providers are disabled by default. Enabling 7TV, BetterTTV, or FrankerFaceZ authorizes Studio to send the broadcaster's public numeric Twitch channel ID to that provider to resolve channel emotes. Studio validates provider hosts and proxies approved image bytes through its loopback-only Bridge; the Broadcast browser source does not connect directly to those provider CDNs.

On Windows, Studio also requests operating-system capture protection for the main Studio window, the Stream Together call window, and isolated Twitch sign-in windows. Capture exclusion depends on the capture method and Windows compositor support, so it is not a substitute for the masking layer. A full-display capture may still include a Studio window, but sensitive fields remain masked while Privacy Shield is active.

AutoMod allowlists and blocked-term lists are local configuration and are masked in Studio while Privacy Shield is active. They are included in Studio backups but excluded from redacted diagnostics.
