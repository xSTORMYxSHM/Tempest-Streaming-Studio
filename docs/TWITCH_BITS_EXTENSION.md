# Tempest Bits Extension

Tempest's Bits experience is a second Twitch Extension. It does not change the already-approved free Extension and uses a separate Twitch client ID and shared secret.

## Studio edition selection

In Studio, open **Twitch** and choose the Extension installed on the channel:

- **Tempest Mainframe (Free)** enables the existing free viewer interaction routes and disables Bits product and transaction routes for that channel.
- **Tempest Streaming (Bits)** enables only the separately installed Bits Extension routes. Twitch-signed products must still match the server-side SKU, amount, and published Studio interaction.

The choice is saved in `twitch-extension-edition.json`, included in Studio backups, and published to Tempest Signal with the channel's viewer-safe catalog. Existing installations default to the Free edition. Changing the selection updates the relay without exposing either Extension secret, and the inactive Extension receives an `EXTENSION_EDITION_INACTIVE` response.

## Supported surfaces

- **Video Overlay** — `video_overlay.html`, transparent across the player with a compact expandable deck.
- **Video Component** — `video_component.html`, compact in-player interaction UI.
- **Panel** — `panel.html`, the full channel-panel layout below the stream.
- **Mobile** — `mobile.html`, a single-column touch layout.
- **Configuration** — `config.html`, broadcaster setup guidance.

Build with `pnpm extension:bits:build`. For a no-charge visual preview, set `TEMPEST_BITS_EXTENSION_MOCK_MODE=1` before building. Do not submit the development SKUs in `mock-products.json`; they exist only to exercise the layouts locally.

## Twitch console setup

Create a new Extension in the Twitch developer console, complete monetization onboarding, enable Bits, and configure each product there. SKU values are immutable once saved, so choose the final naming scheme before creating production products. Point each Twitch surface at the matching file listed above and add `https://signal.tempestmainframe.com` to the allowlist for URL fetching.

The live legal links are:

- Privacy policy: `https://tempestmainframe.com/legal#privacy`
- Terms of use: `https://tempestmainframe.com/legal#terms`

## EBS configuration

Configure the hosted EBS with all three values:

```text
TEMPEST_BITS_EXTENSION_CLIENT_ID=<new-extension-client-id>
TEMPEST_BITS_EXTENSION_SECRETS=<base64-shared-secret>
TEMPEST_BITS_PRODUCT_ACTIONS={"tempest.storm-pulse.50":{"action":"tempest.storm-pulse","bits":50}}
```

Each mapped action must be published by the broadcaster's connected Studio as an `interaction` catalog item. Paid products cannot target a `sound-alert` item. The viewer UI intersects Twitch's live product list with the server-side mapping, and hides any SKU whose amount or Studio action does not match.

While a Bits surface is visible, it refreshes eligibility and cooldown state every five seconds. The EBS gives each viewer-specific catalog an ETag, so an unchanged refresh returns `304 Not Modified` without a response body or DOM rebuild. Twitch product metadata is cached in the surface for 60 seconds; authorization and Twitch Bits feature changes invalidate that cache immediately. These optimizations do not cache reservations, purchase dialogs, or signed transaction validation.

Studio's Viewer Interactions catalog supports stickers, GIFs, jumpscares, screen effects, sounds, counter changes, community actions, and future interaction types. Every item can have separate per-viewer and global cooldowns. Access can be open, staff-only, limited to assigned creators, or limited to explicit Twitch user IDs, with an additional block list. Locked products can either remain visible with a reason or be hidden from ineligible viewers. Viewer-placeable items collect a normalized click/tap position before the Bits dialog; Studio applies that position to its local visual and includes it in the Broadcast lifecycle payload for landscape and linked portrait output.

## Transaction boundary

Before opening Twitch's Bits dialog, the browser requests a short-lived reservation. The EBS checks the signed viewer identity, access policy, active cooldowns, product mapping, Studio connection, and optional placement. The reservation lasts two minutes and prevents another request from taking the same global cooldown slot while Twitch asks the viewer to confirm. It is not proof of payment and cannot activate an interaction.

After confirmation, the browser submits Twitch's signed transaction receipt with that reservation. The EBS verifies the Bits Extension JWT and receipt signature, receipt topic, Extension domain, expiry, Twitch user, SKU, amount, channel installation, reservation, and published interaction before relaying anything to Studio. The Twitch transaction ID becomes the idempotency key so a repeated receipt cannot activate the interaction twice within the receipt-processing window. Cooldowns begin only after Studio accepts the verified interaction.

Before a monetary production launch, move transaction IDs and accepted interactions to durable shared storage if the EBS will run with multiple instances, can restart while receipts remain valid, or must recover delivery after Studio disconnects. The UI disables products while Studio reports offline, but the final service still needs durable delivery for the race where Studio disconnects after Twitch confirms the transaction. The current in-memory replay cache is suitable for development and a single-process test deployment, but is not the final accounting boundary for a scaled service.

The single-process service bounds its in-memory rate-limit and cooldown identity maps at 50,000 entries each, discards cooldown entries after the maximum supported 24-hour window, and caps simultaneous two-minute reservations at 50,000. Reservation and transaction endpoints have independent per-viewer and per-channel sliding-window limits in addition to the dispatch limit. Capacity exhaustion rejects a new reservation before Twitch opens the Bits dialog; it never evicts an active purchase reservation.

Bits products must activate permitted broadcaster/community experiences. Do not market them as donations, purchases, spending, cheering, or use them as a jukebox for a specific musical or audiovisual work. Keep the Extension JavaScript readable and keep audio off unless a viewer explicitly controls it.
