# Tempest Streaming Studio 1.7.2 release checklist

Date: October 10, 2026

## Source and compatibility

- [x] Preserve protocol `1.0` and Tempest Broadcast 1.5.0 compatibility.
- [x] Preserve the independently versioned Twitch companion Extension packages.
- [x] Keep all Browser Source traffic local to the streamer PC.
- [x] Preserve existing Studio settings and Stage Actor packs.

## Automated verification

- [x] Frozen dependency installation passes.
- [x] Complete workspace build and 167-test suite passes.
- [x] Unified Stage origin-isolation and alpha regressions pass.
- [x] Stage Actor cache-header and session-revision regressions pass.
- [x] Signed Windows packaging and release verification pass.
- [x] Packaged executable starts with an isolated profile.

## Publication

- [x] Commit and push the exact release source.
- [ ] Publish stable GitHub release `v1.7.2` with installer, blockmap, updater metadata, portable ZIP, checksums, and release manifest.
- [ ] Confirm GitHub reports `v1.7.2` as the latest stable release.
- [ ] Confirm the stable updater feed advertises 1.7.2 and its signed installer.
