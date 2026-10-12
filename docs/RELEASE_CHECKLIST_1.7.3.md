# Tempest Streaming Studio 1.7.3 release checklist

Date: October 11, 2026

## Source and compatibility

- [x] Preserve protocol `1.0` and Tempest Broadcast 1.5.0 compatibility.
- [x] Preserve the independently versioned Twitch companion Extension packages.
- [x] Keep paid Extension/Bits controls out of the active product UI.
- [x] Keep all Browser Source traffic local to the streamer PC.
- [x] Preserve existing Studio settings, Discord guest profiles, and Stage Actor packs.

## Automated verification

- [x] Frozen dependency installation passes.
- [x] Complete workspace build and 167-test suite passes.
- [x] Avatar-floor persistence regressions pass.
- [x] Discord and Interactive Stage canvas-control regressions pass.
- [x] Signed Windows packaging and release verification pass.
- [x] Packaged executable starts with an isolated profile.

## Publication

- [x] Commit and push the exact release source.
- [x] Publish stable GitHub release `v1.7.3` with installer, blockmap, updater metadata, portable ZIP, checksums, and release manifest.
- [x] Confirm GitHub reports `v1.7.3` as the latest stable release.
- [x] Confirm the stable updater feed advertises 1.7.3 and its signed installer.
