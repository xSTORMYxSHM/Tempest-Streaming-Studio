# 1.4.0 release checklist

## Automated gates

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm check`
- [x] `pnpm package:win`
- [x] Packaged executable smoke test exits 0 with a new isolated profile.
- [x] NSIS and ZIP artifacts pass checksum generation and release verification.
- [x] Secret/path scan passes for source and packaged resources.

## Manual clean-install gates

- [ ] Windows installer starts and uninstalls on a non-developer account.
- [ ] Guided Setup defaults to 1920 × 1080 and no personal Twitch, station, location, bot, or companion-app values appear.
- [ ] Twitch and Interaction Browser Sources connect independently and each reports one client.
- [ ] Twitch and Interaction audio can be routed to separate OBS tracks.
- [ ] Multiple alerts remain FIFO and Emergency Restore clears queued playback.
- [ ] Backup/restore succeeds, reconnects are clearly requested, and pre-restore snapshot exists.
- [ ] Upgrade from 0.11.x preserves credentials, alerts, media, commands, ultrawide canvas, station, and weather settings.
- [ ] Kick Client Secret and OAuth tokens are Windows-encrypted, excluded from backups/diagnostics, and removed on disconnect.
- [ ] Kick stream key is Windows-encrypted inside Broadcast, is never returned through Bridge status, and is excluded from Studio backups/diagnostics.
- [ ] Simulcast readiness blocks Go Live when Twitch, Dual Format, Kick destination, secure storage, or configured upload headroom is not ready.
- [ ] Local simulcast preflight runs only while off-air, expires after four hours, and is invalidated by Broadcast restart and output/Dual Format changes.
- [ ] The session-only operator checklist gates Go Live, clears with the Studio window, and is never persisted to profile data.
- [ ] Kick output failure leaves Twitch live; Stop Kick Only and Emergency Stop All Outputs behave independently and predictably.
- [ ] Retry Kick recreates only the Kick output while Twitch remains uninterrupted.
- [ ] Studio's live-operations clock follows Twitch state, delayed Broadcast telemetry is warned after 15 seconds and treated as lost after 30 seconds, and the incident timeline clears when the Studio window closes.
- [ ] Kick OAuth callback accepts loopback requests only; hosted webhook rejects invalid, stale, or mismatched signatures.
- [ ] Twitch and Kick messages share the Collaboration Center, while replies and reply IDs remain platform-local.
- [ ] Connect a Dual Format-capable Broadcast build and confirm Studio reports Enhanced Broadcasting, the selected 9:16 canvas, scene links, and audio routing.
- [ ] Confirm Studio blocks Dual Format configuration while live and that vertical preview does not start an output.
- [ ] Verify Twitch's horizontal and vertical previews in Stream Manager and on a physical phone.
- [ ] Offline use, disconnected optional integrations, missing media, and provider outages show recoverable errors.
- [ ] Keyboard navigation, Windows scaling, reduced-motion preference, and 1080p/1440p layouts are reviewed.

## Publication gates

- [x] Confirm publisher and license choice: Storm Horizon Media, GPLv3 software, separate trademark policy.
- [x] Code-sign and timestamp the installer, uninstaller, elevation helper, desktop executable, and native DLL payload with the expected Azure Artifact Signing publisher.
- [x] Publish checksums, changelog, privacy notice, installation guide, and third-party notices with the release.
- [ ] Verify the public Twitch Extension and hosted EBS separately before advertising viewer-panel availability.

## Updater-enabled release gates

- [x] Build and Azure-sign the versioned NSIS installer before creating the GitHub release.
- [x] Confirm `latest.yml` names that exact installer version and includes its SHA-512 digest and size.
- [x] Upload `latest.yml` and the matching `.exe.blockmap` beside the signed installer, portable ZIP, checksums, and release manifest.
- [x] Publish as a stable, non-draft GitHub release; prereleases are intentionally ignored by Studio.
- [ ] From 1.3.1, check, download, verify, restart, migrate data, and confirm version 1.4.0 in **Settings + About**.
- [x] Configure an Authenticode signing identity before running `pnpm package:win`; the release verifier rejects unsigned installers and application executables. Use `pnpm package:win:unsigned` only for local unsigned packaging tests.
