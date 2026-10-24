# Tempest Streaming Studio 1.7.4 release checklist

Date: October 23, 2026

## Source and compatibility

- [x] Preserve protocol `1.0` and Tempest Broadcast 1.5.0 compatibility.
- [x] Preserve explicitly saved avatar, pet, dice, Extension placement, and Stage settings.
- [x] Keep Browser Source traffic local to the streamer PC.
- [x] Keep Tempest Mainframe `0.2.1` and Tempest Streaming `0.1.1` independently versioned.
- [x] Keep reviewer-only documents outside both Twitch Asset Hosting ZIPs.

## Automated verification

- [x] Frozen dependency installation passes.
- [x] Complete workspace build and test suite passes (173 tests).
- [x] Twitch Mainframe and Streaming production packages pass verification.
- [x] Signed Windows packaging and release verification pass.
- [x] Packaged executable starts with an isolated profile on Bridge port `48775`.

## Publication

- [x] Commit and push the exact release source (`48b2730`).
- [x] Publish stable GitHub release `v1.7.4` with installer, blockmap, updater metadata, portable ZIP, checksums, and release manifest.
- [x] Attach both independently versioned Twitch upload ZIPs and reviewer guides.
- [x] Confirm GitHub reports `v1.7.4` as the latest stable release.
- [x] Confirm the stable updater feed advertises 1.7.4 and its signed installer.
