# Tempest Streaming Studio 1.7.1 release checklist

Date: October 10, 2026

## Source and compatibility

- [x] Preserve protocol `1.0` and Tempest Broadcast 1.5.0 compatibility.
- [x] Preserve the independently versioned Twitch companion Extension packages.
- [x] Keep the Unified Stage transparency change local to Browser Source document composition.
- [x] Keep Tempest2D routing opt-in for each alert.
- [x] Preserve existing Warudo, VTube Studio, Broadcast, sound, and visual alert routes.

## Automated verification

- [x] Frozen dependency installation passes.
- [x] Complete workspace build and 167-test suite passes.
- [x] Unified Stage alpha regression passes.
- [x] Tempest2D create, update, persistence, preview-routing, lease, and release tests pass.
- [ ] Signed Windows packaging and release verification pass.
- [ ] Packaged executable starts with an isolated profile.

## Publication

- [ ] Commit and push the exact release source.
- [ ] Publish stable GitHub release `v1.7.1` with installer, blockmap, updater metadata, portable ZIP, checksums, and release manifest.
- [ ] Confirm GitHub reports `v1.7.1` as the latest stable release.
- [ ] Confirm the installed 1.7.0 updater discovers 1.7.1.
