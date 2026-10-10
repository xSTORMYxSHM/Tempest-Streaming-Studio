# Current roadmap

Status: **Complete as of October 2, 2026**

This roadmap covers the development pivot from two selectable Twitch Extension editions to one primary, no-purchase **Tempest Streaming Extension**. Twitch Developer Console publication and a live Railway deployment are release operations, not unfinished application features.

## 1. Primary Extension pivot — complete

- Tempest Streaming Extension is the only edition shown or selectable in Studio.
- Legacy saved `bits` selections normalize to the primary edition before connecting.
- The dormant Bits prototype remains isolated in source for possible future onboarding and is not production-advertised.
- Internal `free|bits` values remain stable only as a compatibility surface for saved data and hosted messages.

## 2. Viewer access and interaction safety — complete

- Interactions support per-viewer and global cooldowns, staff, assigned-creator, named viewer-group, specific-viewer, and block-list rules.
- Twitch identities are resolved locally and raw membership lists are not returned in viewer catalogs.
- Tempest Signal enforces access before relay; Studio independently enforces it again before queuing work.

## 3. Streamer media ownership — complete

- The Media Library imports audio, images, GIFs, and video into checksum-addressed Studio storage.
- Alert files, GIPHY downloads, and verified Alert Pack media use the same catalog.
- Older assignments can be adopted explicitly; originals are never modified.
- In-use media cannot be removed, and unassigned managed media remains portable in Studio backups.

## 4. Media organization and runtime cost — complete

- Search, tags, collections, favorites, usage references, lazy visual previews, and single-instance audio preview are implemented.
- Identical files deduplicate without duplicating storage.
- Preview media does not load until requested, keeping the always-open Studio workspace lightweight.

## 5. Hosted boundary and upload preparation — complete

- Railway builds a production-only, non-root EBS image with `/health` coverage.
- `pnpm run hosted:prepare` rebuilds and tests the EBS and Extension, locks the official Signal origin, packages the Twitch upload ZIP, and writes a SHA-256 manifest.
- CI validates the hosted boundary on Linux and builds the exact Railway Docker image without production secrets.

## 6. Completion gates — complete

- Active UI, service errors, and current documentation use Tempest Streaming Extension naming.
- Full workspace tests, hosted preparation tests, secret scans, and a pruned-runtime health probe pass.
- Railway deployment and Twitch upload remain deliberate publication steps so development work cannot silently change live service state.

## Publication handoff

1. Push the reviewed commits and let both CI jobs pass.
2. Deploy the root Dockerfile to the existing Railway service and verify its public `/health` response.
3. Run `pnpm run hosted:prepare` from the publication commit.
4. Compare the generated manifest hash with the ZIP selected in Twitch Developer Console.
5. Use Hosted Test before requesting Twitch review or releasing the Extension publicly.
