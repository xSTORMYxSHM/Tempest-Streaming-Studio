# Tempest Streaming Studio 1.7.3 release audit

Date: October 11, 2026

Status: public stable release published and updater feed verified

## Current result

The 1.7.3 source is committed and pushed at `cbc674f5d36de49dfd774d8990068d8cd435bbad`. The frozen workspace build and 167-test suite pass with zero failures. The Windows installer and portable payload were built from that source, timestamp-signed with the Tempest publisher certificate, hardened with the expected Electron fuse wire, and verified without private credentials or development-only files.

The packaged executable completed its hidden smoke test with exit code 0 using a fresh profile and isolated local Bridge port `48774`. It emitted `TEMPEST_STUDIO_SMOKE_OK`; stderr contained only Chromium GPU teardown messages after the success marker.

GitHub published `v1.7.3` as the latest non-draft, non-prerelease release with all six expected assets. The public stable updater feed returned HTTP 200 and advertised version `1.7.3` with `Tempest-Streaming-Studio-Setup-1.7.3-x64.exe` as its installation path.

## Included fixes

- Viewer-avatar floor disablement remains authoritative during startup and later viewer joins.
- Discord Guests gains expanded automatic arrangements plus precise manual snapping, alignment, position readouts, and keyboard nudging.
- Interactive Stage gains matching snapping, alignment, position readouts, and keyboard nudging for independent horizontal and portrait layouts.
- Paid Extension/Bits controls remain unavailable in the active product UI.

## Verification

- `pnpm install --frozen-lockfile`: passed.
- `pnpm check`: passed, 167 tests and 0 failures.
- Signed package verifier: `TEMPEST_RELEASE_VERIFIED 1.7.3`, hardened fuse wire `010011001`, all inspected executable and native payload signatures valid and timestamped.
- Packaged application smoke test: passed with exit code 0 using a fresh profile and `TEMPEST_BRIDGE_PORT=48774`.
- Studio/Broadcast protocol: remains `1.0`; Tempest Broadcast 1.5.0 compatibility is unchanged.
- Twitch companion packages: versions remain Mainframe `0.2.0` and Streaming `0.1.0`; no Twitch-hosted asset update or Railway deployment is required.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.7.3-x64.exe` | 135,008,712 | `2b742109de87d93a0d61eedcf6b001eb45f74d783ba18a900c8b905b07bfa68d` |
| `Tempest-Streaming-Studio-Setup-1.7.3-x64.exe.blockmap` | 141,750 | `53ba3f2df32df967dd41e7dbbc6195fe6e73518a66915e5bd30167f557fe6126` |
| `latest.yml` | 385 | `f644f4fc4cc294f5764742a10820a870c676cc4b28a63b99b543d4f83b302e9d` |
| `Tempest-Streaming-Studio-1.7.3-x64.zip` | 168,998,782 | `609401e1226b38b844515de5f3f674e5392cfafb77a2f3f32b414b2dfcbfc3ce` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` contain the canonical checksum, signature, and package records uploaded with the stable release.
