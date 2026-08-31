# 1.0.0 release checklist

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
- [ ] Offline use, disconnected optional integrations, missing media, and provider outages show recoverable errors.
- [ ] Keyboard navigation, Windows scaling, reduced-motion preference, and 1080p/1440p layouts are reviewed.

## Publication gates

- [x] Confirm publisher and license choice: Storm Horizon Media, GPLv3 software, separate trademark policy.
- [x] Code-sign and timestamp the installer, uninstaller, elevation helper, desktop executable, and native DLL payload with the expected Azure Artifact Signing publisher.
- [ ] Publish checksums, changelog, privacy notice, installation guide, and third-party notices with the release.
- [ ] Verify the public Twitch Extension and hosted EBS separately before advertising viewer-panel availability.

## Updater-enabled release gates

- [ ] Build and Azure-sign the versioned NSIS installer before creating the GitHub release.
- [ ] Confirm `latest.yml` names that exact installer version and includes its SHA-512 digest and size.
- [ ] Upload `latest.yml` and the matching `.exe.blockmap` beside the signed installer, portable ZIP, checksums, and release manifest.
- [ ] Publish as a stable, non-draft GitHub release; prereleases are intentionally ignored by Studio.
- [ ] From the previous installed version, check, download, verify, restart, migrate data, and confirm the new version in **Settings + About**.
