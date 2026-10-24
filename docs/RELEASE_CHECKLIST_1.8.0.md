# Tempest Streaming Studio 1.8.0 release checklist

Date: October 24, 2026

## Source and compatibility

- [x] Preserve protocol `1.0` and Tempest Broadcast 1.5.0 compatibility.
- [x] Keep video outputs, encoders, canvases, recording, and final audio routing owned by Broadcast.
- [x] Preserve active Twitch, alert, chatbot, dice, Discord guest, and companion settings.
- [x] Leave retired Streamworld and Kick data on disk instead of deleting user files during upgrade.
- [x] Keep Tempest Mainframe `0.2.1` and Tempest Streaming `0.1.1` independently versioned.

## Automated verification

- [x] Complete workspace build succeeds.
- [x] Complete 168-test workspace suite passes with zero failures.
- [x] UI audit finds no duplicate IDs or broken navigation destinations.
- [ ] Signed Windows installer and portable ZIP pass release verification.
- [ ] Packaged executable starts with an isolated profile.

## Publication

- [ ] Commit and push the exact 1.8.0 release source.
- [ ] Publish stable GitHub release `v1.8.0` with installer, blockmap, updater metadata, portable ZIP, checksums, release manifest, release notes, privacy notice, installation guide, and third-party notices.
- [ ] Confirm GitHub reports `v1.8.0` as the latest stable release.
- [ ] Confirm the stable updater feed advertises 1.8.0 and its signed installer.
