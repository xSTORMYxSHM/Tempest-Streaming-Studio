# Tempest Streaming Studio 1.6.0 release audit

Date: 2026-10-02

## Result

Tempest Streaming Studio 1.6.0 passed the frozen-install, full workspace, production dependency, hosted Extension, signed packaging, integrity, and isolated-profile launch gates.

- Packaged source commit: `43ff8b477936995e5bebd4ca9b53393628a6eedd`
- `pnpm install --frozen-lockfile`: passed
- `pnpm check`: passed (139 tests, 0 failures)
- `pnpm audit --prod --audit-level=moderate`: passed (no known vulnerabilities)
- Hosted EBS and Twitch Extension preparation: passed (21 focused tests, 0 failures)
- Hosted Twitch ZIP: 14 required files, no credentials, official Signal origin, and all configured Twitch viewer paths present
- Signed packaged executable launch with a new isolated profile and independent loopback port: passed (`TEMPEST_STUDIO_SMOKE_OK`, exit code 0)
- Release verifier: passed (`TEMPEST_RELEASE_VERIFIED 1.6.0`)
- Electron fuse wire: `010011001`
- Signature coverage: 16 valid timestamped records across the installer, unpacked executable/native payload, and ZIP payload
- Expected embedded publisher: `CN=Garner Whitted, O=Garner Whitted, L=Seattle, S=wa, C=US`
- Twitch Extension package version: unchanged at `0.1.0`

## Release assets

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| `Tempest-Streaming-Studio-Setup-1.6.0-x64.exe` | 132,283,376 | `9fb4f3366df74c53b923c01af1068fbd00bcd52503b87b2784ff5a91f2a51cd2` |
| `Tempest-Streaming-Studio-Setup-1.6.0-x64.exe.blockmap` | 138,893 | `c23e9f3470aede4f66764a9c4196a8ed9ce365e012d1d3b43a9306a20f2755ba` |
| `latest.yml` | 385 | `440b2b7e1a29012e7928255e283dc266549f3c44ac89cfc438c2034b2434896b` |
| `Tempest-Streaming-Studio-1.6.0-x64.zip` | 166,216,275 | `3a1ab0b96c870ad1a4eff35c7e702dec37fe0f1eed05c3809776f9d120c1a072` |

The canonical checksum list is in `release/SHA256SUMS.txt`; complete signature details and the same artifact metadata are in `release/release-manifest.json`.

The independently versioned hosted Twitch bundle is `Tempest-Streaming-Extension-0.1.0-hosted.zip` (97,916 bytes, SHA-256 `8b7fb0c575a78585301a7b9e2ab45bf86ca2ccce661987878834d624f521a952`).

## Scope and compatibility

Version 1.6.0 completes the current Extension roadmap with reusable viewer groups, managed alert media, unified GIPHY and Alert Pack imports, full Panel Designer module controls, missing Twitch viewer surfaces, and hardened hosted deployment tooling.

The shared protocol remains version `1.0`; existing 1.5.x data, Browser Source URLs, and the approved Tempest Mainframe Extension remain compatible. Tempest Signal is configured to accept both the approved Mainframe signing secret and the Tempest Streaming test signing secret during the review transition.

Broadcast ownership of video, canvases, encoding, platform outputs, recording, and final audio levels is unchanged. Studio continues to own accounts, chat, viewer interactions, Browser Source overlays, and orchestration.

## Publication boundary

The Studio release includes the current no-Bits Extension assets and hosted upload bundle but does not publish a new Twitch-hosted Extension version automatically. Twitch Asset Hosting review and release remain controlled separately through the Twitch Developer Console.
