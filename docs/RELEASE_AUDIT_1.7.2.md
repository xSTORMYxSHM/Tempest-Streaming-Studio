# Tempest Streaming Studio 1.7.2 release audit

Date: October 10, 2026
Status: public stable release published and updater feed verified

## Current result

The 1.7.2 hotfix source is committed and pushed at `fa69082`. The frozen workspace build and 167-test suite pass with zero failures. The Windows installer and portable payload were built from that source, timestamp-signed with the Tempest publisher certificate, hardened with the expected Electron fuse wire, and verified without private credentials or development-only files.

The packaged executable completed its hidden smoke test with exit code 0 using a fresh profile and isolated local Bridge port while Tempest Broadcast 1.5.0 remained open.

GitHub published `v1.7.2` as the latest non-draft, non-prerelease release with all six expected assets. The public stable updater feed returned HTTP 200 and advertised version `1.7.2` with `Tempest-Streaming-Studio-Setup-1.7.2-x64.exe` as its installation path.

## Included fixes

- The Unified Stage loads Interactive Stage from the alternate loopback hostname, preserving local-only traffic while preventing OBS/CEF from dropping the nested compositor surface.
- Stage Actor atlas, palette-mask, and motion-rig requests use one revision per Browser Source session, and actor files are served with no-store cache headers so OBS cannot reuse stale avatar graphics.
- The real Tempest Broadcast canvas was verified with a transparent background, five full-color viewer avatars on the default floor, and an active poll rendered together.

## Verification

- `pnpm install --frozen-lockfile`: passed.
- `pnpm check`: passed, 167 tests and 0 failures.
- Signed package verifier: `TEMPEST_RELEASE_VERIFIED 1.7.2`, hardened fuse wire `010011001`, all inspected executable and native payload signatures valid and timestamped.
- Packaged application smoke test: passed with exit code 0 using a fresh profile and `TEMPEST_BRIDGE_PORT=48773`.
- Studio/Broadcast protocol: remains `1.0`; Tempest Broadcast 1.5.0 compatibility is unchanged.
- Twitch companion packages: versions remain Mainframe `0.2.0` and Streaming `0.1.0`; no Twitch-hosted asset update or Railway deployment is required for this desktop hotfix.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.7.2-x64.exe` | 135,005,536 | `b019e34f0d7a26fe890ff714d19bb1c84335e1f6b2693dd0dc75ae64ecf69727` |
| `Tempest-Streaming-Studio-Setup-1.7.2-x64.exe.blockmap` | 141,204 | `428a19da23e0c832d4d772fb9cda22c75fda1ce80522077b4c50be3e7afd4964` |
| `latest.yml` | 385 | `852f5663c03d94f4e4e6d51972f267ecaa9f52800f121006f7bea2b576a19f06` |
| `Tempest-Streaming-Studio-1.7.2-x64.zip` | 168,994,095 | `1813452e2c6141035bd473688d43e04047878017bd04622ed0a453ddd0f556f5` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` contain the canonical checksum, signature, and package records uploaded with the stable release.
