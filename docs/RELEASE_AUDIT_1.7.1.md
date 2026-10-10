# Tempest Streaming Studio 1.7.1 release audit

Date: October 10, 2026
Status: signed candidate verified; stable updater publication pending

## Current result

The 1.7.1 patch source is committed and pushed at `2505932`. The frozen workspace build and 167-test suite pass with zero failures. The Windows installer and portable payload were built from that source, timestamp-signed with the Tempest publisher certificate, hardened with the expected Electron fuse wire, and verified without private credentials or development-only files.

The packaged executable completed its hidden smoke test with exit code 0 using a fresh profile and isolated local Bridge port while the installed 1.7.0 application remained open.

## Included fixes

- Unified Stage child documents no longer force Chromium's opaque dark backing surface. The composed 1280 by 720 alpha regression changed from 921,600 opaque pixels before the fix to zero opaque pixels after it; only intended rendered content contributes translucent pixels.
- Interaction Alerts and Twitch Alerts can opt into a Tempest2D expression. Create, edit, import, persistence, preview, workflow dispatch, lease duration, and automatic release paths are covered by the Bridge and Studio tests.
- Streamer Mode and Advanced Mode persist immediately when their checkbox changes. The explicit Save Interface control remains available.

## Verification

- `pnpm install --frozen-lockfile`: passed.
- `pnpm check`: passed, 167 tests and 0 failures.
- Signed package verifier: `TEMPEST_RELEASE_VERIFIED 1.7.1`, hardened fuse wire `010011001`, all inspected executable and native payload signatures valid and timestamped.
- Packaged application smoke test: passed with exit code 0 using a fresh profile and `TEMPEST_BRIDGE_PORT=48766`.
- Studio/Broadcast protocol: remains `1.0`; Tempest Broadcast 1.5.0 compatibility is unchanged.
- Twitch companion packages: versions remain Mainframe `0.2.0` and Streaming `0.1.0`; no Twitch-hosted asset update is required for this desktop patch.

## Signed artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.7.1-x64.exe` | 135,004,928 | `62ec05453868c5a5fecc5a81ecc92a657e03a5e70a23aca0a4b507c4fe62d759` |
| `Tempest-Streaming-Studio-Setup-1.7.1-x64.exe.blockmap` | 141,880 | `0736db14c2958a9ab1d0bacc3db398ef13664b0e0b8ef1131fe38ef36df60678` |
| `latest.yml` | 385 | `c2242706318db4eafc72a5cd3f98061eaf459fb334da862d416d36ff64ace2c4` |
| `Tempest-Streaming-Studio-1.7.1-x64.zip` | 168,994,158 | `66fedf31956a9130a4e14acf8912e7a7e51e65c30c30564006dee55c9597f118` |

`release/SHA256SUMS.txt` and `release/release-manifest.json` contain the canonical checksum, signature, and package records uploaded with the stable release.
